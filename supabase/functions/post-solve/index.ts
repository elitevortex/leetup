// Create a verified solve.
//   { problem_slug, started_at?, ended_at?, note? }
// Timed: started_at/ended_at are the user's manual timer. The solve must have an Accepted
// submission for that problem inside the window. Untimed: no window, any Accepted submission
// for that problem in the last 24 hours.
import { adminClient, fail, json, requireUser, serve } from '../_shared/http.ts';
import { fetchRecentAccepted, LeetCodeError } from '../_shared/leetcode.ts';

const CLOCK_SKEW_MS = 60_000;
// People often hit submit a moment after stopping the timer
const AFTER_STOP_GRACE_MS = 10 * 60_000;
const MAX_SESSION_MS = 24 * 60 * 60_000;

serve(async (req, body) => {
  const user = await requireUser(req);
  if (!user) return fail(401, 'unauthorized', 'Sign in first.');
  const db = adminClient();

  const slug = String(body.problem_slug ?? '');
  const note = body.note == null ? null : String(body.note).trim().slice(0, 280) || null;
  const startedAt = body.started_at ? Date.parse(String(body.started_at)) : null;
  const endedAt = body.ended_at ? Date.parse(String(body.ended_at)) : null;
  const now = Date.now();

  const timed = startedAt !== null || endedAt !== null;
  if (timed) {
    if (startedAt === null || endedAt === null || Number.isNaN(startedAt) || Number.isNaN(endedAt)) {
      return fail(400, 'bad_times', 'Send both started_at and ended_at as ISO timestamps.');
    }
    if (endedAt <= startedAt || endedAt - startedAt > MAX_SESSION_MS || endedAt > now + CLOCK_SKEW_MS) {
      return fail(400, 'bad_times', 'That timer session doesn’t add up.');
    }
  }

  const { data: profile } = await db.from('profiles').select('leetcode_username').eq('id', user.id).maybeSingle();
  if (!profile?.leetcode_username) return fail(403, 'not_verified', 'Connect and verify your LeetCode account first.');

  const { data: problem } = await db.from('problems').select('slug, title, difficulty').eq('slug', slug).maybeSingle();
  if (!problem) return fail(404, 'unknown_problem', 'Pick a problem from the list.');

  let accepted;
  try {
    accepted = await fetchRecentAccepted(profile.leetcode_username, 20);
  } catch (e) {
    if (e instanceof LeetCodeError) return fail(502, 'leetcode_unavailable', 'LeetCode isn’t responding right now. Try again in a minute.');
    throw e;
  }

  const from = timed ? startedAt! - CLOCK_SKEW_MS : now - MAX_SESSION_MS;
  const to = timed ? endedAt! + AFTER_STOP_GRACE_MS : now + CLOCK_SKEW_MS;
  // The first Accepted in the window is the solve; later ones are re-submits
  const match = accepted
    .filter((s) => s.titleSlug === slug && s.timestamp * 1000 >= from && s.timestamp * 1000 <= to)
    .sort((a, b) => a.timestamp - b.timestamp)[0];

  if (!match) {
    return fail(404, 'no_accepted_submission',
      `We couldn’t find an Accepted submission for ${problem.title} ${timed ? 'during your timer' : 'in the last 24 hours'}. ` +
      'If you just submitted, wait a few seconds and try again.');
  }

  const { data: solve, error } = await db
    .from('solves')
    .insert({
      user_id: user.id,
      problem_slug: slug,
      time_seconds: timed ? Math.max(1, Math.round((endedAt! - startedAt!) / 1000)) : null,
      language: match.lang,
      note,
      lc_submission_id: match.id,
      solved_at: new Date(match.timestamp * 1000).toISOString(),
    })
    .select('*')
    .single();
  if (error?.code === '23505') return fail(409, 'already_posted', 'You’ve already posted this submission.');
  if (error) throw error;

  return json({ solve, problem });
});
