# Family Reunion Portal

Private Firebase-powered member portal for planning a family reunion with approval-based access, attendee registration, events, hotels, files, bulletin posts, direct messages, and a single privileged Cloud Function API.

## Stack

- React 19 + Vite + TypeScript
- Firebase Auth with Google sign-in
- Firestore for app data
- Firebase Storage for images and PDFs
- Firebase Hosting for the SPA
- One HTTPS Cloud Function for privileged admin work

## Security posture

- The client uses Firebase web config, which is public by design.
- No service account keys or Admin SDK credentials are stored in the client.
- Firestore Rules and Storage Rules enforce access control.
- Member approval and role changes route through `functions/src/index.ts`.
- Uploads are limited to images and PDFs in Storage Rules.

## Local setup

1. Install app dependencies:

   ```bash
   npm install
   ```

2. Install function dependencies:

   ```bash
   npm --prefix functions install
   ```

3. Copy `.env.example` to `.env.local` and fill in your Firebase web app config and function URL.

4. Start the app:

   ```bash
   npm run dev
   ```

## Deploy prep

- Build the app: `npm run build`
- Build functions: `npm run build:functions`
- Deploy with Firebase after authenticating and enabling Hosting, Firestore, Storage, and Functions on project `gtfast-7bf85`

## Why "Demo mode"?

The app shows **Demo mode** when Firebase config is missing or incomplete. Then it uses fake data so you can still click around. Config comes from env vars (`VITE_FIREBASE_*`).

- **Local:** Add a `.env.local` (copy from `.env.example`) and fill in your real Firebase web app config from [Firebase Console → Project settings → Your apps](https://console.firebase.google.com/project/gtfast-7bf85/settings/general). Restart `npm run dev` after changing env.
- **Deployed site:** The build must have those env vars at build time. The GitHub Action uses repository secrets (see below); if they are not set, the deployed app has no config and stays in demo mode.

## GitHub Actions deployment

Pushes to `main` (and manual runs) deploy Hosting and Functions via [`.github/workflows/deploy-firebase.yml`](.github/workflows/deploy-firebase.yml).

1. **FIREBASE_TOKEN** (for deploy): run `firebase login:ci` and add the token as a repo secret.
2. **Firebase web config** (so the live site is not in demo mode): add these repository secrets with values from Firebase Console → Project settings → Your apps → Web app:
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID`
   - Optional: `VITE_FUNCTIONS_URL` (default `/api`), `VITE_BOOTSTRAP_ADMIN_EMAIL`

The workflow uses the project in `.firebaserc` (default: `gtfast-7bf85`).

## Data model highlights

- `users`: approval state, role, profile
- `directory`: approved member directory for messaging
- `registrations`: one attendee record per approved user
- `events`: reunion schedule
- `hotels`: room-block info and booking links
- `bulletinPosts` and `bulletinComments`
- `threads/{threadId}/messages`
- `assets`
- `invites`

## Notes

- Email invite sending is intentionally left as a backend extension point. The current function API creates opaque invite links and returns a clear error for email sending until a mail provider is configured securely.
- If Firebase is unavailable, the UI falls back to demo-mode sample data so the portal can still be previewed.
