// Probe LeetCode's public GraphQL endpoint to confirm the data LeetUp relies on.
// Usage: node scripts/leetcode-probe.mjs <username>
const username = process.argv[2] ?? 'lee215';
const ENDPOINT = 'https://leetcode.com/graphql';

async function gql(query, variables) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', referer: 'https://leetcode.com' },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text.slice(0, 300) };
  }
}

const checks = {
  profile: [
    `query($u:String!){ matchedUser(username:$u){ username profile{ realName aboutMe ranking userAvatar } submitStatsGlobal{ acSubmissionNum{ difficulty count } } } }`,
    { u: username },
  ],
  calendar: [
    `query($u:String!){ matchedUser(username:$u){ userCalendar{ streak totalActiveDays submissionCalendar } } }`,
    { u: username },
  ],
  recentAccepted: [
    `query($u:String!,$n:Int!){ recentAcSubmissionList(username:$u, limit:$n){ id title titleSlug timestamp lang } }`,
    { u: username, n: 20 },
  ],
  problemSearch: [
    `query($f:QuestionListFilterInput){ problemsetQuestionList: questionList(categorySlug:"", limit:5, skip:0, filters:$f){ total: totalNum questions: data{ frontendQuestionId: questionFrontendId title titleSlug difficulty paidOnly: isPaidOnly } } }`,
    { f: { searchKeywords: 'two sum' } },
  ],
};

for (const [name, [query, vars]] of Object.entries(checks)) {
  const { status, body } = await gql(query, vars);
  console.log(`\n=== ${name} (HTTP ${status})`);
  console.log(JSON.stringify(body, (k, v) => (k === 'submissionCalendar' && typeof v === 'string' ? `${v.slice(0, 80)}… (${Object.keys(JSON.parse(v)).length} days)` : v), 2).slice(0, 1500));
}
