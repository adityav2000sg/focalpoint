# App Store submission — Lifetime

Everything in this file is derived from the code in this repository, not from a template.
Where a value is a judgement call, it says so.

| | |
|---|---|
| App name | Lifetime |
| Bundle ID | `com.adityav2000.focalpoint` |
| Marketing version | `MARKETING_VERSION` in `ios/App/App.xcodeproj` (currently `1.0`) |
| Build number | `CURRENT_PROJECT_VERSION` (currently `1`) |
| Device families | iPhone and iPad (`TARGETED_DEVICE_FAMILY = "1,2"`) |
| Privacy policy URL | `https://myfocalpoint.netlify.app/privacy` |
| Support URL | `https://myfocalpoint.netlify.app/support` |
| Terms URL | `https://myfocalpoint.netlify.app/terms` |

## 1. Blocking — Sign in with Apple

**This is the one item that will get the app rejected outright.**

Review guideline 4.8 (Login Services), verbatim:

> Apps that use a third-party or social login service (such as Facebook Login, Google
> Sign-In, Log in with X, Sign In with LinkedIn, Login with Amazon, or WeChat Login) to set
> up or authenticate the user's primary account with the app must also offer as an
> equivalent option another login service with the following features: the login service
> limits data collection to the user's name and email address; the login service allows
> users to keep their email address private as part of setting up their account; and the
> login service does not collect interactions with your app for advertising purposes
> without consent.

Lifetime offers Google sign-in, so it must also offer a qualifying alternative. Sign in
with Apple qualifies on all three counts (name + email only, Hide My Email, no ad tracking).

The app code is ready: the button is rendered, `signIn("apple")` is wired, and
`NEXT_PUBLIC_APPLE_AUTH_ENABLED` now defaults to on — it must be left on for any build
that goes to review. What remains is configuration that needs an Apple Developer account:

1. Apple Developer Program membership (paid).
2. In the Apple developer portal: create an **App ID** for `com.adityav2000.focalpoint`
   with the *Sign in with Apple* capability, a **Services ID** for the web redirect, and a
   **Sign in with Apple key** (`.p8`). Note the Team ID and Key ID.
3. In Supabase → Authentication → Providers → Apple: enable it and enter the Services ID,
   Team ID, Key ID and the `.p8` contents.
4. Add `https://<your-supabase-ref>.supabase.co/auth/v1/callback` as a Return URL on the
   Services ID.
5. In Xcode, add the *Sign in with Apple* capability to the App target.

Verify by tapping **Continue with Apple** on a real build and completing sign-in. A button
that renders but errors is itself a rejection under guideline 2.1 (App Completeness), so do
not submit until the round trip works.

## 2. App Privacy answers

These follow `ios/App/App/PrivacyInfo.xcprivacy` and the actual data flow. All three are
**linked to identity** and **not used for tracking**; none are used for advertising.

| Data type | Collected | Purpose | Linked | Tracking |
|---|---|---|---|---|
| Name | Yes | App Functionality | Yes | No |
| Email address | Yes | App Functionality | Yes | No |
| Other financial info | Yes | App Functionality | Yes | No |

Answer **No** to the tracking question — `NSPrivacyTracking` is `false` and there are no
tracking domains, no analytics SDK and no ad SDK in the dependency tree.

Notes for the reviewer questionnaire:

- **Financial info** covers the balances, transactions, goals and plans the user enters.
  It is stored in Supabase under row-level security scoped to the owner.
- **Audio** is *not* a collected data type. Voice recordings are sent for transcription
  only when the user enables *Reliable voice transcription* (off by default) and only for
  the clip they deliberately record; nothing is written to the database. If App Review
  asks, this is the honest description.
- Optional AI (Coach and voice) is off by default behind two independent consents. Neither
  can be enabled implicitly by the other — this is enforced server-side in
  `src/lib/server/aiAccess.ts`.

`NSPrivacyAccessedAPITypes` is intentionally empty: the app uses only `@capacitor/app`,
`browser`, `haptics` and `core`, none of which call a required-reason API, and web
`localStorage` inside WKWebView is not the `UserDefaults` API. If App Store Connect returns
ITMS-91053 on upload, it will name the exact API and category to add.

## 3. Usage strings

Already in `Info.plist`, and both are specific about *when* access happens, which is what
review looks for:

- `NSMicrophoneUsageDescription` — "Lifetime uses the microphone only when you choose to
  capture a transaction or ask Coach by voice."
- `NSCameraUsageDescription` — "Lifetime uses the camera only when you choose to scan a
  receipt into your review inbox."

`ITSAppUsesNonExemptEncryption` is `false`, which is correct: the app uses only HTTPS and
platform crypto, so no export compliance documentation is required.

## 4. Account deletion

Guideline 5.1.1(v) requires in-app account deletion for any app that supports account
creation. Lifetime has it: **Settings → Danger zone → Delete account**, which calls
`DELETE /api/account` and removes the auth user plus the data it owns. Point the reviewer
at that path in the review notes.

## 5. Listing copy (draft — edit to taste)

- **Name:** Lifetime
- **Subtitle (30 chars max):** `Money, alone and together` (25)
- **Category:** Finance. Secondary: Productivity.
- **Age rating:** 4+ — no objectionable content, no user-generated content shared publicly.
- **Keywords (100 chars max):** `budget,net worth,savings,goals,expenses,shared,couple,household,forecast,SGD` (76)

**Description draft:**

> Lifetime is a calm place for the money you manage alone and the money you manage with
> someone else.
>
> Personal records stay yours. Anything you deliberately put in Together becomes visible to
> the people you invite — nothing else does.
>
> • One ledger for balances, transactions and transfers, where a transfer never pretends to
>   be spending
> • A horizon that shows what is actually due next, and says when something is overdue
> • Goals and planned events on one model, so a trip you add shows what it costs your
>   savings date
> • Accounts in any currency, converted with rates you set yourself
> • Voice or typed capture, with every result shown to you before it is saved
> • Forecasts that state their own confidence instead of inventing certainty from thin data
>
> Optional AI is off by default, with separate switches for the Coach and for voice
> transcription. Lifetime never moves money.

## 6. Screenshots

Generated from the real app against a representative workspace:

```bash
npm run store:screenshots
```

Output lands in `store-assets/screenshots/`, at exactly the sizes App Store Connect
requires for an app that runs on both iPhone and iPad:

- `iphone-6.9/` — 1320 × 2868 (required)
- `ipad-13/` — 2064 × 2752 (required, because the app targets iPad)

JPEG, because App Store Connect rejects images with an alpha channel. The Next.js dev
overlay is suppressed during this run only, via `STORE_SCREENSHOTS=1`.

## 7. Build and upload

```bash
npm run verify
npm run ios:sync
npm run ios:open
```

In Xcode: select *Any iOS Device*, set the team and signing, bump
`CURRENT_PROJECT_VERSION` for each upload, then Product → Archive → Distribute App.

## 8. What still needs you

Everything below requires your Apple account and cannot be done from this repository:

- [ ] Apple Developer Program membership
- [ ] Sign in with Apple configured end to end (section 1) — **blocking**
- [ ] Signing certificate and provisioning profile
- [ ] App record created in App Store Connect with the bundle ID above
- [ ] Screenshots uploaded from `store-assets/screenshots/`
- [ ] App Privacy questionnaire filled in per section 2
- [ ] Review notes: mention that Together needs a second account, and point to
      Settings → Danger zone for account deletion
- [ ] Archive and upload
