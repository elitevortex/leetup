// Run with: deno test tests/
import { assertEquals } from 'jsr:@std/assert@1';
import { githubMatches } from '../supabase/functions/_shared/verify.ts';

Deno.test('githubMatches accepts the URL forms LeetCode stores', () => {
  assertEquals(githubMatches('https://github.com/votrubac', 'votrubac'), true);
  assertEquals(githubMatches('https://github.com/Votrubac/', 'votrubac'), true);
  assertEquals(githubMatches('github.com/votrubac', 'VOTRUBAC'), true);
  assertEquals(githubMatches('https://www.github.com/votrubac', 'votrubac'), true);
});

Deno.test('githubMatches rejects anything else', () => {
  assertEquals(githubMatches(null, 'votrubac'), false);
  assertEquals(githubMatches('https://github.com/votrubac', null), false);
  assertEquals(githubMatches('https://github.com/votrubac2', 'votrubac'), false);
  assertEquals(githubMatches('https://github.com/votrubac/repo', 'votrubac'), false);
  assertEquals(githubMatches('https://evil.com/github.com/votrubac', 'votrubac'), false);
});
