// Thin client for LeetCode's public GraphQL endpoint.
// It's unofficial: keep every call server-side, small and infrequent.

const ENDPOINT = 'https://leetcode.com/graphql';

export class LeetCodeError extends Error {}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', referer: 'https://leetcode.com' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new LeetCodeError(`LeetCode responded ${res.status}`);
  const body = await res.json();
  // LeetCode reports "user does not exist" as an error alongside data: { matchedUser: null },
  // so only treat errors as fatal when no data came back
  if (!body.data) throw new LeetCodeError(body.errors?.[0]?.message ?? 'LeetCode query failed');
  return body.data as T;
}

export interface LeetCodeProfile {
  username: string;
  realName: string | null;
  aboutMe: string;
  avatar: string | null;
  githubUrl: string | null;
  ranking: number | null;
  easy: number;
  medium: number;
  hard: number;
}

export async function fetchProfile(username: string): Promise<LeetCodeProfile | null> {
  const data = await gql<{
    matchedUser: null | {
      username: string;
      githubUrl: string | null;
      profile: { realName: string | null; aboutMe: string | null; ranking: number | null; userAvatar: string | null };
      submitStatsGlobal: { acSubmissionNum: { difficulty: string; count: number }[] };
    };
  }>(
    `query($u: String!) { matchedUser(username: $u) {
      username
      githubUrl
      profile { realName aboutMe ranking userAvatar }
      submitStatsGlobal { acSubmissionNum { difficulty count } }
    } }`,
    { u: username },
  );
  const u = data.matchedUser;
  if (!u) return null;
  const count = (d: string) => u.submitStatsGlobal.acSubmissionNum.find((x) => x.difficulty === d)?.count ?? 0;
  return {
    username: u.username,
    realName: u.profile.realName || null,
    aboutMe: u.profile.aboutMe ?? '',
    avatar: u.profile.userAvatar,
    githubUrl: u.githubUrl,
    ranking: u.profile.ranking,
    easy: count('Easy'),
    medium: count('Medium'),
    hard: count('Hard'),
  };
}

export interface LeetCodeCalendar {
  streak: number;
  activeDays: number;
  // Unix-day (UTC midnight, seconds) -> submissions that day
  days: Record<string, number>;
}

export async function fetchCalendar(username: string): Promise<LeetCodeCalendar | null> {
  const data = await gql<{
    matchedUser: null | { userCalendar: { streak: number; totalActiveDays: number; submissionCalendar: string } };
  }>(
    `query($u: String!) { matchedUser(username: $u) { userCalendar { streak totalActiveDays submissionCalendar } } }`,
    { u: username },
  );
  const cal = data.matchedUser?.userCalendar;
  if (!cal) return null;
  return { streak: cal.streak, activeDays: cal.totalActiveDays, days: JSON.parse(cal.submissionCalendar || '{}') };
}

export interface AcceptedSubmission {
  id: string;
  titleSlug: string;
  timestamp: number; // unix seconds
  lang: string;
}

// Public data only returns the most recent accepted submissions (about 20)
export async function fetchRecentAccepted(username: string, limit = 20): Promise<AcceptedSubmission[]> {
  const data = await gql<{ recentAcSubmissionList: { id: string; titleSlug: string; timestamp: string; lang: string }[] | null }>(
    `query($u: String!, $n: Int!) { recentAcSubmissionList(username: $u, limit: $n) { id titleSlug timestamp lang } }`,
    { u: username, n: limit },
  );
  return (data.recentAcSubmissionList ?? []).map((s) => ({ ...s, timestamp: Number(s.timestamp) }));
}

export interface ProblemRow {
  slug: string;
  frontend_id: number;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  paid_only: boolean;
}

export async function fetchProblemsPage(skip: number, limit: number): Promise<{ total: number; rows: ProblemRow[] }> {
  const data = await gql<{
    questionList: {
      totalNum: number;
      data: { questionFrontendId: string; title: string; titleSlug: string; difficulty: 'Easy' | 'Medium' | 'Hard'; isPaidOnly: boolean }[];
    };
  }>(
    `query($skip: Int!, $limit: Int!) { questionList(categorySlug: "", limit: $limit, skip: $skip, filters: {}) {
      totalNum
      data { questionFrontendId title titleSlug difficulty isPaidOnly }
    } }`,
    { skip, limit },
  );
  return {
    total: data.questionList.totalNum,
    rows: data.questionList.data
      .filter((q) => /^\d+$/.test(q.questionFrontendId))
      .map((q) => ({
        slug: q.titleSlug,
        frontend_id: Number(q.questionFrontendId),
        title: q.title,
        difficulty: q.difficulty,
        paid_only: q.isPaidOnly,
      })),
  };
}
