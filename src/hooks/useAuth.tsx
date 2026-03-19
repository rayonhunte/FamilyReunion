import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { demoProfile } from '../data/mock';
import { env } from '../lib/env';
import type { UserProfile } from '../types/models';
import { auth, db, googleProvider } from '../lib/firebase';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  isDemoMode: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const demoUser = {
  uid: demoProfile.uid,
  displayName: demoProfile.displayName,
  email: demoProfile.email,
  photoURL: demoProfile.photoURL,
} as User;

const useRedirectAuth = false;
const AUTH_DEBUG = false;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(auth ? null : demoUser);
  const [profile, setProfile] = useState<UserProfile | null>(auth ? null : demoProfile);
  const [loading, setLoading] = useState<boolean>(Boolean(auth && db));
  const [error, setError] = useState<string | null>(null);
  const isDemoMode = !auth || !db || !googleProvider;

  useEffect(() => {
    if (!auth || !db) {
      if (AUTH_DEBUG) console.log('[Auth] No auth or db — demo mode or missing config');
      return undefined;
    }

    const authInstance = auth;
    const firestore = db;
    let currentProfileUnsubscribe: (() => void) | undefined;
    let authUnsubscribe: (() => void) | undefined;
    let cancelled = false;

    const cleanup = () => {
      cancelled = true;
      currentProfileUnsubscribe?.();
      authUnsubscribe?.();
    };

    (async () => {
      if (AUTH_DEBUG) console.log('[Auth] Awaiting getRedirectResult (completes sign-in after Google redirect)');
      let result;
      try {
        result = await getRedirectResult(authInstance);
      } catch (err) {
        if (AUTH_DEBUG) console.log('[Auth] getRedirectResult error:', (err as Error)?.message ?? err);
      }
      if (AUTH_DEBUG) console.log('[Auth] getRedirectResult:', result?.user ? `signed in as ${result.user.email}` : 'no redirect result');

      if (cancelled) return;

      authUnsubscribe = onAuthStateChanged(authInstance, async (firebaseUser) => {
        currentProfileUnsubscribe?.();

        if (AUTH_DEBUG) console.log('[Auth] onAuthStateChanged:', firebaseUser ? `uid=${firebaseUser.uid} email=${firebaseUser.email}` : 'signed out');

      startTransition(() => {
        setUser(firebaseUser);
        setLoading(Boolean(firebaseUser));
      });

      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
        if (AUTH_DEBUG) console.log('[Auth] No user — profile cleared, loading=false');
        return;
      }

      try {
        const userRef = doc(firestore, 'users', firebaseUser.uid);
        if (AUTH_DEBUG) console.log('[Auth] Fetching user doc users/', firebaseUser.uid);
        const snapshot = await getDoc(userRef);
        const isBootstrapAdmin =
          firebaseUser.email?.toLowerCase() === env.bootstrapAdminEmail.toLowerCase();
        if (AUTH_DEBUG) console.log('[Auth] getDoc result: exists=', snapshot.exists(), 'isBootstrapAdmin=', isBootstrapAdmin, 'bootstrapEmail=', env.bootstrapAdminEmail, 'yourEmail=', firebaseUser.email);
        const baseProfile = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName ?? firebaseUser.email ?? 'Family member',
          email: firebaseUser.email ?? '',
          photoURL: firebaseUser.photoURL ?? null,
          updatedAt: serverTimestamp(),
        };

        if (!snapshot.exists()) {
          if (AUTH_DEBUG) console.log('[Auth] Creating new user doc, status=', isBootstrapAdmin ? 'approved' : 'pending');
          await setDoc(
            userRef,
            {
              ...baseProfile,
              status: isBootstrapAdmin ? 'approved' : 'pending',
              role: isBootstrapAdmin ? 'admin' : 'member',
              createdAt: serverTimestamp(),
              ...(isBootstrapAdmin ? { approvedAt: serverTimestamp() } : {}),
            },
            { merge: true },
          );
        } else if (isBootstrapAdmin) {
          if (AUTH_DEBUG) console.log('[Auth] Updating existing user to approved (bootstrap admin)');
          // Do not merge baseProfile here — it would overwrite Firestore photoURL / displayName
          // with Google Auth values on every reload and wipe uploaded profile photos.
          await setDoc(
            userRef,
            {
              status: 'approved',
              role: 'admin',
              approvedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }
      } catch (authError) {
        if (AUTH_DEBUG) console.error('[Auth] getDoc/setDoc error:', authError);
        setError(authError instanceof Error ? authError.message : 'Unable to prepare your member profile.');
        setLoading(false);
      }

      if (AUTH_DEBUG) console.log('[Auth] Subscribing to users/', firebaseUser.uid);
      currentProfileUnsubscribe = onSnapshot(
        doc(firestore, 'users', firebaseUser.uid),
        (snapshot) => {
          const data = snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as UserProfile) : null;
          if (AUTH_DEBUG) console.log('[Auth] Profile snapshot: exists=', snapshot.exists(), 'status=', data?.status, 'role=', data?.role);
          setProfile(data);
          setLoading(false);
        },
        (snapshotError) => {
          if (AUTH_DEBUG) console.error('[Auth] Profile snapshot error:', snapshotError?.message ?? snapshotError);
          setError(snapshotError.message);
          setLoading(false);
        },
      );
    });

    })();

    return cleanup;
  }, []);

  const signInWithGoogle = async () => {
    if (isDemoMode) {
      if (AUTH_DEBUG) console.log('[Auth] Demo mode — using demo user');
      setUser(demoUser);
      setProfile(demoProfile);
      return;
    }

    try {
      if (useRedirectAuth) {
        if (AUTH_DEBUG) console.log('[Auth] signInWithRedirect (localhost) — you will be sent to Google and then back here');
        await signInWithRedirect(auth!, googleProvider!);
        return;
      }

      if (AUTH_DEBUG) console.log('[Auth] signInWithPopup');
      await signInWithPopup(auth!, googleProvider!);
    } catch (authError) {
      if (AUTH_DEBUG) console.error('[Auth] signIn error:', authError);
      setError(authError instanceof Error ? authError.message : 'Google sign-in failed.');
    }
  };

  const signOutUser = async () => {
    if (isDemoMode) {
      setUser(null);
      setProfile(null);
      return;
    }

    await signOut(auth!);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, error, isDemoMode, signInWithGoogle, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }

  return context;
};
