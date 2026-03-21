import { useEffect, useRef, useState, type ReactElement } from 'react';
import { NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { env } from '../../lib/env';
import { requestSystemNotificationPermission } from '../../lib/systemNotifications';
import { menuNavItems, primaryNavItems } from './navConfig';
import { PortalRoutes } from '../routes/PortalRoutes';
import { usePortalNotifications } from './usePortalNotifications';

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
  const navigate = useNavigate();
  const isAdmin = userProfile?.role === 'admin';
  const isOrganizer = userProfile?.role === 'organizer';
  const canAccessOrganizerHub = isAdmin || isOrganizer;
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [phoneNotifPermission, setPhoneNotifPermission] = useState<NotificationPermission | null>(() => {
    if (typeof Notification === 'undefined') return null;
    return Notification.permission;
  });
  const notificationMenuRef = useRef<HTMLDivElement | null>(null);
  const refreshRequestRef = useRef(0);
  const { items: notificationItems, unreadCount, markAllRead, markNotificationRead } = usePortalNotifications(location.pathname);

  const visibleNotifications = notificationItems.slice(0, 8);

  // Close drawer when route changes (browser back, etc.).
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      setMenuOpen(false);
      setNotificationMenuOpen(false);
    });
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

  useEffect(() => {
    if (!notificationMenuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotificationMenuOpen(false);
      }
    };

    const onPointerDown = (event: MouseEvent) => {
      if (!notificationMenuRef.current?.contains(event.target as Node)) {
        setNotificationMenuOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [notificationMenuOpen]);

  const enablePhoneNotifications = async () => {
    const perm = await requestSystemNotificationPermission();
    setPhoneNotifPermission(perm);
  };

  const checkForUpdates = () => {
    // Force refresh with cache-busting query param so updated bundles are fetched.
    const url = new URL(window.location.href);
    refreshRequestRef.current += 1;
    url.searchParams.set('check', String(refreshRequestRef.current));
    window.location.replace(url.toString());
  };

  const visiblePrimary = primaryNavItems.filter((item) => {
    if (!item.roles?.length) return true;
    if (isAdmin && item.roles.includes('admin')) return true;
    if (isOrganizer && item.roles.includes('organizer')) return true;
    return false;
  });

  const visibleMenu = menuNavItems.filter((item) => !item.adminOnly || isAdmin);

  const openNotification = (notificationId: string) => {
    const item = notificationItems.find((entry) => entry.id === notificationId);
    if (!item) return;

    markNotificationRead(item);
    setNotificationMenuOpen(false);

    if (item.action === 'refresh-app') {
      checkForUpdates();
      return;
    }

    navigate(item.href);
  };

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
          <div className="portal-notification-menu" ref={notificationMenuRef}>
            <button
              type="button"
              className={`ghost-button portal-bell-button ${notificationMenuOpen ? 'is-open' : ''}`}
              aria-expanded={notificationMenuOpen}
              aria-haspopup="menu"
              aria-controls="portal-notification-panel"
              aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
              onClick={() => setNotificationMenuOpen((open) => !open)}
            >
              <span className="portal-bell-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path
                    d="M12 3.5a4.5 4.5 0 0 0-4.5 4.5v2.32c0 .78-.2 1.55-.59 2.23l-1.14 2A1.5 1.5 0 0 0 7.07 17h9.86a1.5 1.5 0 0 0 1.3-2.25l-1.14-2c-.39-.68-.59-1.45-.59-2.23V8A4.5 4.5 0 0 0 12 3.5Zm0 17a2.75 2.75 0 0 1-2.58-1.8h5.16A2.75 2.75 0 0 1 12 20.5Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <span className="portal-bell-label">Alerts</span>
              {unreadCount > 0 ? <span className="portal-notification-badge">{Math.min(unreadCount, 99)}</span> : null}
            </button>

            {notificationMenuOpen ? (
              <div
                id="portal-notification-panel"
                className="portal-notification-panel"
                role="menu"
                aria-label="Notifications"
              >
                <div className="portal-notification-panel-head">
                  <div>
                    <strong>Notifications</strong>
                    <p>{unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up'}</p>
                  </div>
                  {unreadCount > 0 ? (
                    <button type="button" className="ghost-button" onClick={markAllRead}>
                      Mark all read
                    </button>
                  ) : null}
                </div>
                <div className="portal-notification-list">
                  {visibleNotifications.length === 0 ? (
                    <p className="helper-text portal-notification-empty">No new messages or bulletin updates yet.</p>
                  ) : (
                    visibleNotifications.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`portal-notification-item ${item.unread ? 'is-unread' : ''}`}
                        role="menuitem"
                        onClick={() => openNotification(item.id)}
                      >
                        <span className={`portal-notification-type type-${item.kind}`}>{item.title}</span>
                        <strong>{item.body}</strong>
                        <span>{item.createdAtLabel}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
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
