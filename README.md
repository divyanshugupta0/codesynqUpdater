# CodeSynq Desktop · Release & Update Orchestrator

The **CodeSynq Desktop Release & Update Orchestrator** is an enterprise-grade release management dashboard, security auditing center, and live update distribution portal for CodeSynq Desktop.

It distributes releases to the Windows desktop client feed at:

```
<FIREBASE_DATABASE_URL>/appUpdates/windows/latest.json
```

---

## 🚀 Key Features

### 1. Live Release Overview & KPI Telemetry
- **Active Version & Channel**: Displays the active production version, update enforcement policy (Optional vs Mandatory), and target architecture (`win-x64`).
- **Distribution Feed**: Terminal-styled public endpoint with one-click copy and browser inspection.
- **Package Footprint**: Formatted byte count and installer executable name.

### 2. Enterprise Security Posture & Integrity Audit
- **TLS/HTTPS Enforcement**: Verifies all installer assets and manifests are served over secure connections.
- **SHA-512 Cryptographic Signature**: Validates presence of Base64 digest for binary tamper prevention.
- **Changelog & Manifest Alignment**: Assures release notes and `latest.yml` manifests are present.
- **Compliance Scorecard**: Real-time score indicator (0–100%) grading release hygiene.

### 3. Integrated Web Crypto SHA-512 & Manifest Studio
- **Client-Side Cryptography**: Drag & drop any `CodeSynq-Setup.exe` into the browser drop zone.
- Calculates exact **Base64 SHA-512** (required by `electron-updater`) and **Hexadecimal SHA-512** locally via `window.crypto.subtle.digest` — no files ever leave the machine.
- 1-click **Apply to Publisher Form** transfers hash and file size automatically.
- 1-click **Generate & Download `latest.yml`** generates the exact YAML schema required by electron-builder.

### 4. Release Registry with Instant Rollback
- Chronological release timeline with searchable versions and changelogs.
- **Rollback to Past Build**: 1-click promote any past release to active status if a regression is discovered.
- **Export Registry**: Download all release history entries as a JSON backup.
- Safe deletion and batch clear with confirmation dialogs.

### 5. Desktop Client Simulator & API Inspector
- Test how `electron-updater` running inside `CodeSynq Desktop` evaluates the update feed given any installed version (e.g. `1.0.0` vs `1.0.4`).
- Displays simulated event emissions (`update-available`, `update-not-available`, mandatory force restart policy).
- Terminal cURL / PowerShell command generator for pipeline verification.

### 6. GitHub Fast-Fill Assistant
- Paste any GitHub release asset or tag URL (e.g. `https://github.com/divyanshugupta0/codesynq/releases/tag/v1.0.4`).
- Automatically parses owner, repo, version, and generates installer `.exe` and `latest.yml` download URLs.

---

## 🛠️ Deployment & Netlify Setup

Deploy this folder as a static site on Netlify.

### Netlify Build Settings
- **Build command**: `node scripts/generate-firebase-config.mjs`
- **Publish directory**: `.`

### Required Environment Variables
Set these under **Site configuration → Environment variables**:
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_DATABASE_URL`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_APP_ID`

*Optional*: `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_MEASUREMENT_ID`.

---

## 🛡️ Security Rules

Import `firebase-rules.json` into your Firebase Realtime Database. Only authenticated users with `users/{uid}/isAdmin === true` can publish updates or modify release history. Public users have read-only access to `/appUpdates/windows/latest`.
