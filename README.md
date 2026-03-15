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

3. Copy `.env.example` to `.env.local` if you want to override the included Firebase public config or point the app to a custom function URL.

4. Start the app:

   ```bash
   npm run dev
   ```

## Deploy prep

- Build the app: `npm run build`
- Build functions: `npm run build:functions`
- Deploy with Firebase after authenticating and enabling Hosting, Firestore, Storage, and Functions on project `gtfast-7bf85`

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
