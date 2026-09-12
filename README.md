# CodeSynq Firebase update portal

Deploy this folder as a static site on Netlify. It publishes the current Windows release to the Realtime Database endpoint derived from `FIREBASE_DATABASE_URL`:

`<FIREBASE_DATABASE_URL>/appUpdates/windows/latest.json`

The release record has `version`, `downloadUrl`, `fileName`, `mandatory`, `releaseNotes`, and `publishedAt` fields. Upload the installer to a GitHub Release first, then paste its direct asset URL (for example `https://github.com/OWNER/REPO/releases/download/v1.0.1/CodeSynq-Setup-1.0.1.exe`). The portal only writes the version metadata to Firebase.

Before deploying, merge the `appUpdates` rule from `firebase-rules.json` into your Realtime Database rules.

Sign in using an existing Firebase Email/Password account. The page allows publishing only when `users/{uid}/isAdmin` is `true`.

## Netlify environment variables

Add these in **Site configuration → Environment variables**:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_DATABASE_URL`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_APP_ID`

Optional: `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, and `FIREBASE_MEASUREMENT_ID`.

The Netlify build command creates `firebase-config.js` from these values. This generated file is ignored by Git. Firebase web configuration is visible to browsers by design; never add Firebase Admin SDK credentials, service-account JSON, or other private keys as client-side environment variables.
