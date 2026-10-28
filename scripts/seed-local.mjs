// Seed the LOCAL Supabase with demo people, friendships and solves for trying the app.
// Usage: node scripts/seed-local.mjs   (reads URLs and keys from `npx supabase status`)
// Signs in as: you@leetup.test / leetup-demo-123  (Home starts locked: you haven't posted today)
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  execSync('npx supabase status -o env', { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (!env.API_URL?.includes('127.0.0.1')) throw new Error('Refusing to seed anything but a local Supabase.');

const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const PASSWORD = 'leetup-demo-123';

const PEOPLE = [
  { key: 'you', email: 'you@leetup.test', username: 'edward', name: 'Edward Chan', lc: 'lee215', stats: [142, 98, 21] },
  { key: 'alex', email: 'alex@leetup.test', username: 'alexc', name: 'Alex Chen', lc: 'alexc_lc', stats: [80, 120, 33] },
  { key: 'priya', email: 'priya@leetup.test', username: 'priya', name: 'Priya S', lc: 'priya_lc', stats: [160, 210, 42] },
  { key: 'sam', email: 'sam@leetup.test', username: 'samk', name: 'Sam K', lc: 'samk_lc', stats: [70, 52, 7] },
  { key: 'jordan', email: 'jordan@leetup.test', username: 'jordanl', name: 'Jordan L', lc: 'jordan_lc', stats: [55, 30, 4] },
  { key: 'mia', email: 'mia@leetup.test', username: 'miat', name: 'Mia T', lc: 'mia_lc', stats: [40, 12, 1] },
];

const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const todayAt = (h, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  // Keep "today" posts in the past even when seeding early in the morning
  return (d.getTime() > Date.now() ? new Date(Date.now() - 20 * 60_000) : d).toISOString();
};

// Fake LeetCode activity: denser in recent weeks
function calendar(seed) {
  const days = {};
  const today = Math.floor(Date.now() / 86400_000);
  let s = seed;
  for (let i = 0; i < 84; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    if (r > (i < 20 ? 0.2 : 0.5)) days[String((today - i) * 86400)] = 1 + Math.floor(r * 6);
  }
  return days;
}

async function main() {
  // Start clean: remove previous demo users (cascades to everything they own)
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const u of existing.users.filter((u) => u.email?.endsWith('@leetup.test'))) await admin.auth.admin.deleteUser(u.id);

  const ids = {};
  for (const [i, p] of PEOPLE.entries()) {
    const { data, error } = await admin.auth.admin.createUser({ email: p.email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    ids[p.key] = data.user.id;
    const { error: pe } = await admin.from('profiles').insert({
      id: data.user.id, username: p.username, display_name: p.name, timezone: tz,
      leetcode_username: p.lc, lc_easy: p.stats[0], lc_medium: p.stats[1], lc_hard: p.stats[2],
      lc_ranking: 284112 - i * 40000, lc_calendar: calendar(i + 7), lc_streak: 3 + i, lc_active_days: 40 + i * 9,
      lc_synced_at: new Date().toISOString(),
    });
    if (pe) throw pe;
    await admin.from('leetcode_links').insert({ user_id: data.user.id, leetcode_username: p.lc, verify_code: 'leetup-DEMO', verified_at: new Date().toISOString() });
  }

  const friends = [['you', 'alex'], ['priya', 'you'], ['you', 'sam'], ['alex', 'priya'], ['mia', 'you']];
  for (const [a, b] of friends) {
    await admin.from('friendships').insert({ requester_id: ids[a], addressee_id: ids[b], status: 'accepted', responded_at: hoursAgo(200) });
  }
  // Jordan's request to you is still pending
  await admin.from('friendships').insert({ requester_id: ids.jordan, addressee_id: ids.you });

  let n = 0;
  const solve = async (who, slug, minutes, lang, created, note) => {
    const { data, error } = await admin
      .from('solves')
      .insert({ user_id: ids[who], problem_slug: slug, time_seconds: minutes == null ? null : Math.round(minutes * 60), language: lang, note, lc_submission_id: `demo-${++n}`, solved_at: created, created_at: created })
      .select('id')
      .single();
    if (error) throw new Error(`${slug}: ${error.message}`);
    return data.id;
  };

  // Today (hidden from you until you post)
  const alexToday = await solve('alex', 'binary-tree-maximum-path-sum', 38.03, 'cpp', todayAt(7, 41), 'dfs + global max');
  const priyaToday = await solve('priya', 'lru-cache', 19.67, 'python3', todayAt(4, 38), 'hashmap + dll');
  await solve('sam', 'valid-parentheses', 4.85, 'java', todayAt(9, 3), null);
  await solve('mia', 'two-sum', 6.2, 'typescript', todayAt(8, 15), 'first one this week');

  // Earlier days (always visible)
  const samOld = await solve('sam', 'merge-k-sorted-lists', 41.1, 'python3', hoursAgo(30), 'heap, then divide and conquer');
  await solve('priya', 'number-of-islands', 12.4, 'python3', hoursAgo(52), 'bfs');
  await solve('alex', 'coin-change', 24.9, 'cpp', hoursAgo(75), null);
  const youOld = await solve('you', 'two-sum', 4.2, 'python3', hoursAgo(27), 'one pass');
  await solve('you', 'lru-cache', 27.7, 'python3', hoursAgo(50), null);
  await solve('you', 'merge-k-sorted-lists', 41.08, 'python3', hoursAgo(98), null);

  const comment = (who, solveId, body) => admin.from('comments').insert({ solve_id: solveId, user_id: ids[who], body });
  await comment('alex', priyaToday, 'clean. did you try `OrderedDict`? same O(1), way less code');
  await comment('sam', priyaToday, '19:40 on a medium is wild. teach me');
  await comment('priya', alexToday, 'the global max trick is so good');
  await comment('alex', youOld, 'one pass `hashmap` gang');
  await comment('priya', youOld, 'speedrun');

  const like = (who, solveId) => admin.from('likes').insert({ solve_id: solveId, user_id: ids[who] });
  for (const w of ['alex', 'sam', 'mia']) await like(w, priyaToday);
  for (const w of ['priya', 'sam']) await like(w, alexToday);
  for (const w of ['alex', 'priya', 'sam', 'mia']) await like(w, youOld);
  await like('you', samOld);

  console.log(`Seeded ${PEOPLE.length} people and ${n} solves in ${tz}.`);
  console.log(`Sign in with ${PEOPLE[0].email} / ${PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
