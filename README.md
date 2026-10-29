# LeetUp

Strava for LeetCode, with BeReal's lock. Time a solve, post it, and only then see what your friends solved today. Your profile mirrors your real LeetCode account; every post is verified against an Accepted submission.

## Run it locally

Needs Node 22, Docker and Deno.

```bash
npm install
npm run db:start      # local Supabase on ports 554xx (doesn't clash with other projects)
cp .env.example .env  # then paste API_URL and ANON_KEY from `npx supabase status -o env`
npm run functions     # Edge Functions, in a second terminal
curl -X POST http://127.0.0.1:55421/functions/v1/sync-problems \
  -H "authorization: Bearer <SERVICE_ROLE_KEY from supabase status>"   # one-off: copy LeetCode's problem list
npm run db:seed       # demo friends, solves, comments
npx expo start        # i = iOS simulator, w = browser
```

Demo sign-in (email): `you@leetup.test` / `leetup-demo-123`. Home starts locked; post a solve (or re-run the seed) to unlock.

Checks: `npm run typecheck` (app + Edge Functions) and `npm test` (unit tests + 46 database tests).

## How it fits together

| Layer | Where | Notes |
|---|---|---|
| App | `app/` (expo-router), `components/`, `lib/` | Design tokens in `constants/theme.ts` mirror the LeetUp design system |
| Database | `supabase/migrations/` | Row-level security enforces the lock: friends' posts from today are invisible until you post today (except on the day you join) |
| Server | `supabase/functions/` | The only code that talks to LeetCode. Solves are written only by `post-solve`, after it finds a matching Accepted submission |
| Tests | `supabase/tests/`, `tests/` | pgTAP access rules; Deno unit tests |

Edge Functions: `leetcode-link` (connect + verification), `post-solve`, `sync-profile` (stats + activity calendar), `sync-problems` (admin), `delete-account`.

**First-day pass.** The feed is fully open on the local day someone joins, so they can look around before posting. The lock starts at their first midnight.

**Verification.** Entering a LeetCode username links it straight away, unverified: the profile shows no LeetCode stats until it's proven. Ownership is proven by any of:
- the first post of any problem submitted after linking (only the owner can submit on the account)
- signing in with (or linking) the GitHub account the LeetCode profile lists
- a code in the LeetCode profile Summary (fallback on the Verify screen)

Unverified claims don't reserve a username; when the real owner verifies, other unverified claims to it are removed. A post is the weakest proof (someone could post another person's public submission first), so GitHub or the profile code takes a username back from a link that only a post verified.

**Mentions.** Typing `@` in a comment suggests the post's owner, people in the thread and your friends who can see the post. Tagged people get a notification if they can see the post and haven't blocked anyone involved.

LeetCode's GraphQL endpoint is public but unofficial. All calls are server-side, small and cached; if it changes, only `supabase/functions/_shared/leetcode.ts` needs updating.

## Launch checklist (needs your accounts)

1. **Supabase project.** Create one at supabase.com, then:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   npx supabase functions deploy
   ```
   Call `sync-problems` once with the service role key, and schedule it daily (Dashboard → Integrations → Cron).
2. **Auth URLs.** Authentication → URL Configuration: add `leetup://auth-callback` to redirect URLs. Set up SMTP and turn on email confirmations.
3. **Sign in with Apple.** In Apple Developer, enable Sign in with Apple for `com.leetup.app`. In Supabase → Auth → Providers → Apple, add `com.leetup.app` as a client ID (native sign-in, no secret needed for iOS).
4. **Google sign-in.** Create a Web OAuth client in Google Cloud, add Supabase's callback URL to it, and paste the client ID + secret into Supabase → Auth → Providers → Google.
5. **GitHub sign-in.** Create an OAuth app at github.com/settings/developers with callback `https://<ref>.supabase.co/auth/v1/callback`, paste the client ID + secret into Supabase → Auth → Providers → GitHub, and turn on Auth → Settings → "Allow manual linking" so email/Apple users can add GitHub to verify.
6. **EAS builds.**
   ```bash
   npm i -g eas-cli && eas login && eas init
   eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co
   eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key>
   # repeat both for --environment production
   eas build -p ios --profile preview      # install on your phone
   eas build -p ios --profile production && eas submit -p ios
   ```
7. **App Store Connect.** App record, screenshots, age rating, support URL, and live pages for `https://leetup.app/privacy` and `https://leetup.app/terms` (Settings links to them). Give App Review a demo account that's already linked to a LeetCode account.
8. **Name.** Run a trademark search for "LeetUp" (IP Australia, USPTO) before submitting.

## Not built yet

- Push notifications (needs an APNs key; in-app notifications work)
- Groups (the tab is a placeholder)
- Video thumbnails in the feed (videos show a play tile)
- The optional deeper LeetCode link (attempts, beats %, code)
- Rate limiting on Edge Functions
