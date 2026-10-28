export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export const DIFFICULTY_POINTS: Record<Difficulty, number> = { Easy: 1, Medium: 3, Hard: 5 };

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  timezone: string;
  leetcode_username: string | null;
  lc_easy: number;
  lc_medium: number;
  lc_hard: number;
  lc_ranking: number | null;
  lc_synced_at: string | null;
  created_at: string;
}

export interface PersonSummary {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface Problem {
  slug: string;
  frontend_id: number;
  title: string;
  difficulty: Difficulty;
  paid_only: boolean;
}

export interface SolveMedia {
  id: string;
  kind: 'photo' | 'video';
  storage_path: string;
  duration_seconds: number | null;
  position: number;
  url?: string;
}

export interface FeedSolve {
  id: string;
  user_id: string;
  problem_slug: string;
  time_seconds: number | null;
  language: string | null;
  note: string | null;
  created_at: string;
  profile: PersonSummary;
  problem: Pick<Problem, 'title' | 'frontend_id' | 'difficulty'>;
  media: SolveMedia[];
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
}

export interface Teaser {
  solve_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  difficulty: Difficulty;
  points: number;
  created_at: string;
  media_count: number;
}

export interface Comment {
  id: string;
  solve_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profile: PersonSummary;
}

export type Relationship = 'self' | 'friends' | 'request_sent' | 'request_received' | 'none';

export interface ProfileSummary extends PersonSummary {
  leetcode_username: string | null;
  lc_easy: number;
  lc_medium: number;
  lc_hard: number;
  lc_ranking: number | null;
  lc_calendar: Record<string, number>;
  lc_synced_at: string | null;
  streak: number;
  posted_today: boolean;
  friends_count: number;
  relationship: Relationship;
}

export interface LeaderboardRow extends PersonSummary {
  user_id: string;
  points: number;
  solves: number;
}

export type NotificationKind = 'like' | 'comment' | 'friend_request' | 'friend_accept';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  solve_id: string | null;
  comment_id: string | null;
  read_at: string | null;
  created_at: string;
  actor: PersonSummary | null;
  solve: { problem: { title: string } | null } | null;
  comment: { body: string } | null;
}

export interface FriendRow {
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
  other: PersonSummary;
  direction: 'incoming' | 'outgoing';
}

export interface LeetCodePreview {
  username: string;
  realName: string | null;
  avatar: string | null;
  ranking: number | null;
  easy: number;
  medium: number;
  hard: number;
}
