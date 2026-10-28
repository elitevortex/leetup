// Refresh the signed-in user's LeetCode stats and activity calendar. Cheap to call on app open:
// it does nothing if the data is under 15 minutes old.
import { adminClient, fail, json, requireUser, serve } from '../_shared/http.ts';
import { fetchCalendar, fetchProfile, LeetCodeError } from '../_shared/leetcode.ts';

const FRESH_MS = 15 * 60_000;

serve(async (req, body) => {
  const user = await requireUser(req);
  if (!user) return fail(401, 'unauthorized', 'Sign in first.');
  const db = adminClient();

  const { data: profile } = await db.from('profiles').select('leetcode_username, lc_synced_at').eq('id', user.id).maybeSingle();
  if (!profile?.leetcode_username) return fail(403, 'not_verified', 'Connect and verify your LeetCode account first.');

  const age = profile.lc_synced_at ? Date.now() - Date.parse(profile.lc_synced_at) : Infinity;
  if (age < FRESH_MS && body.force !== true) return json({ synced: false, reason: 'fresh' });

  try {
    const [stats, calendar] = await Promise.all([fetchProfile(profile.leetcode_username), fetchCalendar(profile.leetcode_username)]);
    if (!stats) return fail(404, 'not_found', 'We couldn’t find your LeetCode account any more.');
    const { error } = await db
      .from('profiles')
      .update({
        lc_easy: stats.easy,
        lc_medium: stats.medium,
        lc_hard: stats.hard,
        lc_ranking: stats.ranking,
        lc_calendar: calendar?.days ?? {},
        lc_streak: calendar?.streak ?? 0,
        lc_active_days: calendar?.activeDays ?? 0,
        lc_synced_at: new Date().toISOString(),
      })
      .eq('id', user.id);
    if (error) throw error;
    return json({ synced: true });
  } catch (e) {
    if (e instanceof LeetCodeError) return fail(502, 'leetcode_unavailable', 'LeetCode isn’t responding right now. Try again in a minute.');
    throw e;
  }
});
