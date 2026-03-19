# Family Reunion Portal

Private Firebase-powered member portal for planning a family reunion with approval-based access, attendee registration, events, hotels, files, bulletin posts, direct messages, and a single privileged Cloud Function API.

## Stack

- React 19 + Vite + TypeScript
- Firebase Auth with Google sign-in
- Firestore for app data
- Firebase Storage for images and PDFs
- Vercel for the SPA
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

### Firebase Storage: “Repair project permissions” / uploads still fail

If the Storage page shows **“Due to recent security improvements…”** and **Attach permissions** errors, Storage is **misconfigured at the project level** until this is fixed. CORS alone will not help.

1. **Blaze billing** — [Cloud Storage for Firebase now requires the pay-as-you-go (Blaze) plan](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024). Upgrade in Firebase → **Upgrade** if you’re still on Spark.

2. **Manual IAM (when the console repair fails)**  
   - Open [Google Cloud IAM for the project](https://console.cloud.google.com/iam-admin/iam?project=gtfast-7bf85) (must be **Owner** or **Project IAM Admin**).  
   - **Project settings** in Firebase → copy **Project number** (numeric).  
   - **Grant access** → **New principals**:  
     `service-<PROJECT_NUMBER>@gcp-sa-firebasestorage.iam.gserviceaccount.com`  
     Example: if project number is `123456789`, use `service-123456789@gcp-sa-firebasestorage.iam.gserviceaccount.com`.  
   - **Role**: **Storage Admin** (`roles/storage.admin`) *or* try **Firebase Admin SDK Administrator Service Agent** if listed. Save.  
   - Wait a minute, reload **Firebase → Storage**, then try **Fix issue** / **Attach permissions** again.

3. If it still fails: [Firebase support](https://firebase.google.com/support/contact/troubleshooting/) or an org admin (organization policies sometimes block automatic role grants).

4. **Bucket name** — Your console shows `gs://gtfast-7bf85.appspot.com`. Your web app’s `storageBucket` must match that bucket (not a different bucket). If the SDK points at `gtfast-7bf85.firebasestorage.app` but the only bucket is `appspot.com`, align `.env` with the bucket Firebase shows.

### Uploads blocked by CORS (localhost, Vercel, or old `*.web.app`)

CORS is **per bucket**. If `VITE_FIREBASE_STORAGE_BUCKET` is `gtfast-7bf85.firebasestorage.app` but you only ran `gsutil` on `…appspot.com`, **production uploads still fail**.

From the repo root (applies CORS to **both** default bucket names if they exist):

```bash
gcloud auth login
npm run storage:cors
```

Or manually:

```bash
gsutil cors set storage-cors.json gs://gtfast-7bf85.firebasestorage.app
gsutil cors set storage-cors.json gs://gtfast-7bf85.appspot.com
```

Edit `storage-cors.json` to add origins (for example your Vercel production domain and preview domain), then run the command again for **the same bucket** your app uses. **`VITE_FIREBASE_STORAGE_BUCKET` must match the bucket name in Firebase Console → Storage** (rebuild after changing secrets).

## Deploy prep

- Build the app: `npm run build`
- Build functions: `npm run build:functions`
- Deploy the frontend with Vercel
- Deploy Firebase backend resources after authenticating and enabling Firestore, Storage, and Functions on project `gtfast-7bf85`
- In Vercel, set `VITE_FUNCTIONS_URL` to your deployed HTTPS Function URL because the old Firebase Hosting `/api` rewrite is gone

## Why "Demo mode"?

The app shows **Demo mode** when Firebase config is missing or incomplete. Then it uses fake data so you can still click around. Config comes from env vars (`VITE_FIREBASE_*`).

- **Local:** Add a `.env.local` (copy from `.env.example`) and fill in your real Firebase web app config from [Firebase Console → Project settings → Your apps](https://console.firebase.google.com/project/gtfast-7bf85/settings/general). Restart `npm run dev` after changing env.
- **Deployed site:** The Vercel build must have those env vars at build time. If they are not set, the deployed app has no config and stays in demo mode.

## GitHub Actions backend deployment

Pushes to `main` (and manual runs) deploy Firebase backend resources via [`.github/workflows/deploy-firebase.yml`](.github/workflows/deploy-firebase.yml).

1. **FIREBASE_TOKEN** (for deploy): run `firebase login:ci` and add the token as a repo secret.
2. Configure your frontend environment variables in Vercel instead of GitHub Actions.

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
