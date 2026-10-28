// Connect a LeetCode account. Linking is instant but unverified; ownership is proven by any of:
//   - signing in with the GitHub account the LeetCode profile lists (checked on start and verify)
//   - posting any problem submitted after linking (handled by post-solve)
//   - the bio code in the LeetCode profile summary (fallback, checked on verify)
//   { action: "start", username } -> links the account, auto-verifies via GitHub when it can
//   { action: "verify" }          -> re-checks GitHub and the bio code
import { User } from 'npm:@supabase/supabase-js@2.104.1';
import { adminClient, fail, json, requireUser, serve } from '../_shared/http.ts';
import { fetchProfile, LeetCodeError, LeetCodeProfile } from '../_shared/leetcode.ts';
import { githubMatches, markVerified } from '../_shared/verify.ts';

const USERNAME = /^[A-Za-z0-9_-]{1,40}$/;
// No 0/O or 1/I so the code survives being retyped
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ALREADY_LINKED = 'That LeetCode account is already linked to another LeetUp account.';

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return 'leetup-' + Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function githubLogin(user: User): string | null {
  const identity = user.identities?.find((i) => i.provider === 'github');
  return (identity?.identity_data?.user_name as string | undefined) ?? null;
}

function preview(profile: LeetCodeProfile) {
  const { aboutMe: _private, ...rest } = profile;
  return rest;
}

serve(async (req, body) => {
  const user = await requireUser(req);
  if (!user) return fail(401, 'unauthorized', 'Sign in first.');
  const db = adminClient();

  try {
    if (body.action === 'start') {
      const username = String(body.username ?? '').trim();
      if (!USERNAME.test(username)) return fail(400, 'invalid_username', 'That doesn’t look like a LeetCode username.');

      const profile = await fetchProfile(username);
      if (!profile) return fail(404, 'not_found', `No LeetCode account called “${username}”. Check the spelling.`);

      // Someone verified only by a solve can be challenged with GitHub or the bio code
      const { data: holder } = await db
        .from('leetcode_links')
        .select('verified_method')
        .eq('leetcode_username', profile.username)
        .not('verified_at', 'is', null)
        .neq('user_id', user.id)
        .maybeSingle();
      if (holder && holder.verified_method !== 'solve') return fail(409, 'already_linked', ALREADY_LINKED);

      // Same username again keeps the code and claim time, so nothing they've started is lost
      const { data: existing } = await db.from('leetcode_links').select('*').eq('user_id', user.id).maybeSingle();
      const same = existing && existing.leetcode_username === profile.username;
      if (same && existing.verified_at) return json({ preview: preview(profile), verified: true, contested: false });

      const { error } = await db.from('leetcode_links').upsert({
        user_id: user.id,
        leetcode_username: profile.username,
        verify_code: same ? existing.verify_code : newCode(),
        verified_at: null,
        verified_method: null,
        claimed_at: same ? existing.claimed_at : new Date().toISOString(),
      });
      if (error) throw error;
      // Switching LeetCode accounts drops the old one's stats
      if (existing && !same) await db.from('profiles').update({ leetcode_username: null }).eq('id', user.id);

      const verified = githubMatches(profile.githubUrl, githubLogin(user))
        && (await markVerified(db, user.id, profile, 'github')) === 'ok';
      return json({ preview: preview(profile), verified, method: verified ? 'github' : null, contested: !!holder && !verified });
    }

    const { data: link } = await db.from('leetcode_links').select('*').eq('user_id', user.id).maybeSingle();
    if (!link) return fail(400, 'not_started', 'Enter your LeetCode username first.');

    if (body.action === 'verify') {
      if (link.verified_at) return json({ verified: true, username: link.leetcode_username });
      const profile = await fetchProfile(link.leetcode_username);
      if (!profile) return fail(404, 'not_found', 'We couldn’t find that LeetCode account any more.');

      const method = githubMatches(profile.githubUrl, githubLogin(user))
        ? 'github'
        : profile.aboutMe.toUpperCase().includes(link.verify_code.toUpperCase())
        ? 'bio'
        : null;
      if (!method) return json({ verified: false, verify_code: link.verify_code });
      if ((await markVerified(db, user.id, profile, method)) === 'already_linked') return fail(409, 'already_linked', ALREADY_LINKED);
      return json({ verified: true, method, username: profile.username });
    }

    return fail(400, 'unknown_action', 'Action must be "start" or "verify".');
  } catch (e) {
    if (e instanceof LeetCodeError) return fail(502, 'leetcode_unavailable', 'LeetCode isn’t responding right now. Try again in a minute.');
    throw e;
  }
});
