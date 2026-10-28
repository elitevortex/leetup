// Connect and verify a LeetCode account.
//   { action: "start", username }  -> looks the account up, issues a bio code, returns a preview
//   { action: "verify" }           -> checks the code is in the account's profile summary
import { adminClient, fail, json, requireUser, serve } from '../_shared/http.ts';
import { fetchProfile, LeetCodeError } from '../_shared/leetcode.ts';

const USERNAME = /^[A-Za-z0-9_-]{1,40}$/;
// No 0/O or 1/I so the code survives being retyped
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return 'leetup-' + Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
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

      const { data: taken } = await db
        .from('leetcode_links')
        .select('user_id')
        .ilike('leetcode_username', profile.username)
        .not('verified_at', 'is', null)
        .neq('user_id', user.id)
        .maybeSingle();
      if (taken) return fail(409, 'already_linked', 'That LeetCode account is already linked to another LeetUp account.');

      // Keep the same code if they restart with the same username
      const { data: existing } = await db.from('leetcode_links').select('leetcode_username, verify_code').eq('user_id', user.id).maybeSingle();
      const code = existing && existing.leetcode_username.toLowerCase() === profile.username.toLowerCase() ? existing.verify_code : newCode();

      const { error } = await db.from('leetcode_links').upsert({
        user_id: user.id,
        leetcode_username: profile.username,
        verify_code: code,
        verified_at: null,
      });
      if (error) throw error;

      const { aboutMe: _private, ...preview } = profile;
      return json({ preview, code });
    }

    if (body.action === 'verify') {
      const { data: link } = await db.from('leetcode_links').select('*').eq('user_id', user.id).maybeSingle();
      if (!link) return fail(400, 'not_started', 'Enter your LeetCode username first.');

      const profile = await fetchProfile(link.leetcode_username);
      if (!profile) return fail(404, 'not_found', 'We couldn’t find that LeetCode account any more.');
      if (!profile.aboutMe.toUpperCase().includes(link.verify_code.toUpperCase())) {
        return json({ verified: false });
      }

      const now = new Date().toISOString();
      const { error: linkError } = await db.from('leetcode_links').update({ verified_at: now }).eq('user_id', user.id);
      if (linkError?.code === '23505') return fail(409, 'already_linked', 'That LeetCode account is already linked to another LeetUp account.');
      if (linkError) throw linkError;

      const { error: profileError } = await db
        .from('profiles')
        .update({
          leetcode_username: profile.username,
          lc_easy: profile.easy,
          lc_medium: profile.medium,
          lc_hard: profile.hard,
          lc_ranking: profile.ranking,
          lc_synced_at: now,
        })
        .eq('id', user.id);
      if (profileError) throw profileError;

      return json({ verified: true, username: profile.username });
    }

    return fail(400, 'unknown_action', 'Action must be "start" or "verify".');
  } catch (e) {
    if (e instanceof LeetCodeError) return fail(502, 'leetcode_unavailable', 'LeetCode isn’t responding right now. Try again in a minute.');
    throw e;
  }
});
