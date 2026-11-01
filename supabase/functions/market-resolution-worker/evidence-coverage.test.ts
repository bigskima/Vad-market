import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  hasIndependentEvidenceHost,
  isAllowedEvidenceHost,
  missingEvidencePaths,
} from './evidence-coverage.ts';

Deno.test('unscoped market evidence discovery accepts validated public hosts', () => {
  assertEquals(isAllowedEvidenceHost('official.example', []), true);
  assertEquals(isAllowedEvidenceHost('news.example.org', []), true);
  assertEquals(isAllowedEvidenceHost('', []), false);
});

Deno.test('configured market domains remain an allow-list', () => {
  assertEquals(isAllowedEvidenceHost('results.example.org', ['example.org']), true);
  assertEquals(isAllowedEvidenceHost('www.example.org', ['example.org']), true);
  assertEquals(isAllowedEvidenceHost('example.org.attacker.test', ['example.org']), false);
  assertEquals(isAllowedEvidenceHost('unrelated.example', ['example.org']), false);
});

Deno.test('fallback evidence prefers a distinct host boundary', () => {
  assertEquals(hasIndependentEvidenceHost('results.example.org', 'example.org'), false);
  assertEquals(hasIndependentEvidenceHost('example.org', 'www.example.org'), false);
  assertEquals(hasIndependentEvidenceHost('independent-source.test', 'example.org'), true);
  assertEquals(hasIndependentEvidenceHost('', 'example.org'), false);
});

Deno.test('evidence packet still requires every available evidence path to be cited', () => {
  const packet = [{ source: 'DIRECT' as const }, { source: 'SEARCH' as const }];
  assertEquals(missingEvidencePaths([], packet), ['DIRECT', 'SEARCH']);
  assertEquals(missingEvidencePaths([{ source: { source: 'DIRECT' as const } }], packet), ['SEARCH']);
  assertEquals(missingEvidencePaths([
    { source: { source: 'DIRECT' as const } },
    { source: { source: 'SEARCH' as const } },
  ], packet), []);
});
