// Copy LeetCode's problem list into public.problems. Admin only: call with the service role key.
import { adminClient, fail, json, serve } from '../_shared/http.ts';
import { fetchProblemsPage } from '../_shared/leetcode.ts';

const PAGE = 100;

serve(async (req) => {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || token !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return fail(403, 'forbidden', 'Admin only.');

  const db = adminClient();
  let skip = 0;
  let total = Infinity;
  let synced = 0;
  while (skip < total) {
    const page = await fetchProblemsPage(skip, PAGE);
    total = page.total;
    if (page.rows.length === 0) break;
    const { error } = await db
      .from('problems')
      .upsert(page.rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'slug' });
    if (error) throw error;
    synced += page.rows.length;
    skip += PAGE;
  }
  return json({ synced, total });
});
