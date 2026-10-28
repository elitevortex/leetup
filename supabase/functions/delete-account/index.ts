// Permanently delete the signed-in user. Every table cascades from auth.users; media files are
// removed here because storage objects don't cascade.
import { adminClient, fail, json, requireUser, serve } from '../_shared/http.ts';

serve(async (req) => {
  const user = await requireUser(req);
  if (!user) return fail(401, 'unauthorized', 'Sign in first.');
  const db = adminClient();

  const bucket = db.storage.from('solve-media');
  const { data: folders } = await bucket.list(user.id, { limit: 1000 });
  for (const folder of folders ?? []) {
    const { data: files } = await bucket.list(`${user.id}/${folder.name}`, { limit: 100 });
    const paths = (files ?? []).map((f) => `${user.id}/${folder.name}/${f.name}`);
    if (paths.length) await bucket.remove(paths);
  }

  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) throw error;
  return json({ deleted: true });
});
