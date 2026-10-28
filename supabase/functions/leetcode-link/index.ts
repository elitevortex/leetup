// Connect a LeetCode account. Linking is instant but unverified; ownership is proven by any of:
//   - signing in with the GitHub account the LeetCode profile lists (checked on start and verify)
//   - posting one of the three challenge problems issued here (handled by post-solve)
//   - the bio code in the LeetCode profile summary (fallback, checked on verify)
//   { action: "start", username } -> links the account, auto-verifies via GitHub when it can
//   { action: "challenge" }       -> swaps in three different challenge problems
//   { action: "verify" }          -> re-checks GitHub, the bio code and the challenge problems
import { User } from 'npm:@supabase/supabase-js@2.104.1';
import { adminClient, fail, json, requireUser, serve } from '../_shared/http.ts';
import { fetchProfile, fetchRecentAccepted, LeetCodeError, LeetCodeProfile } from '../_shared/leetcode.ts';
import { githubMatches, markVerified, pickChallenges } from '../_shared/verify.ts';

const USERNAME = /^[A-Za-z0-9_-]{1,40}$/;
// No 0/O or 1/I so the code survives being retyped
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CLOCK_SKEW_MS = 60_000;
const ALREADY_LINKED = 'That LeetCode account is already linked to another LeetUp account.';

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return 'leetup-' + Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function githubLogin(user: User): string | null {
  const identity = user.identities?.find((i) => i.provider === 'github');
  return (identity?.identity_data?.user_name as string | undefined) ?? null;
}

type Db = ReturnType<typeof adminClient>;

async function challengeView(db: Db, slugs: string[]) {
  if (slugs.length === 0) return [];
  const { data } = await db.from('problems').select('slug, frontend_id, title, difficulty').in('slug', slugs);
  return slugs.map((s) => data?.find((p) => p.slug === s)).filter(Boolean);
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

      const { data: taken } = await db
        .from('leetcode_links')
        .select('user_id')
        .ilike('leetcode_username', profile.username)
        .not('verified_at', 'is', null)
        .neq('user_id', user.id)
        .maybeSingle();
      if (taken) return fail(409, 'already_linked', ALREADY_LINKED);

      // Same username again keeps the code and challenges, so nothing they've started is lost
      const { data: existing } = await db.from('leetcode_links').select('*').eq('user_id', user.id).maybeSingle();
      const same = existing && existing.leetcode_username.toLowerCase() === profile.username.toLowerCase();
      if (same && existing.verified_at) return json({ preview: preview(profile), verified: true, challenges: [] });

      const keep = same && existing.challenge_slugs?.length > 0;
      const slugs: string[] = keep ? existing.challenge_slugs : await pickChallenges(db);
      const { error } = await db.from('leetcode_links').upsert({
        user_id: user.id,
        leetcode_username: profile.username,
        verify_code: same ? existing.verify_code : newCode(),
        verified_at: null,
        challenge_slugs: slugs,
        challenge_issued_at: keep ? existing.challenge_issued_at : new Date().toISOString(),
      });
      if (error) throw error;
      // Switching LeetCode accounts drops the old one's stats
      if (existing && !same) await db.from('profiles').update({ leetcode_username: null }).eq('id', user.id);

      const verified = githubMatches(profile.githubUrl, githubLogin(user))
        && (await markVerified(db, user.id, profile)) === 'ok';
      return json({ preview: preview(profile), verified, method: verified ? 'github' : null, challenges: verified ? [] : await challengeView(db, slugs) });
    }

    const { data: link } = await db.from('leetcode_links').select('*').eq('user_id', user.id).maybeSingle();
    if (!link) return fail(400, 'not_started', 'Enter your LeetCode username first.');

    if (body.action === 'challenge') {
      if (link.verified_at) return json({ challenges: [] });
      const slugs = await pickChallenges(db, 3, link.challenge_slugs ?? []);
      const { error } = await db
        .from('leetcode_links')
        .update({ challenge_slugs: slugs, challenge_issued_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (error) throw error;
      return json({ challenges: await challengeView(db, slugs) });
    }

    if (body.action === 'verify') {
      if (link.verified_at) return json({ verified: true, username: link.leetcode_username });
      const [profile, accepted] = await Promise.all([fetchProfile(link.leetcode_username), fetchRecentAccepted(link.leetcode_username, 20)]);
      if (!profile) return fail(404, 'not_found', 'We couldn’t find that LeetCode account any more.');

      const issued = link.challenge_issued_at ? Date.parse(link.challenge_issued_at) : null;
      const match = issued
        ? accepted
            .filter((s) => link.challenge_slugs.includes(s.titleSlug) && s.timestamp * 1000 >= issued - CLOCK_SKEW_MS)
            .sort((a, b) => a.timestamp - b.timestamp)[0]
        : undefined;
      const method = githubMatches(profile.githubUrl, githubLogin(user))
        ? 'github'
        : profile.aboutMe.toUpperCase().includes(link.verify_code.toUpperCase())
        ? 'bio'
        : match
        ? 'solve'
        : null;

      if (!method) {
        return json({ verified: false, verify_code: link.verify_code, challenges: await challengeView(db, link.challenge_slugs ?? []) });
      }
      if ((await markVerified(db, user.id, profile)) === 'already_linked') return fail(409, 'already_linked', ALREADY_LINKED);

      // A challenge solved outside the timer still counts as their first post (untimed)
      if (method === 'solve' && match) {
        await db.from('solves').upsert(
          { user_id: user.id, problem_slug: match.titleSlug, time_seconds: null, language: match.lang, lc_submission_id: match.id, solved_at: new Date(match.timestamp * 1000).toISOString() },
          { onConflict: 'lc_submission_id', ignoreDuplicates: true },
        );
      }
      return json({ verified: true, method, username: profile.username });
    }

    return fail(400, 'unknown_action', 'Action must be "start", "challenge" or "verify".');
  } catch (e) {
    if (e instanceof LeetCodeError) return fail(502, 'leetcode_unavailable', 'LeetCode isn’t responding right now. Try again in a minute.');
    throw e;
  }
});
