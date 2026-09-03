# Lifetime iOS release checklist

The repository contains a compiling Capacitor iOS application with a local web bundle, Supabase session storage, OAuth deep-link handling, native haptics, camera and microphone purpose strings, branded icon/launch assets, and an Apple privacy manifest.

## Credential setup

These steps require the account owner and cannot be committed to source control:

1. Join the Apple Developer Program and create an App ID for `com.adityav2000.focalpoint`.
2. Create the App Store Connect record named **Lifetime Finance** (or the final cleared store name).
3. In Xcode Signing & Capabilities, select the correct developer team and let Xcode create the distribution profile.
4. Configure Supabase Apple sign-in with the Apple Services ID, key, team ID, and generated secret. Record the secret’s renewal date.
5. Add `com.adityav2000.focalpoint://auth/callback` to Supabase Authentication’s redirect allow list.
6. Confirm Netlify production contains the Supabase public variables and server-only Qwen key.

## Required device acceptance test

- Fresh install opens login, not sample finance data.
- Google and Apple sign-in return to the app and survive a relaunch.
- Add/edit/delete one account and one transaction; a second signed-in device receives the saved result.
- Transfer between two accounts changes both balances but not income, spending, or savings rate.
- CSV import, receipt scan, typed capture, and voice capture all enter the review flow correctly.
- AI cannot run until consent is enabled; disabling it prevents further server calls.
- Create a Together invitation, accept it using the exact invited email, verify Personal remains private, then remove the member.
- Export/restore works; server recovery restores one space without replacing the other.
- Delete Account removes access and returns to login.
- Test offline launch, large Dynamic Type, VoiceOver labels, Reduced Motion, safe-area insets, and an interrupted OAuth flow.

## App Store Connect declarations

Use the production pages for Privacy Policy and Support:

- `https://myfocalpoint.netlify.app/privacy`
- `https://myfocalpoint.netlify.app/support`

Privacy answers must match the final providers and practices. The included manifest declares name, email address, and other financial information as linked data used for app functionality; no tracking is declared. If analytics, crash reporting, bank aggregation, advertising, or another SDK is added, update both the privacy manifest and App Store privacy answers first.

The app should be described as a record-keeping and planning tool. Do not claim it is a bank, moves funds, guarantees forecasts, or provides regulated financial or investment advice.

## Build and upload

```bash
npm ci
npm run verify
npm run test:e2e
npm run ios:sync
```

Open `ios/App/App.xcodeproj`, increment Version and Build, run the acceptance test on a physical iPhone, choose **Any iOS Device**, then use **Product → Archive → Distribute App → App Store Connect**.

Start with internal TestFlight. Invite family testers only after the database migrations and OAuth providers are confirmed in production. Treat their feedback as release-blocking for navigation, data correctness, privacy wording, and accessibility.
