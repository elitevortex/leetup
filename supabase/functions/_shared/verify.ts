// Ownership checks for linking a LeetCode account, shared by leetcode-link and post-solve.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.104.1';
import type { LeetCodeProfile } from './leetcode.ts';

// LeetCode profiles can list a GitHub account; signing in with that same GitHub proves ownership
export function githubMatches(leetcodeGithubUrl: string | null | undefined, githubLogin: string | null | undefined): boolean {
  if (!leetcodeGithubUrl || !githubLogin) return false;
  const m = leetcodeGithubUrl.trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/?$/i);
  return !!m && m[1].toLowerCase() === githubLogin.trim().toLowerCase();
}

export type VerifyMethod = 'github' | 'bio' | 'solve';

// Marks the link verified, mirrors LeetCode stats onto the profile, and clears anyone else's
// unverified claim to the same LeetCode account. A solve is the weakest proof (anyone can see a
// public submission and post it first), so GitHub or the bio code takes the account back from a
// link that only a solve verified. Usernames are stored exactly as LeetCode spells them.
export async function markVerified(db: SupabaseClient, userId: string, profile: LeetCodeProfile, method: VerifyMethod): Promise<'ok' | 'already_linked'> {
  const { data: holder } = await db
    .from('leetcode_links')
    .select('user_id, verified_method')
    .eq('leetcode_username', profile.username)
    .not('verified_at', 'is', null)
    .neq('user_id', userId)
    .maybeSingle();
  if (holder) {
    if (method === 'solve' || holder.verified_method !== 'solve') return 'already_linked';
    await db.from('leetcode_links').delete().eq('user_id', holder.user_id);
    await db
      .from('profiles')
      .update({ leetcode_username: null, lc_easy: 0, lc_medium: 0, lc_hard: 0, lc_ranking: null, lc_synced_at: null })
      .eq('id', holder.user_id);
  }

  const now = new Date().toISOString();
  const { error: linkError } = await db.from('leetcode_links').update({ verified_at: now, verified_method: method }).eq('user_id', userId);
  if (linkError?.code === '23505') return 'already_linked';
  if (linkError) throw linkError;

  const { error } = await db
    .from('profiles')
    .update({ leetcode_username: profile.username, lc_easy: profile.easy, lc_medium: profile.medium, lc_hard: profile.hard, lc_ranking: profile.ranking, lc_synced_at: now })
    .eq('id', userId);
  if (error) throw error;

  await db.from('leetcode_links').delete().eq('leetcode_username', profile.username).is('verified_at', null).neq('user_id', userId);
  return 'ok';
}
