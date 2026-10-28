import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import {
  AppNotification,
  Celebration,
  Comment,
  FeedSolve,
  FriendRow,
  LeaderboardRow,
  LeetCodePreview,
  PersonSummary,
  Problem,
  ProfileSummary,
  SolveMedia,
  Teaser,
} from '../types';

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const PERSON = 'id, username, display_name, avatar_url';

function check<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new ApiError(res.error.code ?? 'db_error', res.error.message);
  return res.data as T;
}

async function callFunction<T>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = await error.context.json();
        throw new ApiError(payload.error ?? 'error', payload.message ?? 'Something went wrong.');
      } catch (e) {
        if (e instanceof ApiError) throw e;
      }
    }
    throw new ApiError('network', 'Couldn’t reach LeetUp. Check your connection and try again.');
  }
  return data as T;
}

// ---------- LeetCode account ----------

export function startLeetCodeLink(username: string) {
  return callFunction<{ preview: LeetCodePreview; code: string }>('leetcode-link', { action: 'start', username });
}

export function verifyLeetCodeLink() {
  return callFunction<{ verified: boolean; username?: string }>('leetcode-link', { action: 'verify' });
}

export async function getLeetCodeLink() {
  return check(await supabase.from('leetcode_links').select('leetcode_username, verify_code, verified_at').maybeSingle());
}

export function syncProfile(force = false) {
  return callFunction<{ synced: boolean }>('sync-profile', { force });
}

export function deleteAccount() {
  return callFunction<{ deleted: boolean }>('delete-account');
}

// ---------- Problems & posting ----------

export async function searchProblems(q: string): Promise<Problem[]> {
  if (!q.trim()) return [];
  return check(await supabase.rpc('search_problems', { q }));
}

export function postSolve(input: { problem_slug: string; started_at?: string; ended_at?: string; active_seconds?: number; note?: string }) {
  return callFunction<{ solve: { id: string; time_seconds: number | null }; problem: Problem }>('post-solve', input);
}

export async function uploadSolveMedia(
  userId: string,
  solveId: string,
  items: { uri: string; kind: 'photo' | 'video'; mimeType: string; duration?: number | null }[],
) {
  for (const [position, item] of items.entries()) {
    const ext = item.mimeType.split('/')[1]?.replace('quicktime', 'mov') ?? 'bin';
    const path = `${userId}/${solveId}/${position}-${Date.now()}.${ext}`;
    // React Native's fetch can't reliably read local files as bytes; the web can
    const bytes = Platform.OS === 'web' ? await (await fetch(item.uri)).arrayBuffer() : await new File(item.uri).bytes();
    const { error: uploadError } = await supabase.storage.from('solve-media').upload(path, bytes, { contentType: item.mimeType });
    if (uploadError) throw new ApiError('upload_failed', uploadError.message);
    check(
      await supabase.from('solve_media').insert({
        solve_id: solveId,
        user_id: userId,
        kind: item.kind,
        storage_path: path,
        duration_seconds: item.duration ? Math.max(1, Math.min(60, Math.round(item.duration))) : null,
        position,
      }),
    );
  }
}

export async function fetchCelebration(solveId: string): Promise<Celebration | null> {
  return check(await supabase.rpc('solve_celebration', { p_solve_id: solveId })) as Celebration | null;
}

// ---------- Feed ----------

const SOLVE_SELECT = `
  id, user_id, problem_slug, time_seconds, language, note, created_at,
  profile:profiles!solves_user_id_fkey(${PERSON}),
  problem:problems(title, frontend_id, difficulty),
  media:solve_media(id, kind, storage_path, duration_seconds, position),
  likes(count),
  comments(count)
`;

async function signMedia(solves: FeedSolve[]): Promise<FeedSolve[]> {
  const paths = solves.flatMap((s) => s.media.map((m) => m.storage_path));
  if (paths.length === 0) return solves;
  const { data } = await supabase.storage.from('solve-media').createSignedUrls(paths, 60 * 60);
  const urls = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return solves.map((s) => ({
    ...s,
    media: [...s.media].sort((a, b) => a.position - b.position).map((m) => ({ ...m, url: urls.get(m.storage_path) ?? undefined })),
  }));
}

async function shapeSolves(rows: any[], userId: string): Promise<FeedSolve[]> {
  const ids = rows.map((r) => r.id);
  const liked = ids.length
    ? check(await supabase.from('likes').select('solve_id').eq('user_id', userId).in('solve_id', ids))
    : [];
  const likedSet = new Set((liked as { solve_id: string }[]).map((l) => l.solve_id));
  const shaped: FeedSolve[] = rows.map((r) => ({
    ...r,
    media: (r.media ?? []) as SolveMedia[],
    likes_count: r.likes?.[0]?.count ?? 0,
    comments_count: r.comments?.[0]?.count ?? 0,
    liked_by_me: likedSet.has(r.id),
  }));
  return signMedia(shaped);
}

// Everything the viewer may see: own + friends, today's friend solves only once unlocked (enforced in the database)
export async function fetchFeed(userId: string): Promise<FeedSolve[]> {
  const rows = check(await supabase.from('solves').select(SOLVE_SELECT).order('created_at', { ascending: false }).limit(50));
  return shapeSolves(rows as any[], userId);
}

export async function fetchSolve(solveId: string, userId: string): Promise<FeedSolve | null> {
  const row = check(await supabase.from('solves').select(SOLVE_SELECT).eq('id', solveId).maybeSingle());
  if (!row) return null;
  return (await shapeSolves([row], userId))[0];
}

