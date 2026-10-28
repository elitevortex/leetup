// Ownership checks for linking a LeetCode account, shared by leetcode-link and post-solve.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.104.1';
import type { LeetCodeProfile } from './leetcode.ts';

// Short, well-known easies: quick to submit, and fine to copy a solution for
export const CHALLENGE_POOL = [
  'two-sum', 'valid-parentheses', 'merge-two-sorted-lists', 'best-time-to-buy-and-sell-stock', 'valid-palindrome',
  'valid-anagram', 'contains-duplicate', 'climbing-stairs', 'reverse-linked-list', 'majority-element', 'single-number',
  'palindrome-number', 'roman-to-integer', 'search-insert-position', 'length-of-last-word', 'plus-one', 'fizz-buzz',
  'move-zeroes', 'missing-number', 'merge-sorted-array',
];

export async function pickChallenges(db: SupabaseClient, count = 3, exclude: string[] = []): Promise<string[]> {
  const { data } = await db.from('problems').select('slug').in('slug', CHALLENGE_POOL).eq('paid_only', false);
  const pool = (data ?? []).map((p) => p.slug).filter((s) => !exclude.includes(s));
  // Fall back to the full pool if excluding left too few
  const source = pool.length >= count ? pool : (data ?? []).map((p) => p.slug);
  const picked: string[] = [];
  while (picked.length < count && picked.length < source.length) {
    const s = source[crypto.getRandomValues(new Uint32Array(1))[0] % source.length];
    if (!picked.includes(s)) picked.push(s);
  }
  return picked;
}

// LeetCode profiles can list a GitHub account; signing in with that same GitHub proves ownership
export function githubMatches(leetcodeGithubUrl: string | null | undefined, githubLogin: string | null | undefined): boolean {
  if (!leetcodeGithubUrl || !githubLogin) return false;
  const m = leetcodeGithubUrl.trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/?$/i);
  return !!m && m[1].toLowerCase() === githubLogin.trim().toLowerCase();
}

// Marks the link verified, mirrors LeetCode stats onto the profile, and clears anyone else's
// unverified claim to the same LeetCode account.
export async function markVerified(db: SupabaseClient, userId: string, profile: LeetCodeProfile): Promise<'ok' | 'already_linked'> {
  const now = new Date().toISOString();
  const { error: linkError } = await db.from('leetcode_links').update({ verified_at: now }).eq('user_id', userId);
  if (linkError?.code === '23505') return 'already_linked';
  if (linkError) throw linkError;

  const { error } = await db
    .from('profiles')
    .update({ leetcode_username: profile.username, lc_easy: profile.easy, lc_medium: profile.medium, lc_hard: profile.hard, lc_ranking: profile.ranking, lc_synced_at: now })
    .eq('id', userId);
  if (error) throw error;

  await db.from('leetcode_links').delete().ilike('leetcode_username', profile.username).is('verified_at', null).neq('user_id', userId);
  return 'ok';
}
