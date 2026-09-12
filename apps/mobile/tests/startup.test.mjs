import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM, ResourceLoader, VirtualConsole } from 'jsdom';

// Execute the shipped React/Expo Router bundle. Mock only service responses;
// mocking the router would miss the post-sign-in navigation/remount loop.
const require = createRequire(import.meta.url);
const mobileRoot = resolve(import.meta.dirname, '..');
const origin = 'http://localhost:4173';
let exportRoot = process.env.VAD_STARTUP_EXPORT_DIR;
let html;

before(async () => {
  if (!exportRoot) {
    exportRoot = await mkdtemp(join(tmpdir(), 'vad-startup-'));
    const expo = join(dirname(require.resolve('expo/package.json')), 'bin/cli');
    execFileSync(process.execPath, [expo, 'export', '--platform', 'web', '--output-dir', exportRoot], {
      cwd: mobileRoot,
      env: {
        ...process.env, CI: '1', EXPO_NO_DOTENV: '1',
        EXPO_PUBLIC_SUPABASE_URL: origin,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_test',
      },
      stdio: 'pipe', timeout: 120_000,
    });
  }
  html = await readFile(join(exportRoot, 'index.html'), 'utf8');
});

after(async () => {
  if (!process.env.VAD_STARTUP_EXPORT_DIR && exportRoot) await rm(exportRoot, { recursive: true });
});

class LocalAssets extends ResourceLoader {
  fetch(url) {
    const parsed = new URL(url);
    assert.equal(parsed.origin, origin, 'Tests must not load remote assets');
    const path = resolve(exportRoot, '.' + decodeURIComponent(parsed.pathname));
    assert.ok(path.startsWith(resolve(exportRoot) + sep));
    return readFile(path);
  }
}

const testUser = {
  id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
  email: 'startup-test@example.invalid', created_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: 'Startup test' },
};

function testSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: testUser.id, exp: expiresAt })}.test`,
    refresh_token: 'local-fixture', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user: testUser,
  };
}

async function openApp(t, { path = '/', signedIn = true, accepted = false, tour = false, policyFailure = null } = {}) {
  const fixture = { accepted, policyFailure, requests: [], errors: [] };
  const output = new VirtualConsole();
  output.on('error', (...args) => fixture.errors.push(args.map(String).join(' ')));
  output.on('jsdomError', error => fixture.errors.push(error.message));
  const dom = new JSDOM(html, {
    url: origin + path, runScripts: 'dangerously', resources: new LocalAssets(),
    pretendToBeVisual: true, virtualConsole: output,
    beforeParse(window) {
      Object.assign(window, {
        Headers, Request, Response, AbortController, TextEncoder, TextDecoder,
        matchMedia: query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
        ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
        IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
        scrollTo() {}, innerWidth: 360, innerHeight: 740,
        async fetch(input, init) {
          const url = new URL(typeof input === 'string' ? input : input.url);
          assert.equal(url.origin, origin, 'Tests must not call live services');
          const name = url.pathname.split('/').at(-1);
          fixture.requests.push(name);
          const respond = (value, status = 200) => new Response(JSON.stringify(value), {
            status, headers: { 'Content-Type': 'application/json' },
          });
          if (name === 'my_legal_policy_state') {
            if (fixture.policyFailure === 'timeout') return new Promise(() => {});
            if (fixture.policyFailure) return respond({ code: 'TEST', message: 'Test policy service unavailable' }, 503);
            return respond({
              enforcementReady: true, requiresAcceptance: !fixture.accepted,
              documents: ['TERMS', 'PRIVACY'].map((key, i) => ({
                key, title: `Test ${key}`, summary: 'Local test document. No legal agreement.',
                content: '## Test policy\n\nSynthetic policy for startup verification only.',
                version: 'test-1', effectiveDate: '2026-01-01', status: 'PUBLISHED',
                requiredAcceptance: true, accepted: fixture.accepted, policyVersionId: i + 1,
              })),
            });
          }
          if (name === 'accept_current_legal_policies') {
            assert.deepEqual(JSON.parse(init.body).p_policy_version_ids, [1, 2]);
            fixture.accepted = true;
            return respond(true);
          }
          if (name === 'public_auth_method_state') return respond({ emailPassword: true, phoneVerification: false });
          if (name === 'my_product_tour') return respond({
            available: tour, shouldStart: tour, versionId: 1, version: 'test-1',
            steps: [
              { id: 'home', targetId: 'home.hero', route: '/home', title: 'Test Home tour', body: 'Test welcome step' },
              { id: 'wallet', targetId: 'wallet.balance', route: '/wallet', title: 'Test Wallet tour', body: 'Test wallet step' },
            ],
          });
          if (name === 'set_my_product_tour_progress') return respond({ status: JSON.parse(init.body).p_status });
          if (name === 'token') return respond(testSession());
          if (name === 'user') return respond(testUser);
          if (['logout', 'admin_runtime_summary', 'home_market_rails'].includes(name)) return respond({});
          return respond([]);
        },
      });
      if (signedIn) window.localStorage.setItem('sb-localhost-auth-token', JSON.stringify(testSession()));
    },
  });
  const document = dom.window.document;
  const text = () => document.body.textContent;
  const button = label => document.querySelector(`[role="button"][aria-label="${label}"]`);
  const waitFor = async (predicate, timeout = 5000) => {
    const deadline = Date.now() + timeout;
    while (!predicate()) {
      assert.deepEqual(fixture.errors, [], 'The app must not crash');
      assert.ok(Date.now() < deadline, `Startup did not settle. Rendered: ${text().slice(-1000)}`);
      await delay(20);
    }
    assert.deepEqual(fixture.errors, [], 'The app must not crash');
  };
  const click = async label => {
    await waitFor(() => button(label) && button(label).getAttribute('aria-disabled') !== 'true');
    button(label).click();
    await delay(20);
  };
  t.after(() => { dom.window.close(); assert.deepEqual(fixture.errors, []); });
  return { fixture, dom, document, text, button, waitFor, click };
}

function assertProductBlocked(fixture) {
  assert.ok(!fixture.requests.includes('market_catalog'), 'Product data must wait for consent');
  assert.ok(!fixture.requests.includes('my_product_tour'), 'The tour must wait for consent');
}

test('restored session reaches consent, accepts both policies, then tours Home and Wallet', async t => {
  const app = await openApp(t, { tour: true });
  await app.waitFor(() => app.text().includes('YOUR VAD AGREEMENT'));
  assert.equal(app.dom.window.location.pathname, '/home');
  assertProductBlocked(app.fixture);
  assert.equal(app.button('Agree and enter VAD').getAttribute('aria-disabled'), 'true');
  for (let i = 0; i < 2; i++) {
    await app.click('I have read this');
    app.document.querySelector('[role="checkbox"]').click();
    if (i === 0) await app.click('Next required policy');
  }
  await app.click('Agree and enter VAD');
  await app.waitFor(() => app.text().includes('Test Home tour'));
  assert.ok(app.fixture.requests.includes('market_catalog'));
  assert.ok(!app.text().includes('YOUR VAD AGREEMENT'));
  await app.click('Next');
  await app.waitFor(() => app.dom.window.location.pathname === '/wallet' && app.text().includes('Test Wallet tour'));
  await app.click('Finish');
  await app.waitFor(() => !app.text().includes('Test Wallet tour'));
  assert.ok(app.document.getElementById('root').textContent.length > 100);
});

test('a protected deep link redirects to consent with a stable navigator', async t => {
  const app = await openApp(t, { path: '/markets' });
  await app.waitFor(() => app.text().includes('YOUR VAD AGREEMENT'));
  assert.equal(app.dom.window.location.pathname, '/home');
  assertProductBlocked(app.fixture);
  assert.ok(app.fixture.requests.filter(name => name === 'my_legal_policy_state').length <= 2);
});

test('an existing agreement opens Home without the consent modal', async t => {
  const app = await openApp(t, { accepted: true });
  await app.waitFor(() => app.text().includes('Price the outcome. Back your conviction.'));
  assert.equal(app.dom.window.location.pathname, '/home');
  assert.ok(!app.text().includes('YOUR VAD AGREEMENT'));
});

test('declining consent returns to the signed-out welcome screen', async t => {
  const app = await openApp(t);
  await app.waitFor(() => app.text().includes('YOUR VAD AGREEMENT'));
  await app.click('I do not agree');
  await app.waitFor(() => app.button('Create account'));
  assert.equal(app.dom.window.location.pathname, '/');
  assertProductBlocked(app.fixture);
});

test('policy service errors show a working retry and keep product content blocked', async t => {
  const app = await openApp(t, { policyFailure: 'error' });
  await app.waitFor(() => app.button('Try again'));
  assertProductBlocked(app.fixture);
  app.fixture.policyFailure = null;
  await app.click('Try again');
  await app.waitFor(() => app.text().includes('YOUR VAD AGREEMENT'));
  assertProductBlocked(app.fixture);
});

test('a stalled policy request reaches a visible retry instead of a blank screen', async t => {
  const app = await openApp(t, { policyFailure: 'timeout' });
  await app.waitFor(() => app.button('Try again'), 10_000);
  assertProductBlocked(app.fixture);
});

test('fresh email sign-in reaches the required policy step', async t => {
  const app = await openApp(t, { signedIn: false });
  await app.waitFor(() => app.button('Sign in') || app.button('I already have an account'));
  assertProductBlocked(app.fixture);
  await app.click(app.button('Sign in') ? 'Sign in' : 'I already have an account');
  const setValue = Object.getOwnPropertyDescriptor(app.dom.window.HTMLInputElement.prototype, 'value').set;
  for (const [label, value] of [['Email', testUser.email], ['Password', 'Synthetic-test-password']]) {
    const input = app.document.querySelector(`input[aria-label="${label}"]`);
    assert.ok(input, `Missing ${label} input`);
    setValue.call(input, value);
    input.dispatchEvent(new app.dom.window.Event('input', { bubbles: true }));
    await delay(20);
  }
  await app.click('Sign in');
  await app.waitFor(() => app.text().includes('YOUR VAD AGREEMENT'));
  assert.ok(app.fixture.requests.includes('token'));
  assertProductBlocked(app.fixture);
});