export async function fetchUserSolves(targetId: string, viewerId: string, limit = 20): Promise<FeedSolve[]> {
  const rows = check(
    await supabase.from('solves').select(SOLVE_SELECT).eq('user_id', targetId).order('created_at', { ascending: false }).limit(limit),
  );
  return shapeSolves(rows as any[], viewerId);
}

export async function fetchTeasers(): Promise<Teaser[]> {
  return check(await supabase.rpc('todays_feed_teasers'));
}

export async function hasPostedToday(userId: string): Promise<boolean> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from('solves')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', start.toISOString());
  if (error) throw new ApiError('db_error', error.message);
  return (count ?? 0) > 0;
}

export async function setLiked(solveId: string, userId: string, liked: boolean) {
  if (liked) check(await supabase.from('likes').insert({ solve_id: solveId, user_id: userId }));
  else check(await supabase.from('likes').delete().eq('solve_id', solveId).eq('user_id', userId));
}

export async function deleteSolve(solveId: string) {
  check(await supabase.from('solves').delete().eq('id', solveId));
}

// ---------- Comments ----------

export async function fetchComments(solveId: string): Promise<Comment[]> {
  return check(
    await supabase
      .from('comments')
      .select(`id, solve_id, user_id, body, created_at, profile:profiles!comments_user_id_fkey(${PERSON})`)
      .eq('solve_id', solveId)
      .order('created_at', { ascending: true }),
  ) as unknown as Comment[];
}

export async function addComment(solveId: string, userId: string, body: string) {
  check(await supabase.from('comments').insert({ solve_id: solveId, user_id: userId, body: body.trim() }));
}

export async function deleteComment(commentId: string) {
  check(await supabase.from('comments').delete().eq('id', commentId));
}

// ---------- Safety ----------

export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'cheating' | 'other';

export async function reportSolve(solveId: string, reason: ReportReason, details?: string) {
  check(await supabase.from('reports').insert({ solve_id: solveId, reason, details: details || null }));
}

export async function reportComment(commentId: string, reason: ReportReason, details?: string) {
  check(await supabase.from('reports').insert({ comment_id: commentId, reason, details: details || null }));
}

export async function blockUser(blockerId: string, blockedId: string) {
  check(await supabase.from('blocks').insert({ blocker_id: blockerId, blocked_id: blockedId }));
}

export async function unblockUser(blockerId: string, blockedId: string) {
  check(await supabase.from('blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId));
}

export async function fetchBlocked(): Promise<PersonSummary[]> {
  const rows = check(await supabase.from('blocks').select(`blocked:profiles!blocks_blocked_id_fkey(${PERSON})`));
  return (rows as any[]).map((r) => r.blocked).filter(Boolean);
}

// ---------- Friends ----------

export async function searchPeople(q: string, selfId: string): Promise<PersonSummary[]> {
  // Keep only characters that can't break PostgREST's filter syntax
  const term = q.trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_ ]/g, '');
  if (term.length < 2) return [];
  const rows = check(
    await supabase
      .from('profiles')
      .select(PERSON)
      .or(`username.ilike.*${term}*,display_name.ilike.*${term}*`)
      .neq('id', selfId)
      .limit(15),
  );
  return rows as PersonSummary[];
}

export async function fetchFriendships(selfId: string): Promise<FriendRow[]> {
  const rows = check(
    await supabase
      .from('friendships')
      .select(
        `requester_id, addressee_id, status, created_at,
         requester:profiles!friendships_requester_id_fkey(${PERSON}),
         addressee:profiles!friendships_addressee_id_fkey(${PERSON})`,
      )
      .order('created_at', { ascending: false }),
  );
  return (rows as any[]).map((r) => {
    const outgoing = r.requester_id === selfId;
    return { ...r, other: outgoing ? r.addressee : r.requester, direction: outgoing ? 'outgoing' : 'incoming' };
  });
}

export async function sendFriendRequest(selfId: string, otherId: string) {
  check(await supabase.from('friendships').insert({ requester_id: selfId, addressee_id: otherId }));
}

export async function acceptFriendRequest(requesterId: string, selfId: string) {
  check(await supabase.from('friendships').update({ status: 'accepted' }).eq('requester_id', requesterId).eq('addressee_id', selfId));
}

// Decline, cancel or unfriend: the row is the same whichever side asked
export async function removeFriendship(a: string, b: string) {
  check(
    await supabase
      .from('friendships')
      .delete()
      .or(`and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`),
  );
}

// ---------- Profile, ranks, notifications ----------

export async function fetchProfileSummary(username: string): Promise<ProfileSummary | null> {
  return check(await supabase.rpc('profile_summary', { target_username: username })) as ProfileSummary | null;
}

export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const rows = check(await supabase.rpc('weekly_leaderboard'));
  return (rows as any[]).map((r) => ({ ...r, id: r.user_id }));
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  return check(
    await supabase
      .from('notifications')
      .select(
        `id, kind, solve_id, comment_id, read_at, created_at,
         actor:profiles!notifications_actor_id_fkey(${PERSON}),
         solve:solves(problem:problems(title)),
         comment:comments(body)`,
      )
      .order('created_at', { ascending: false })
      .limit(60),
  ) as unknown as AppNotification[];
}

export async function unreadNotificationCount(): Promise<number> {
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  return count ?? 0;
}

export async function markNotificationsRead() {
  check(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null));
}

export async function updateProfile(selfId: string, fields: { display_name?: string; timezone?: string; avatar_url?: string | null }) {
  check(await supabase.from('profiles').update(fields).eq('id', selfId));
}
