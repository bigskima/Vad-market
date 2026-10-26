import { missingEvidencePaths } from './evidence-coverage.ts';

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

Deno.test('both source paths require both citations', () => {
  assertEqual(
    missingEvidencePaths([{ source: { source: 'DIRECT' } }], [{ source: 'DIRECT' }, { source: 'SEARCH' }]),
    ['SEARCH'],
    'missing search corroboration must be identified',
  );
});

Deno.test('direct and search citations satisfy the policy gate', () => {
  assertEqual(
    missingEvidencePaths(
      [{ source: { source: 'DIRECT' } }, { source: { source: 'SEARCH' } }],
      [{ source: 'DIRECT' }, { source: 'SEARCH' }],
    ),
    [],
    'both configured evidence paths should pass',
  );
});

Deno.test('a single available source does not invent a missing path', () => {
  assertEqual(
    missingEvidencePaths([{ source: { source: 'DIRECT' } }], [{ source: 'DIRECT' }]),
    [],
    'coverage helper should only inspect source paths present in the packet',
  );
});

Deno.test('an empty packet has no evidence paths to satisfy', () => {
  assertEqual(missingEvidencePaths([], []), [], 'empty packet has no source paths');
});
