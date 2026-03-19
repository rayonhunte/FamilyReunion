import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export const NotFoundPage = () => {
  const { user, profile } = useAuth();

  return (
    <main className="not-found-shell hk-state-shell hk-notfound-shell">
      <div className="not-found-card">
        <p className="eyebrow">Family Reunion Portal</p>
        <h1>Page not found</h1>
        <p className="not-found-description">
          The page you’re looking for doesn’t exist or has been moved.
        </p>
        <img
          src="/404_page.png"
          alt="Person searching with a magnifying glass next to a 404 sign in the jungle"
          className="not-found-image"
        />
        <div className="not-found-actions">
          <Link to={user && profile?.status === 'approved' ? '/app' : '/'} className="cta-button">
            {user && profile?.status === 'approved' ? 'Back to portal' : 'Back to home'}
          </Link>
        </div>
      </div>
    </main>
  );
};
