// Run with: deno test tests/
import { assertEquals } from 'jsr:@std/assert@1';
import { formatDuration, formatTimestamp, initials, pace, shortLang } from '../lib/format.ts';

const now = new Date(2026, 9, 28, 15, 30); // Oct 28 2026, 3:30pm local

Deno.test('timestamps: today and yesterday use the clock time', () => {
  assertEquals(formatTimestamp(new Date(2026, 9, 28, 7, 41).toISOString(), now), 'Today at 7:41am');
  assertEquals(formatTimestamp(new Date(2026, 9, 28, 0, 5).toISOString(), now), 'Today at 12:05am');
  assertEquals(formatTimestamp(new Date(2026, 9, 27, 20, 53).toISOString(), now), 'Yesterday at 8:53pm');
  assertEquals(formatTimestamp(new Date(2026, 9, 27, 12, 0).toISOString(), now), 'Yesterday at 12:00pm');
});

Deno.test('timestamps: older dates spell out the date with an ordinal', () => {
  assertEquals(formatTimestamp(new Date(2026, 9, 23, 13, 34).toISOString(), now), 'Oct 23rd, 2026 at 1:34pm');
  assertEquals(formatTimestamp(new Date(2026, 9, 1, 9, 0).toISOString(), now), 'Oct 1st, 2026 at 9:00am');
  assertEquals(formatTimestamp(new Date(2026, 9, 2, 9, 0).toISOString(), now), 'Oct 2nd, 2026 at 9:00am');
  assertEquals(formatTimestamp(new Date(2026, 9, 11, 9, 0).toISOString(), now), 'Oct 11th, 2026 at 9:00am');
  assertEquals(formatTimestamp(new Date(2026, 9, 12, 9, 0).toISOString(), now), 'Oct 12th, 2026 at 9:00am');
  assertEquals(formatTimestamp(new Date(2026, 9, 13, 9, 0).toISOString(), now), 'Oct 13th, 2026 at 9:00am');
  assertEquals(formatTimestamp(new Date(2026, 9, 21, 9, 0).toISOString(), now), 'Oct 21st, 2026 at 9:00am');
  assertEquals(formatTimestamp(new Date(2025, 11, 31, 23, 59).toISOString(), now), 'Dec 31st, 2025 at 11:59pm');
});

Deno.test('durations', () => {
  assertEquals(formatDuration(0), '00:00');
  assertEquals(formatDuration(754), '12:34');
  assertEquals(formatDuration(3754), '1:02:34');
  assertEquals(formatDuration(-5), '00:00');
});

Deno.test('initials, languages and pace', () => {
  assertEquals(initials('Edward Chan'), 'EC');
  assertEquals(initials('priya'), 'PR');
  assertEquals(initials('Mary Ann Lee'), 'ML');
  assertEquals(shortLang('python3'), 'py3');
  assertEquals(shortLang(null), '—');
  assertEquals(pace(7 * 60, 'Easy'), 'fast');
  assertEquals(pace(30 * 60, 'Medium'), 'avg');
  assertEquals(pace(90 * 60, 'Hard'), 'slow');
  assertEquals(pace(null, 'Hard'), '—');
});
