import { supabase } from './supabase';
import { ApiError } from './api';
import { DIFFICULTY_POINTS, LeaderboardRow } from '../types';

const DAY = 86400;

// All-time board: self + accepted friends, scored from their real LeetCode counts
export async function fetchAllTimeLeaderboard(selfId: string): Promise<LeaderboardRow[]> {
  const { data: links, error: linkError } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted');
  if (linkError) throw new ApiError(linkError.code ?? 'db_error', linkError.message);
  const ids = new Set([selfId]);
  (links ?? []).forEach((l) => ids.add(l.requester_id === selfId ? l.addressee_id : l.requester_id));

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, lc_easy, lc_medium, lc_hard')
    .in('id', [...ids]);
  if (error) throw new ApiError(error.code ?? 'db_error', error.message);

  return (data ?? [])
    .map((p) => {
      const e = p.lc_easy ?? 0;
      const m = p.lc_medium ?? 0;
      const h = p.lc_hard ?? 0;
      return {
        id: p.id,
        user_id: p.id,
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        points: e * DIFFICULTY_POINTS.Easy + m * DIFFICULTY_POINTS.Medium + h * DIFFICULTY_POINTS.Hard,
        solves: e + m + h,
      };
    })
    .sort((a, b) => b.points - a.points || b.solves - a.solves);
}

// ISO 8601 week number of a local date
export function isoWeek(now = new Date()): number {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 1000 / DAY + 1) / 7);
}

export interface CalendarCell {
  key: string;
  count: number;
  future: boolean;
}

// weeks × 7 grid (oldest week first, Mon → Sun) keyed by UTC midnight like LeetCode's calendar
export function buildCalendar(calendar: Record<string, number> | null | undefined, weeks = 12, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
  const mondayOffset = (now.getUTCDay() + 6) % 7;
  const start = today - (mondayOffset + (weeks - 1) * 7) * DAY;
  let activeDays = 0;
  let submissions = 0;
  const columns: CalendarCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: CalendarCell[] = [];
    for (let r = 0; r < 7; r++) {
      const ts = start + (w * 7 + r) * DAY;
      const key = String(ts);
      const future = ts > today;
      const count = future ? 0 : Number(calendar?.[key] ?? 0);
      if (count > 0) {
        activeDays++;
        submissions += count;
      }
      column.push({ key, count, future });
    }
    columns.push(column);
  }
  return { columns, activeDays, submissions };
}
