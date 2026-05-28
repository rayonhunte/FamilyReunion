import { useAuth } from '../../hooks/useAuth';

export const PendingPage = () => {
  const { profile, signOutUser, isDemoMode } = useAuth();

  return (
    <main className="fullscreen-shell hk-state-shell">
      <div className="state-card">
        <p className="eyebrow">Account access</p>
        <h1>{isDemoMode ? 'Demo mode is active' : 'Your account is currently unavailable'}</h1>
        <p>
          {isDemoMode
            ? 'Firebase is not connected, so the app is showing an approved demo profile for previewing the portal.'
            : `${profile?.displayName ?? 'Your account'} cannot access the portal right now. Contact an admin if you think this is a mistake.`}
        </p>
        <div className="stack-row">
          <button className="cta-button" onClick={() => void signOutUser()}>
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
};
