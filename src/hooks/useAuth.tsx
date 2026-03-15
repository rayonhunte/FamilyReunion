import {
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

const useRedirectAuth = typeof window !== 'undefined' && window.location.hostname === 'localhost';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(auth ? null : demoUser);
  const [profile, setProfile] = useState<UserProfile | null>(auth ? null : demoProfile);
  const [loading, setLoading] = useState<boolean>(Boolean(auth && db));
  const [error, setError] = useState<string | null>(null);
  const isDemoMode = !auth || !db || !googleProvider;

  useEffect(() => {
    if (!auth || !db) {
      return undefined;
    }

    const authInstance = auth;
    const firestore = db;
    let currentProfileUnsubscribe: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(authInstance, async (firebaseUser) => {
      currentProfileUnsubscribe?.();

      startTransition(() => {
        setUser(firebaseUser);
        setLoading(Boolean(firebaseUser));
      });

      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const userRef = doc(firestore, 'users', firebaseUser.uid);
        const snapshot = await getDoc(userRef);
        const isBootstrapAdmin =
          firebaseUser.email?.toLowerCase() === env.bootstrapAdminEmail.toLowerCase();
        const baseProfile = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName ?? firebaseUser.email ?? 'Family member',
          email: firebaseUser.email ?? '',
          photoURL: firebaseUser.photoURL ?? null,
          updatedAt: serverTimestamp(),
        };

        if (!snapshot.exists()) {
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
          await setDoc(
            userRef,
            {
              ...baseProfile,
              status: 'approved',
              role: 'admin',
              approvedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }
      } catch (authError) {
        setError(authError instanceof Error ? authError.message : 'Unable to prepare your member profile.');
      }

      currentProfileUnsubscribe = onSnapshot(
        doc(firestore, 'users', firebaseUser.uid),
        (snapshot) => {
          setProfile(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as UserProfile) : null);
          setLoading(false);
        },
        (snapshotError) => {
          setError(snapshotError.message);
          setLoading(false);
        },
      );
    });

    return () => {
      currentProfileUnsubscribe?.();
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    if (isDemoMode) {
      setUser(demoUser);
      setProfile(demoProfile);
      return;
    }

    try {
      if (useRedirectAuth) {
        await signInWithRedirect(auth!, googleProvider!);
        return;
      }

      await signInWithPopup(auth!, googleProvider!);
    } catch (authError) {
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
