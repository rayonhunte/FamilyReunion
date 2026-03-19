import { useAuth } from '../../hooks/useAuth';

export const PendingPage = () => {
  const { profile, signOutUser, isDemoMode } = useAuth();

  return (
    <main className="fullscreen-shell hk-state-shell">
      <div className="state-card">
        <p className="eyebrow">Approval queue</p>
        <h1>{isDemoMode ? 'Demo mode is active' : 'Your access request is waiting for approval'}</h1>
        <p>
          {isDemoMode
            ? 'Firebase is not connected, so the app is showing an approved demo profile for previewing the portal.'
            : `${profile?.displayName ?? 'Your account'} has been created. An admin must approve your member access before you can view reunion details.`}
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
