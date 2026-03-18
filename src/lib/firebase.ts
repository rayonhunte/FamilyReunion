import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { env, hasFirebaseConfig } from './env';

/** Strip gs:// and path junk so the SDK never builds broken URLs (e.g. double /v0/b/...). */
const normalizeStorageBucket = (raw: string) => {
  let s = raw.trim();
  if (s.startsWith('gs://')) s = s.slice(5);
  const i = s.indexOf('/');
  if (i !== -1) s = s.slice(0, i);
  return s;
};

const firebaseConfig = hasFirebaseConfig
  ? { ...env.firebase, storageBucket: normalizeStorageBucket(env.firebase.storageBucket) }
  : env.firebase;

export const firebaseApp = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;
export const storage = firebaseApp ? getStorage(firebaseApp) : null;
export const googleProvider = auth ? new GoogleAuthProvider() : null;

if (googleProvider) {
  googleProvider.setCustomParameters({ prompt: 'select_account' });
}
