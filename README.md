# CodeSynq Desktop · Release & Update Orchestrator

The **CodeSynq Desktop Release & Update Orchestrator** is an enterprise-grade release management dashboard, security auditing center, and live update distribution portal for CodeSynq Desktop.

It distributes releases to the Windows desktop client feed via the Realtime Database update endpoint.

---

## 🚀 Key Features

### 1. Live Release Overview & KPI Telemetry
- **Active Version & Channel**: Displays the active production version, update enforcement policy (Optional vs Mandatory), and target architecture (Windows 64-bit).
- **Distribution Feed**: Terminal-styled public endpoint with one-click copy and browser inspection.
- **Package Footprint**: Formatted byte count and installer executable name.

### 2. Enterprise Security Posture & Integrity Audit
- **TLS/HTTPS Enforcement**: Verifies all installer assets and manifests are served over secure connections.
- **SHA-512 Cryptographic Signature**: Validates presence of Base64 digest for binary tamper prevention.
- **Changelog & Manifest Alignment**: Assures release notes and updater manifests are present.
- **Compliance Scorecard**: Real-time score indicator (0–100%) grading release hygiene.

### 3. Integrated Web Crypto SHA-512 & Manifest Studio
- **Client-Side Cryptography**: Drag & drop any setup installer into the browser drop zone.
- Calculates exact **Base64 SHA-512** and **Hexadecimal SHA-512** locally in the browser — no files ever leave the machine.
- 1-click **Apply to Publisher Form** transfers hash and file size automatically.
- 1-click **Generate & Download Manifest** generates the exact manifest schema required by electron-builder.

### 4. Release Registry with Instant Rollback
- Chronological release timeline with searchable versions and changelogs.
- **Rollback to Past Build**: 1-click promote any past release to active status if a regression is discovered.
- **Export Registry**: Download all release history entries as a JSON backup.
- Safe deletion and batch clear with confirmation dialogs.

### 5. Desktop Client Simulator & API Inspector
- Test how the desktop application evaluates the update feed given any installed version.
- Displays simulated event emissions (update available, up to date, mandatory force restart policy).
- Terminal cURL / PowerShell command generator for pipeline verification.

### 6. GitHub Fast-Fill Assistant
- Paste any GitHub release asset or tag link.
- Automatically parses owner, repository, version, and generates installer and manifest download links.

---

## 🛠️ Deployment & Netlify Setup

Deploy this folder as a static site on Netlify.

### Netlify Build Settings
- **Build command**: `node scripts/generate-firebase-config.mjs`
- **Publish directory**: `.`

Configuration credentials are generated automatically during the build process from the deployment settings.

---

## 🛡️ Security Rules

Import the database rules into your Firebase Realtime Database. Only authenticated users with administrator privileges can publish updates or modify release history. Public users have read-only access to latest releases.
