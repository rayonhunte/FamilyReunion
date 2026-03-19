# Deployment checklist (login / access app)

If you're stuck on the landing page after signing in, use this checklist.

## 1. Deploy Firestore rules and indexes

Your app reads/writes `users/{uid}` and other collections. Rules must be deployed or you'll get permission errors and profile will stay `null`.

```bash
npm run deploy:rules
```

Or with the Firebase CLI directly:

```bash
firebase deploy --only firestore
```

This deploys:

- `firestore.rules` (including `users`, `directory`, `familyRelationships`, etc.)
- `firestore.indexes.json` (composite indexes if any)

## 2. Bootstrap admin email (auto-approve)

To be approved immediately on first sign-in, set your Google email in `.env.local`:

```bash
VITE_BOOTSTRAP_ADMIN_EMAIL=your-google-email@gmail.com
```

Restart the dev server after changing env. In the console you should see `[Auth] isBootstrapAdmin=true` when you sign in with that email.

## 3. Or approve manually in Firebase

If you don't use the bootstrap email:

1. Open [Firebase Console](https://console.firebase.google.com) → your project → Firestore.
2. Open the `users` collection and find the document with your `uid` (same as Firebase Auth UID).
3. Set `status` to `approved` and save.

## 4. Console logs (debug)

With the current debug flags you'll see in the browser console:

- `[Auth]` — getRedirectResult, onAuthStateChanged, getDoc/setDoc, profile snapshot, errors.
- `[App]` — current auth state and whether you're allowed to access `/app`.
- `[ProtectedRoute]` — why you're being redirected (no user vs status not approved).

Use these to see where the flow stops (e.g. profile snapshot error = rules not deployed or wrong project).

## 5. Deploy backend resources

```bash
npm run deploy
```

For the frontend, deploy with Vercel and make sure `VITE_FUNCTIONS_URL` points at your deployed Firebase HTTPS Function URL because the old Firebase Hosting `/api` rewrite is no longer in use.
