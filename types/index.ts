export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  leetcode_username: string | null;
  current_streak: number;
  longest_streak: number;
  total_solves: number;
  created_at: string;
}

export interface Solve {
  id: string;
  user_id: string;
  problem_name: string;
  problem_number: number | null;
  difficulty: Difficulty;
  time_seconds: number;
  submissions: number;
  runtime_percentile: number | null;
  memory_percentile: number | null;
  image_url: string | null;
  created_at: string;
  // Joined fields
  profile?: Profile;
  likes_count?: number;
  liked_by_me?: boolean;
}

export interface Like {
  id: string;
  user_id: string;
  solve_id: string;
  created_at: string;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
}

export interface LeaderboardEntry {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  solve_count: number;
  weighted_score: number;
  avg_time_seconds: number;
  rank: number;
}

export const DIFFICULTY_POINTS: Record<Difficulty, number> = {
  Easy: 1,
  Medium: 3,
  Hard: 5,
};

export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  Easy: '#00d68f',
  Medium: '#ffa502',
  Hard: '#ff4757',
};
