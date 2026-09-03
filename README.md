# Lifetime Finance

Lifetime is a mobile-first personal and shared finance hub. It keeps Personal records owner-only, shares only records explicitly placed in Together, and treats transfers as movement between accounts instead of income or spending.

The production web app is [myfocalpoint.netlify.app](https://myfocalpoint.netlify.app). The repository also contains a bundled Capacitor iOS client; it does not load the website inside a remote wrapper.

## Product status

Working end to end:

- Google sign-in, plus an Apple sign-in entry point for projects that enable the Apple provider
- Empty, per-user Supabase workspaces with no fictional balances
- Personal and Together spaces protected by Postgres Row Level Security
- Email-matched, single-use Together invitation links; member removal, leave, and close flows
- Accounts, transfers, income, spending, recurring payments, budgets, goals, and future events
- Editable Revolut-style activity feed and full ledger view
- CSV/Google Sheets paste import, duplicate checks, review inbox, and receipt/screenshot scanning
- Voice or typed capture with user vocabulary and mandatory review before records are saved
- Deterministic cash-flow, resilience, goal-date, and planned-event forecasts
- Optional Qwen coaching, speech recognition, and receipt extraction; AI is off until each user consents
- Optimistic multi-device saving, conflict merging, local fallback, JSON backup/restore, and server recovery history
- Account deletion, privacy/terms/support pages, secure headers, AI request limits, and health endpoint
- Responsive PWA and a native iOS project with deep-link OAuth, haptics, safe areas, branded assets, and privacy manifest

Not included in this release:

- Direct bank feeds or money movement. Data enters through manual/voice capture, CSV/Sheets, or receipt/payment screenshots.
- End-to-end/zero-knowledge encryption. Supabase RLS isolates users and Together spaces, but the Supabase project administrator can administer hosted data.
- Financial, tax, legal, or investment advice. Forecasts are estimates based on the records supplied.

## Database setup

Create a Supabase project and run both migrations, in order, in its SQL Editor:

1. `supabase/migrations/20260901000000_initial_finance.sql`
2. `supabase/migrations/20260903000000_product_hardening.sql`

The first creates the storage model, profiles, membership rules, and invitation claim flow. The second adds safe multi-device revisions, the last 25 server recovery points per space, secure invitation tokens, AI rate limits, and account deletion.

Never put a Supabase secret/service-role key or the Qwen API key in browser-visible variables. The app uses only the Supabase publishable key in its clients; database access is restricted by RLS.

## Authentication

### Google

Create a Google Web OAuth client. Add the local and production origins to Authorized JavaScript origins, and add the Supabase callback shown on its Google provider page to Authorized redirect URIs (normally `https://YOUR_PROJECT.supabase.co/auth/v1/callback`). Enable Google in Supabase Authentication.

### Apple

Enable Apple in Supabase Authentication after creating the required Apple Services ID and key. Apple requires secret rotation; follow the Supabase Apple provider guide and track the expiry date in the release calendar.

Set the Supabase Site URL to `https://myfocalpoint.netlify.app` and allow these redirect URLs:

```text
http://localhost:3000/auth/callback
https://myfocalpoint.netlify.app/auth/callback
com.adityav2000.focalpoint://auth/callback
```

## Environment variables

Copy `.env.example` to `.env.local` for local work. Configure the same values in Netlify, using the production URL for `NEXT_PUBLIC_SITE_URL`.

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APPLE_AUTH_ENABLED=false

# Optional server-only AI configuration
DASHSCOPE_API_KEY=
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen3.6-flash
QWEN_ASR_MODEL=qwen3-asr-flash
QWEN_VISION_MODEL=qwen3-vl-flash
```

Keep `NEXT_PUBLIC_APPLE_AUTH_ENABLED=false` until the Apple provider is actually enabled in Supabase; set it to `true` for the App Store build only after the real sign-in flow passes on a device. This prevents an unfinished provider from appearing as a broken production button.

Use Node 22 or newer:

```bash
npm install
npm run dev
```

## Deploying the web app

Connect `adityav2000sg/focalpoint` to Netlify. `netlify.toml` selects Node 22 and the standard Next.js production build. Add the environment variables above for every Netlify deploy context, then trigger a production deploy.

`GET /api/health` is the deployment smoke test. It reports whether the public Supabase configuration and optional Qwen service are present without exposing their values.

## Building the iOS app

The native bundle calls the production API with the signed-in Supabase access token. Build and sync it with:

```bash
npm run ios:sync
npm run ios:open
```

In Xcode, select the App target, choose the Apple developer team, verify bundle ID `com.adityav2000.focalpoint`, test Google and Apple sign-in on a real device, then archive and upload. The remaining credential and App Store Connect steps are listed in [`docs/APP_STORE_RELEASE.md`](docs/APP_STORE_RELEASE.md).

## Verification

```bash
npm run verify
npm run test:e2e
```

`verify` runs unit tests, TypeScript, the Next.js production build, and the bundled mobile build. CI repeats those checks and the desktop/mobile browser journeys on every push and pull request.

## Storage model

`finance_spaces` is the authoritative cross-device store. Every user owns one Personal snapshot; a Together snapshot is created only when an invitation is saved. `finance_space_members` controls shared access, `finance_profiles.active_household_id` selects the active Together space, and `finance_space_history` contains recovery snapshots. A per-user local browser backup supports temporary offline use but never replaces Supabase as the shared source of truth.
