import { useEffect, useState, type ReactElement } from 'react';
import { NavLink, Navigate, useLocation } from 'react-router-dom';
import { NotificationHub } from '../../components/NotificationHub';
import { useAuth } from '../../hooks/useAuth';
import { env } from '../../lib/env';
import { requestSystemNotificationPermission } from '../../lib/systemNotifications';
import { menuNavItems, primaryNavItems } from './navConfig';
import { PortalRoutes } from '../routes/PortalRoutes';

export const PortalShell = ({
  overview,
  profile,
  registration,
  events,
  hotels,
  flights,
  bulletin,
  messages,
  files,
  familyTree,
  help,
  audit,
  organizer,
  admin,
}: {
  overview: ReactElement;
  profile: ReactElement;
  registration: ReactElement;
  events: ReactElement;
  hotels: ReactElement;
  flights: ReactElement;
  bulletin: ReactElement;
  messages: ReactElement;
  files: ReactElement;
  familyTree: ReactElement;
  help: ReactElement;
  audit: ReactElement;
  organizer: ReactElement;
  admin: ReactElement;
}) => {
  const { profile: userProfile, signOutUser, isDemoMode } = useAuth();
  const location = useLocation();
  const isAdmin = userProfile?.role === 'admin';
  const isOrganizer = userProfile?.role === 'organizer';
  const canAccessOrganizerHub = isAdmin || isOrganizer;
  const [menuOpen, setMenuOpen] = useState(false);
  const [phoneNotifPermission, setPhoneNotifPermission] = useState<NotificationPermission | null>(() => {
    if (typeof Notification === 'undefined') return null;
    return Notification.permission;
  });

  // Close drawer when route changes (browser back, etc.).
  useEffect(() => {
    const t = requestAnimationFrame(() => setMenuOpen(false));
    return () => cancelAnimationFrame(t);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: Event) => {
      if ((e as unknown as { key: string }).key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const enablePhoneNotifications = async () => {
    const perm = await requestSystemNotificationPermission();
    setPhoneNotifPermission(perm);
  };

  const checkForUpdates = () => {
    // Force refresh with cache-busting query param so updated bundles are fetched.
    const url = new URL(window.location.href);
    url.searchParams.set('check', String(Date.now()));
    window.location.replace(url.toString());
  };

  const visiblePrimary = primaryNavItems.filter((item) => {
    if (!item.roles?.length) return true;
    if (isAdmin && item.roles.includes('admin')) return true;
    if (isOrganizer && item.roles.includes('organizer')) return true;
    return false;
  });

  const visibleMenu = menuNavItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="portal-page">
      <header className="topbar portal-bar">
        <div className="brand-lockup">
          <p className="eyebrow">Family Reunion</p>
          <h2>Member Portal</h2>
          {env.buildId ? <p className="build-id-under-portal">Build {env.buildId}</p> : null}
        </div>
        <nav className="hero-nav portal-nav portal-nav-primary" aria-label="Main navigation">
          <button
            type="button"
            className="portal-nav-menu-btn"
            aria-expanded={menuOpen}
            aria-controls="portal-nav-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            Menu
          </button>
          {visiblePrimary.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/app'}>
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            className="ghost-button portal-nav-check-updates"
            onClick={checkForUpdates}
            aria-label="Check for updates"
          >
            Check for updates
          </button>
        </nav>
        <div className="portal-actions">
          <div className="portal-actions-right">
            <button className="ghost-button" onClick={() => void signOutUser()}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {menuOpen ? (
        <>
          <div
            className="portal-nav-backdrop"
            onClick={() => setMenuOpen(false)}
            onKeyDown={(e) => e.key === 'Escape' && setMenuOpen(false)}
            role="presentation"
            aria-hidden
          />
          <div
            id="portal-nav-menu"
            className="portal-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="More pages"
          >
            <div className="portal-nav-drawer-head">
              <span className="portal-nav-drawer-title">More</span>
              <button type="button" className="ghost-button" onClick={() => setMenuOpen(false)}>
                Close
              </button>
            </div>
            <div className="portal-nav-drawer-profile">
              <strong>{userProfile?.displayName}</strong>
              <p className="helper-text">{userProfile?.role}</p>
              {isDemoMode ? <span className="pill soft">Demo mode</span> : null}
            </div>
            <nav className="portal-nav-drawer-links" aria-label="Additional navigation">
              {visibleMenu.map((item) => (
                <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
            {phoneNotifPermission !== null ? (
              <div className="portal-nav-drawer-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void enablePhoneNotifications()}
                  disabled={isDemoMode}
                  aria-label="Enable phone notifications"
                >
                  {phoneNotifPermission === 'granted' ? 'Phone notifications enabled' : 'Enable phone notifications'}
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      <main className="content-shell portal-content">
        <NotificationHub />
        <PortalRoutes
          overview={overview}
          profile={profile}
          registration={registration}
          events={events}
          hotels={hotels}
          flights={flights}
          bulletin={bulletin}
          messages={messages}
          files={files}
          familyTree={familyTree}
          help={help}
          audit={isAdmin ? audit : <Navigate to="/app" replace />}
          organizer={canAccessOrganizerHub ? organizer : <Navigate to="/app" replace />}
          admin={isAdmin ? admin : <Navigate to="/app" replace />}
        />
      </main>
    </div>
  );
};
