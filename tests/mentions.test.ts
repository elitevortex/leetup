// Run with: deno test tests/
import { assertEquals } from 'jsr:@std/assert@1';
import { activeMention, splitComment } from '../lib/mentions.ts';

Deno.test('mentions: split out of text, lowercased, emails and code left alone', () => {
  assertEquals(splitComment('nice @Fred, try `@cache` or mail a@b.com'), [
    { text: 'nice ' },
    { text: '@Fred', mention: 'fred' },
    { text: ', try ' },
    { text: '@cache', code: true },
    { text: ' or mail a@b.com' },
  ]);
  assertEquals(splitComment('@ab @abc'), [{ text: '@ab ' }, { text: '@abc', mention: 'abc' }]);
});

Deno.test('mentions: the partial handle before the cursor', () => {
  assertEquals(activeMention('hi @fr', 6), { start: 3, query: 'fr' });
  assertEquals(activeMention('@', 1), { start: 0, query: '' });
  assertEquals(activeMention('hi @fred ', 9), null);
  assertEquals(activeMention('a@b', 3), null);
  assertEquals(activeMention('hi @fred later', 8), { start: 3, query: 'fred' });
});
