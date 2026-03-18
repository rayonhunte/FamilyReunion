import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ReactFlow, ReactFlowProvider, Controls, MiniMap, Handle, BaseEdge, EdgeLabelRenderer, getBezierPath, applyNodeChanges, applyEdgeChanges, Position, type Node as FlowNode, type Edge as FlowEdge, type NodeProps, type EdgeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useNotification } from '../contexts/useNotification';
import { useAuth } from '../hooks/useAuth';
import { callBackend } from '../lib/functionsApi';
import {
  addBulletinComment,
  createBulletinPost,
  createEvent,
  createFlight,
  createHotel,
  createOrGetDirectThread,
  createRelationship,
  deleteAsset,
  deleteBulletinPost,
  deleteEvent,
  deleteFlight,
  deleteHotel,
  deleteRelationship,
  deleteStorageFile,
  logAuditEvent,
  saveRegistration,
  sendThreadMessage,
  setEventRsvp,
  updateBulletinPost,
  updateEvent,
  updateFlight,
  updateHotel,
  updateProfileFields,
  updateRelationship,
  uploadAsset,
  uploadBulletinAttachment,
  uploadProfileImage,
  useAssociatedAssets,
  useAssets,
  useAuditLogs,
  useBulletinComments,
  useBulletinPosts,
  useDirectory,
  useEventRsvps,
  useEvents,
  useFamilyRelationships,
  useFlights,
  useHotels,
  usePendingApprovals,
  useThreadMessages,
  useThreads,
  useUserRegistration,
} from '../lib/firestore';
import { formatDate, formatDateTime, formatFileSize, relativeTime } from '../lib/format';
import type {
  AssetRecord,
  BulletinPost,
  DirectoryMember,
  EventItem,
  FamilyRelationship,
  Flight,
  Hotel,
  Registration,
  RelationshipType,
  Role,
  RSVPStatus,
} from '../types/models';

const mentionToken = ({
  type,
  id,
  label,
}: {
  type: 'user' | 'asset' | 'event';
  id: string;
  label: string;
}) => `@[${type}:${id}:${label}]`;

const parseMentionSegments = (text: string) => {
  const pattern = /@\[(user|asset|event):([^:\]]+):([^\]]+)\]/g;
  const segments: Array<{ type: 'text' | 'mention'; value: string; mentionType?: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }

    segments.push({
      type: 'mention',
      value: match[3],
      mentionType: match[1],
    });
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
};

const primaryNavItems: { label: string; to: string; roles?: ('admin' | 'organizer')[] }[] = [
  { label: 'Dashboard', to: '/app' },
  { label: 'Profile', to: '/app/profile' },
  { label: 'Organizer', to: '/app/organizer', roles: ['admin', 'organizer'] },
  { label: 'Admin', to: '/app/admin', roles: ['admin'] },
];

const menuNavItems: { label: string; to: string; adminOnly?: boolean }[] = [
  { label: 'Registration', to: '/app/registration' },
  { label: 'Events', to: '/app/events' },
  { label: 'Hotels', to: '/app/hotels' },
  { label: 'Flights', to: '/app/flights' },
  { label: 'Bulletin', to: '/app/bulletin' },
  { label: 'Messages', to: '/app/messages' },
  { label: 'Files', to: '/app/files' },
  { label: 'Family tree', to: '/app/family-tree' },
  { label: 'Help', to: '/app/help' },
  { label: 'Audit log', to: '/app/audit', adminOnly: true },
];

export const App = () => {
  const { loading, profile, user } = useAuth();

  if (loading) {
    return <FullscreenState title="Loading portal" description="Checking your member access and reunion profile." />;
  }

  const canAccessApp = Boolean(user && profile?.status === 'approved');

  return (
    <Routes>
      <Route path="/" element={canAccessApp ? <Navigate to="/app" replace /> : <LandingPage />} />
      <Route
        path="/pending"
        element={!user ? <Navigate to="/" replace /> : profile?.status === 'approved' ? <Navigate to="/app" replace /> : <PendingPage />}
      />
      <Route
        path="/app/*"
        element={
          <ProtectedRoute>
            <PortalShell />
          </ProtectedRoute>
        }
      />
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, profile } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  if (profile?.status !== 'approved') {
    return <Navigate to="/pending" replace />;
  }

  return children;
};

const FullscreenState = ({ title, description }: { title: string; description: string }) => (
  <main className="fullscreen-shell">
    <div className="state-card">
      <p className="eyebrow">Family Reunion Portal</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  </main>
);

const NotFoundPage = () => {
  const { user, profile } = useAuth();

  return (
    <main className="not-found-shell">
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

const LandingPage = () => {
  const { profile, signInWithGoogle, error, isDemoMode } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (profile?.status === 'pending') {
      navigate('/pending', { replace: true });
    }
  }, [navigate, profile]);

  return (
    <main className="landing-page">
      <section className="landing-frame">
        <header className="topbar landing-bar">
          <div className="brand-lockup">
            <p className="eyebrow">Private Member Hub</p>
            <h1>Family Reunion Retreat</h1>
          </div>
          <button className="cta-button" onClick={() => void signInWithGoogle()}>
            {isDemoMode ? 'Open demo portal' : 'Login or Request Access with Google'}
          </button>
        </header>

        <section className="hero-card">
          <div className="hero-copy">
            <p className="eyebrow">Built for one reunion team</p>
            <h2>Welcome home, family.</h2>
            <p>
              This is the place for reunion details, schedules, hotels, registration, messages, and shared memories.
              Sign in with Google to request access, or enter the portal if you already have approval.
            </p>
            <div className="hero-actions">
              <button className="cta-button" onClick={() => void signInWithGoogle()}>
                {isDemoMode ? 'Open demo portal' : 'Login or Request Access with Google'}
              </button>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-stack">
              <article className="floating-card">
                <span className="pill">Invites</span>
                <strong>Open signup with approval</strong>
                <p>New members request access, admins approve, and roles stay controlled.</p>
              </article>
              <article className="floating-card">
                <span className="pill">Hotels</span>
                <strong>Room block details in one panel</strong>
                <p>Booking links, deadlines, addresses, and notes stay current for everyone.</p>
              </article>
              <article className="floating-card">
                <span className="pill">Bulletin</span>
                <strong>Messages, comments, and file uploads</strong>
                <p>Collect reminders, PDFs, and images without exposing backend secrets.</p>
              </article>
            </div>
          </div>
        </section>

        {error ? <p className="inline-error">{error}</p> : null}
      </section>
    </main>
  );
};

const PendingPage = () => {
  const { profile, signOutUser, isDemoMode } = useAuth();

  return (
    <main className="fullscreen-shell">
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

const PortalShell = () => {
  const { profile, signOutUser, isDemoMode } = useAuth();
  const location = useLocation();
  const isAdmin = profile?.role === 'admin';
  const isOrganizer = profile?.role === 'organizer';
  const canAccessOrganizerHub = isAdmin || isOrganizer;
  const [menuOpen, setMenuOpen] = useState(false);

  /* Close drawer when route changes (browser back, etc.) */
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
            <span className="portal-nav-menu-icon" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </button>
          {visiblePrimary.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/app'}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="portal-actions">
          <div>
            <strong>{profile?.displayName}</strong>
            <p className="helper-text">{profile?.role}</p>
            {isDemoMode ? <span className="pill soft">Demo mode</span> : null}
          </div>
          <button className="ghost-button" onClick={() => void signOutUser()}>
            Sign out
          </button>
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
            <nav className="portal-nav-drawer-links" aria-label="Additional navigation">
              {visibleMenu.map((item) => (
                <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </>
      ) : null}

      <main className="content-shell portal-content">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="registration" element={<RegistrationPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="hotels" element={<HotelsPage />} />
          <Route path="flights" element={<FlightsPage />} />
          <Route path="bulletin" element={<BulletinPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="files" element={<FilesPage />} />
          <Route path="family-tree" element={<FamilyTreePage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="audit" element={isAdmin ? <AuditPage /> : <Navigate to="/app" replace />} />
          <Route path="organizer" element={canAccessOrganizerHub ? <OrganizerPage /> : <Navigate to="/app" replace />} />
          <Route path="admin" element={isAdmin ? <AdminPage /> : <Navigate to="/app" replace />} />
        </Routes>
      </main>
    </div>
  );
};

const OverviewPage = () => {
  const { profile } = useAuth();
  const { data: events } = useEvents();
  const { data: hotels } = useHotels();
  const { data: posts } = useBulletinPosts();
  const { data: assets } = useAssets();

  return (
    <section className="page-section">
      <SectionIntro
        eyebrow="Dashboard"
        title={`Welcome back, ${profile?.displayName?.split(' ')[0] ?? 'family'}`}
        body="This dashboard is your main page for reunion planning, updates, logistics, and shared family activity."
      />

      <div className="stats-grid">
        <StatCard title="Upcoming events" value={String(events.length)} detail="Schedule items available to approved members." />
        <StatCard title="Hotel blocks" value={String(hotels.length)} detail="Informational stays with deadline and booking links." />
        <StatCard title="Bulletin posts" value={String(posts.length)} detail="Announcements and discussions shared with the family." />
        <StatCard title="Shared files" value={String(assets.length)} detail="Images and PDFs stored in Firebase Storage." />
      </div>

      <Card accent="warm">
        <SectionHeader title="How to use the portal" meta="Start here" />
        <ul className="checklist">
          <li>Open Profile first to confirm the Google details we pulled in and add your short family bio.</li>
          <li>Open Registration first and complete your attendee details, RSVP, and travel notes.</li>
          <li>Check Events for the reunion timeline and Hotels for room block deadlines and booking links.</li>
          <li>Use Bulletin for shared family updates and Messages for direct coordination.</li>
          <li>Upload photos or PDFs in Files so everyone has one trusted place for reunion materials.</li>
        </ul>
      </Card>

      <div className="content-grid two-up">
        <Card>
          <SectionHeader title="Next on the schedule" meta="Live from Firestore or demo seed" />
          <div className="list-stack">
            {events.slice(0, 3).map((event) => (
              <article className="list-item" key={event.id}>
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.venue}</p>
                </div>
                <span>{formatDateTime(event.startAt)}</span>
              </article>
            ))}
          </div>
        </Card>

        <Card accent="warm">
          <SectionHeader title="Member checklist" meta="For a smoother reunion weekend" />
          <ul className="checklist">
            <li>Review your profile photo, name, phone, city, and short bio.</li>
            <li>Finish your registration profile and travel notes.</li>
            <li>Review hotel deadlines before the room block closes.</li>
            <li>Upload old photos or key PDFs to the shared files area.</li>
            <li>Use the bulletin for broad updates and direct messages for side coordination.</li>
          </ul>
        </Card>
      </div>
    </section>
  );
};

const profileImageUploadError = (err: unknown): string => {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: string }).code)
      : '';
  if (code === 'storage/unauthorized') {
    return 'Photo upload was denied. Deploy the latest Storage rules (`firebase deploy --only storage`) or use a JPG/PNG under 5MB.';
  }
  if (code === 'permission-denied') {
    return 'Could not save photo URL to your profile. Check Firestore rules.';
  }
  return err instanceof Error ? err.message : 'Photo upload failed.';
};

const ProfilePage = () => {
  const { profile, user } = useAuth();
  const { notify } = useNotification();
  const [imageUploading, setImageUploading] = useState(false);
  const [form, setForm] = useState({
    displayName: profile?.displayName ?? user?.displayName ?? '',
    phone: profile?.phone ?? user?.phoneNumber ?? '',
    city: profile?.city ?? '',
    bio: profile?.bio ?? '',
  });

  if (!profile || !user) {
    return null;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await updateProfileFields(profile.uid, {
      displayName: form.displayName.trim() || user.displayName || profile.displayName,
      phone: form.phone.trim(),
      city: form.city.trim(),
      bio: form.bio.trim(),
    });
    notify('Profile saved.', 'saved');
  };

  const onProfileImageChange = async (event: FormEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }
    const input = event.currentTarget;
    setImageUploading(true);
    try {
      await uploadProfileImage(profile.uid, file);
      notify('Profile photo saved.', 'updated');
    } catch (err) {
      notify(profileImageUploadError(err), 'error');
    } finally {
      setImageUploading(false);
      input.value = '';
    }
  };

  const firstName = (profile.displayName || user.displayName || 'Family').split(' ')[0];
  const profilePhoto = profile.photoURL || user.photoURL;
  const createdAt = user.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString()
    : 'Google account';
  const lastSignInAt = user.metadata?.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleString()
    : 'Unavailable';
  const emailVerified = typeof user.emailVerified === 'boolean' ? user.emailVerified : true;

  return (
    <section className="page-section">
      <SectionIntro
        eyebrow="Profile"
        title={`${firstName}'s member profile`}
        body="We pull your name, email, and profile photo from Google when you sign in. Add the family details you want other approved members and admins to have."
      />

      <div className="content-grid two-up profile-layout">
        <Card>
          <SectionHeader title="Google account details" meta="Pulled from sign-in" />
          <div className="profile-summary">
            {profilePhoto ? (
              <img alt={profile.displayName} className="profile-avatar" src={profilePhoto} />
            ) : (
              <div className="profile-avatar profile-avatar-fallback" aria-hidden="true">
                {firstName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="list-stack">
              <article className="list-item profile-detail-row">
                <div>
                  <strong>Google name</strong>
                  <p>{user.displayName || profile.displayName || 'Not provided by Google'}</p>
                </div>
              </article>
              <article className="list-item profile-detail-row">
                <div>
                  <strong>Email</strong>
                  <p>{user.email || profile.email}</p>
                </div>
              </article>
              <article className="list-item profile-detail-row">
                <div>
                  <strong>Account status</strong>
                  <p>{profile.status} · {profile.role}</p>
                </div>
              </article>
              <article className="list-item profile-detail-row">
                <div>
                  <strong>Email verified</strong>
                  <p>{emailVerified ? 'Yes' : 'No'}</p>
                </div>
              </article>
              <article className="list-item profile-detail-row">
                <div>
                  <strong>Google account created</strong>
                  <p>{createdAt}</p>
                </div>
              </article>
              <article className="list-item profile-detail-row">
                <div>
                  <strong>Last sign-in</strong>
                  <p>{lastSignInAt}</p>
                </div>
              </article>
            </div>
          </div>
        </Card>

        <Card accent="warm">
          <SectionHeader title="Family bio data" meta="Editable by you" />
          <form className="form-grid" onSubmit={onSubmit}>
            <label>
              Display name
              <input
                value={form.displayName}
                onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                placeholder="How your family should see your name"
              />
            </label>
            <label>
              Phone
              <input
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="Best contact number"
              />
            </label>
            <label>
              City
              <input
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
                placeholder="Where you live"
              />
            </label>
            <label>
              Email
              <input value={user.email || profile.email} readOnly />
            </label>
            <label className="full-span">
              Bio
              <textarea
                rows={6}
                value={form.bio}
                onChange={(event) => setForm({ ...form, bio: event.target.value })}
                placeholder="Share a short update about yourself, your household, or what everyone should know before the reunion."
              />
            </label>
            <div className="form-actions full-span">
              <button className="cta-button" type="submit">
                Save profile
              </button>
            </div>
          </form>
        </Card>

        <Card className="full-grid">
          <SectionHeader title="Profile image" meta="Visible across the portal" />
          <div className="profile-image-manager">
            {profilePhoto ? (
              <img alt={profile.displayName} className="profile-avatar profile-avatar-large" src={profilePhoto} />
            ) : (
              <div className="profile-avatar profile-avatar-fallback profile-avatar-large" aria-hidden="true">
                {firstName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="profile-upload-box">
              <label className={`upload-card compact-upload${imageUploading ? ' is-disabled' : ''}`}>
                <span>{imageUploading ? 'Uploading…' : 'Upload profile image'}</span>
                <input
                  accept="image/*"
                  disabled={imageUploading}
                  onChange={(event) => void onProfileImageChange(event)}
                  type="file"
                />
              </label>
              <p className="helper-text">
                Chooses a file and saves automatically to your profile (no need to click Save profile). JPG or PNG,
                max 5MB.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
};

const RegistrationPage = () => {
  const { profile } = useAuth();
  const { notify } = useNotification();
  const { data: registration, loading } = useUserRegistration(
    profile?.uid ?? '',
    profile?.email ?? '',
    profile?.displayName ?? '',
  );
  const [form, setForm] = useState<Registration>(registration);

  useEffect(() => {
    setForm(registration);
  }, [registration]);

  if (!profile) {
    return null;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveRegistration(profile.uid, form);
    await updateProfileFields(profile.uid, {
      displayName: profile.displayName,
      bio: profile.bio,
      city: form.city,
      phone: form.phone,
    });
    notify('Registration saved.', 'saved');
  };

  return (
    <section className="page-section">
      <SectionIntro
        eyebrow="Registration"
        title="Per-person attendee details"
        body="Each approved member manages their own RSVP, emergency contact, dietary notes, and travel details."
      />

      <Card>
        <form className="form-grid" onSubmit={onSubmit}>
          <label>
            Attendee name
            <input value={form.attendeeName} onChange={(event) => setForm({ ...form, attendeeName: event.target.value })} />
          </label>
          <label>
            Email
            <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </label>
          <label>
            City
            <input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
          </label>
          <label>
            RSVP
            <select value={form.rsvpStatus} onChange={(event) => setForm({ ...form, rsvpStatus: event.target.value as Registration['rsvpStatus'] })}>
              <option value="attending">Attending</option>
              <option value="maybe">Maybe</option>
              <option value="not-attending">Not attending</option>
            </select>
          </label>
          <label>
            T-shirt size
            <input value={form.tShirtSize} onChange={(event) => setForm({ ...form, tShirtSize: event.target.value })} />
          </label>
          <label>
            Emergency contact name
            <input
              value={form.emergencyContactName}
              onChange={(event) => setForm({ ...form, emergencyContactName: event.target.value })}
            />
          </label>
          <label>
            Emergency contact phone
            <input
              value={form.emergencyContactPhone}
              onChange={(event) => setForm({ ...form, emergencyContactPhone: event.target.value })}
            />
          </label>
          <label className="full-span">
            Travel plans
            <textarea value={form.travelPlans} onChange={(event) => setForm({ ...form, travelPlans: event.target.value })} rows={3} />
          </label>
          <label className="full-span">
            Dietary notes
            <textarea value={form.dietaryNotes} onChange={(event) => setForm({ ...form, dietaryNotes: event.target.value })} rows={3} />
          </label>
          <label className="full-span">
            Accessibility notes
            <textarea
              value={form.accessibilityNotes}
              onChange={(event) => setForm({ ...form, accessibilityNotes: event.target.value })}
              rows={3}
            />
          </label>
          <div className="form-actions full-span">
            <button className="cta-button" type="submit" disabled={loading}>
              Save registration
            </button>
          </div>
        </form>
      </Card>
    </section>
  );
};

const EventsPage = () => {
  const { profile } = useAuth();
  const { notify } = useNotification();
  const { data: events } = useEvents();
  const [form, setForm] = useState({
    title: '',
    description: '',
    venue: '',
    startAt: '',
    endAt: '',
  });

  const canManage = profile?.role === 'admin' || profile?.role === 'organizer';

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile) {
      return;
    }

    const id = await createEvent({
      ...form,
      startAt: form.startAt,
      endAt: form.endAt,
      visibility: 'members',
      createdBy: profile.uid,
    } as Omit<EventItem, 'id'>);

    if (id) {
      await logAuditEvent(profile.uid, profile.displayName, 'create', 'event', id, form.title);
    }
    setForm({ title: '', description: '', venue: '', startAt: '', endAt: '' });
    notify('Event published.', 'saved');
  };

  return (
    <section className="page-section">
      <SectionIntro eyebrow="Events" title="Reunion schedule" body="Publish the timeline, venues, and meeting notes that everyone needs before the weekend starts." />
      <div className="content-grid two-up">
        <Card>
          <SectionHeader title="Published events" meta={`${events.length} items`} />
          <div className="list-stack">
            {events.map((eventItem) => (
              <EventAssetCard
                key={eventItem.id}
                eventItem={eventItem}
                canManage={canManage}
                ownerUid={profile?.uid ?? ''}
                ownerName={profile?.displayName ?? ''}
              />
            ))}
          </div>
        </Card>

        <Card accent="warm">
          <SectionHeader title="Add event" meta={canManage ? 'Organizer or admin' : 'Read-only'} />
          {canManage ? (
            <form className="form-grid" onSubmit={onSubmit}>
              <label>
                Title
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
              </label>
              <label>
                Venue
                <input value={form.venue} onChange={(event) => setForm({ ...form, venue: event.target.value })} />
              </label>
              <label>
                Start time
                <input type="datetime-local" value={form.startAt} onChange={(event) => setForm({ ...form, startAt: event.target.value })} />
              </label>
              <label>
                End time
                <input type="datetime-local" value={form.endAt} onChange={(event) => setForm({ ...form, endAt: event.target.value })} />
              </label>
              <label className="full-span">
                Description
                <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} />
              </label>
              <div className="form-actions full-span">
                <button className="cta-button" type="submit">
                  Publish event
                </button>
              </div>
            </form>
          ) : (
            <p className="helper-text">Only organizers and admins can add or edit events.</p>
          )}
        </Card>
      </div>
    </section>
  );
};

const HotelsPage = () => {
  const { profile } = useAuth();
  const { notify } = useNotification();
  const { data: hotels } = useHotels();
  const [form, setForm] = useState({
    name: '',
    address: '',
    bookingUrl: '',
    contactName: '',
    contactEmail: '',
    roomBlock: '',
    rateNotes: '',
    deadline: '',
  });

  const canManage = profile?.role === 'admin' || profile?.role === 'organizer';

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile) return;
    const id = await createHotel({ ...form, createdBy: profile.uid } as Omit<Hotel, 'id'>);
    if (id) {
      await logAuditEvent(profile.uid, profile.displayName, 'create', 'hotel', id, form.name);
    }
    setForm({
      name: '',
      address: '',
      bookingUrl: '',
      contactName: '',
      contactEmail: '',
      roomBlock: '',
      rateNotes: '',
      deadline: '',
    });
    notify('Hotel saved.', 'saved');
  };

  return (
    <section className="page-section">
      <SectionIntro eyebrow="Hotels" title="Room blocks and stay details" body="V1 keeps hotel data informational only: booking links, deadlines, addresses, and contact notes." />
      <div className="content-grid two-up">
        <Card>
          <SectionHeader title="Recommended stays" meta="Outbound booking links" />
          <div className="list-stack">
            {hotels.map((hotel) => (
              <HotelAssetCard
                key={hotel.id}
                hotel={hotel}
                canManage={canManage}
                ownerUid={profile?.uid ?? ''}
                ownerName={profile?.displayName ?? ''}
              />
            ))}
          </div>
        </Card>

        <Card accent="cool">
          <SectionHeader title="Add hotel details" meta={canManage ? 'Organizer or admin' : 'Read-only'} />
          {canManage ? (
            <form className="form-grid" onSubmit={onSubmit}>
              <label>
                Hotel name
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </label>
              <label>
                Booking URL
                <input value={form.bookingUrl} onChange={(event) => setForm({ ...form, bookingUrl: event.target.value })} type="url" />
              </label>
              <label className="full-span">
                Address
                <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
              </label>
              <label>
                Contact name
                <input value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} />
              </label>
              <label>
                Contact email
                <input value={form.contactEmail} onChange={(event) => setForm({ ...form, contactEmail: event.target.value })} type="email" />
              </label>
              <label>
                Room block
                <input value={form.roomBlock} onChange={(event) => setForm({ ...form, roomBlock: event.target.value })} />
              </label>
              <label>
                Deadline
                <input type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} />
              </label>
              <label className="full-span">
                Rate notes
                <textarea value={form.rateNotes} onChange={(event) => setForm({ ...form, rateNotes: event.target.value })} rows={4} />
              </label>
              <div className="form-actions full-span">
                <button className="cta-button" type="submit">
                  Save hotel
                </button>
              </div>
            </form>
          ) : (
            <p className="helper-text">Only organizers and admins can maintain hotel content.</p>
          )}
        </Card>
      </div>
    </section>
  );
};

const FlightsPage = () => {
  const { profile } = useAuth();
  const { notify } = useNotification();
  const { data: flights } = useFlights();
  const [form, setForm] = useState({
    airline: '',
    flightNumber: '',
    departureAirport: '',
    arrivalAirport: '',
    departureAt: '',
    arrivalAt: '',
    travelerName: '',
    notes: '',
    confirmationCode: '',
  });

  if (!profile) {
    return null;
  }

  const visibleFlights = flights.filter(
    (f) => f.groupId === profile.groupId || f.ownerUid === profile.uid,
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = await createFlight({
      ownerUid: profile.uid,
      ownerName: form.travelerName.trim() || profile.displayName,
      groupId: profile.groupId ?? null,
      airline: form.airline.trim(),
      flightNumber: form.flightNumber.trim(),
      departureAirport: form.departureAirport.trim(),
      arrivalAirport: form.arrivalAirport.trim(),
      departureAt: form.departureAt,
      arrivalAt: form.arrivalAt || undefined,
      notes: form.notes.trim() || undefined,
      confirmationCode: form.confirmationCode.trim() || undefined,
    });
    if (id) {
      await logAuditEvent(profile.uid, profile.displayName, 'create', 'flight', id, `${form.airline} ${form.flightNumber}`);
    }
    notify('Flight saved.', 'saved');
    setForm({
      airline: '',
      flightNumber: '',
      departureAirport: '',
      arrivalAirport: '',
      departureAt: '',
      arrivalAt: '',
      travelerName: '',
      notes: '',
      confirmationCode: '',
    });
  };

  return (
    <section className="page-section">
      <SectionIntro
        eyebrow="Flights"
        title="Family travel plans"
        body="Add your flight details and share them with your family group. You can attach boarding passes, confirmations, or other documents to each flight."
      />
      <div className="content-grid two-up">
        <Card>
          <SectionHeader title="Family flights" meta={`${visibleFlights.length} flights`} />
          <div className="list-stack">
            {visibleFlights.map((flight) => (
              <FlightAssetCard
                key={flight.id}
                flight={flight}
                ownerUid={profile.uid}
                ownerName={profile.displayName}
                canManage={profile?.role === 'admin' || profile?.role === 'organizer'}
              />
            ))}
          </div>
        </Card>

        <Card accent="cool">
          <SectionHeader title="Add flight" meta="Visible to your family group" />
          <form className="form-grid" onSubmit={onSubmit}>
            <label>
              Airline
              <input
                value={form.airline}
                onChange={(event) => setForm({ ...form, airline: event.target.value })}
                placeholder="e.g. Caribbean Airlines"
              />
            </label>
            <label>
              Flight number
              <input
                value={form.flightNumber}
                onChange={(event) => setForm({ ...form, flightNumber: event.target.value })}
                placeholder="e.g. BW 500"
              />
            </label>
            <label>
              Departure airport
              <input
                value={form.departureAirport}
                onChange={(event) => setForm({ ...form, departureAirport: event.target.value })}
                placeholder="e.g. JFK"
              />
            </label>
            <label>
              Arrival airport
              <input
                value={form.arrivalAirport}
                onChange={(event) => setForm({ ...form, arrivalAirport: event.target.value })}
                placeholder="e.g. GEO"
              />
            </label>
            <label>
              Departure date & time
              <input
                type="datetime-local"
                value={form.departureAt}
                onChange={(event) => setForm({ ...form, departureAt: event.target.value })}
              />
            </label>
            <label>
              Arrival date & time
              <input
                type="datetime-local"
                value={form.arrivalAt}
                onChange={(event) => setForm({ ...form, arrivalAt: event.target.value })}
              />
            </label>
            <label>
              Traveler name
              <input
                value={form.travelerName}
                onChange={(event) => setForm({ ...form, travelerName: event.target.value })}
                placeholder={profile.displayName}
              />
            </label>
            <label>
              Confirmation code
              <input
                value={form.confirmationCode}
                onChange={(event) => setForm({ ...form, confirmationCode: event.target.value })}
                placeholder="Optional"
              />
            </label>
            <label className="full-span">
              Notes
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                rows={3}
                placeholder="Optional travel notes"
              />
            </label>
            <div className="form-actions full-span">
              <button className="cta-button" type="submit">
                Save flight
              </button>
            </div>
          </form>
        </Card>
      </div>
    </section>
  );
};

const FlightAssetCard = ({
  flight,
  ownerUid,
  ownerName,
  canManage,
}: {
  flight: Flight;
  ownerUid: string;
  ownerName: string;
  canManage: boolean;
}) => {
  const { data: assets } = useAssociatedAssets('flight', flight.id);
  const { notify } = useNotification();
  const [previewAsset, setPreviewAsset] = useState<AssetRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const flightLabel = `${flight.airline} ${flight.flightNumber}`;
  const canEdit = canManage;
  const [editForm, setEditForm] = useState({
    airline: flight.airline,
    flightNumber: flight.flightNumber,
    departureAirport: flight.departureAirport,
    arrivalAirport: flight.arrivalAirport,
    departureAt: typeof flight.departureAt === 'string' && (flight.departureAt as string).length >= 16 ? (flight.departureAt as string).slice(0, 16) : '',
    arrivalAt: flight.arrivalAt && typeof flight.arrivalAt === 'string' && (flight.arrivalAt as string).length >= 16 ? (flight.arrivalAt as string).slice(0, 16) : '',
    notes: flight.notes ?? '',
    confirmationCode: flight.confirmationCode ?? '',
    seat: flight.seat ?? '',
  });

  const saveEdit = async () => {
    await updateFlight(flight.id, {
      ...editForm,
      arrivalAt: editForm.arrivalAt || undefined,
      notes: editForm.notes || undefined,
      confirmationCode: editForm.confirmationCode || undefined,
      seat: editForm.seat || undefined,
    });
    await logAuditEvent(ownerUid, ownerName, 'update', 'flight', flight.id, flightLabel);
    setEditing(false);
    notify('Flight updated.', 'updated');
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete "${flightLabel}"? This cannot be undone.`)) return;
    await deleteFlight(flight.id);
    await logAuditEvent(ownerUid, ownerName, 'delete', 'flight', flight.id, flightLabel);
    notify('Flight removed.', 'deleted');
  };

  return (
    <>
      <article className="timeline-card attachment-card">
        <div>
          <div className="stack-row" style={{ flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
            <span className="pill">{flight.ownerName}</span>
            {canEdit && !editing && (
              <span className="stack-row">
                <button type="button" className="ghost-button" onClick={() => { setEditing(true); setEditForm({ airline: flight.airline, flightNumber: flight.flightNumber, departureAirport: flight.departureAirport, arrivalAirport: flight.arrivalAirport, departureAt: typeof flight.departureAt === 'string' && (flight.departureAt as string).length >= 16 ? (flight.departureAt as string).slice(0, 16) : '', arrivalAt: flight.arrivalAt && typeof flight.arrivalAt === 'string' && (flight.arrivalAt as string).length >= 16 ? (flight.arrivalAt as string).slice(0, 16) : '', notes: flight.notes ?? '', confirmationCode: flight.confirmationCode ?? '', seat: flight.seat ?? '' }); }}>Edit</button>
                <button type="button" className="ghost-button danger-button" onClick={() => void onDelete()}>Delete</button>
              </span>
            )}
          </div>
          {editing ? (
            <div className="form-grid" style={{ marginTop: '0.75rem' }}>
              <label>Airline <input value={editForm.airline} onChange={(e) => setEditForm({ ...editForm, airline: e.target.value })} /></label>
              <label>Flight # <input value={editForm.flightNumber} onChange={(e) => setEditForm({ ...editForm, flightNumber: e.target.value })} /></label>
              <label>From <input value={editForm.departureAirport} onChange={(e) => setEditForm({ ...editForm, departureAirport: e.target.value })} /></label>
              <label>To <input value={editForm.arrivalAirport} onChange={(e) => setEditForm({ ...editForm, arrivalAirport: e.target.value })} /></label>
              <label>Departure <input type="datetime-local" value={editForm.departureAt} onChange={(e) => setEditForm({ ...editForm, departureAt: e.target.value })} /></label>
              <label>Arrival <input type="datetime-local" value={editForm.arrivalAt} onChange={(e) => setEditForm({ ...editForm, arrivalAt: e.target.value })} /></label>
              <label>Notes <input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></label>
              <label>Confirmation <input value={editForm.confirmationCode} onChange={(e) => setEditForm({ ...editForm, confirmationCode: e.target.value })} /></label>
              <div className="stack-row full-span">
                <button type="button" className="cta-button" onClick={() => void saveEdit()}>Save</button>
                <button type="button" className="ghost-button" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <h3>{flightLabel}</h3>
              <p>{flight.departureAirport} → {flight.arrivalAirport}</p>
              <p className="helper-text">
                {formatDateTime(flight.departureAt)}
                {flight.arrivalAt ? ` – ${formatDateTime(flight.arrivalAt)}` : ''}
              </p>
              {flight.notes ? <p>{flight.notes}</p> : null}
            </>
          )}
        </div>
        {!editing && (
          <AssociatedAssetSection
            title="Flight documents & images"
            relatedType="flight"
            relatedId={flight.id}
            relatedLabel={flightLabel}
            assets={assets}
            canManage={true}
            ownerUid={ownerUid}
            ownerName={ownerName}
            onPreview={setPreviewAsset}
          />
        )}
      </article>
      <AssetPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />
    </>
  );
};

const BulletinPage = () => {
  const { profile } = useAuth();
  const { notify } = useNotification();
  const { data: posts } = useBulletinPosts();
  const { data: comments } = useBulletinComments();
  const { data: directory } = useDirectory();
  const { data: assets } = useAssets();
  const { data: events } = useEvents();
  const [newPost, setNewPost] = useState('');
  const [newComments, setNewComments] = useState<Record<string, string>>({});
  const [selectedMemberMention, setSelectedMemberMention] = useState('');
  const [selectedAssetMention, setSelectedAssetMention] = useState('');
  const [selectedEventMention, setSelectedEventMention] = useState('');
  const [bulletinImage, setBulletinImage] = useState<File | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [editingImage, setEditingImage] = useState<File | null>(null);

  if (!profile) {
    return null;
  }

  const mentionableDocs = assets.filter((asset) => asset.ownerUid === profile.uid && asset.kind === 'document');

  const appendMention = (token: string, setValue: (value: string) => void, current: string) => {
    setValue(`${current.trimEnd()} ${token}`.trim());
  };

  const submitPost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newPost.trim()) {
      return;
    }

    const attachment = bulletinImage
      ? await uploadBulletinAttachment({
          file: bulletinImage,
          ownerUid: profile.uid,
        })
      : null;

    const id = await createBulletinPost({
      authorUid: profile.uid,
      authorName: profile.displayName,
      body: newPost.trim(),
      ...(attachment ?? {}),
    });

    if (id) {
      await logAuditEvent(profile.uid, profile.displayName, 'create', 'bulletin_post', id, 'Post');
    }
    setNewPost('');
    setBulletinImage(null);
    notify('Post published.', 'saved');
  };

  const submitComment = async (event: FormEvent<HTMLFormElement>, post: BulletinPost) => {
    event.preventDefault();
    const body = newComments[post.id]?.trim();
    if (!body) {
      return;
    }

    await addBulletinComment({
      postId: post.id,
      authorUid: profile.uid,
      authorName: profile.displayName,
      body,
    });

    setNewComments((current) => ({ ...current, [post.id]: '' }));
    notify('Comment added.', 'saved');
  };

  const startEditing = (post: BulletinPost) => {
    setEditingPostId(post.id);
    setEditingBody(post.body);
    setEditingImage(null);
  };

  const saveEdit = async (post: BulletinPost) => {
    const nextAttachment = editingImage
      ? await uploadBulletinAttachment({
          file: editingImage,
          ownerUid: profile.uid,
        })
      : null;

    if (editingImage && post.attachmentPath) {
      await deleteStorageFile(post.attachmentPath);
    }

    await updateBulletinPost(post.id, {
      body: editingBody.trim(),
      ...(nextAttachment ?? {}),
    });

    await logAuditEvent(profile.uid, profile.displayName, 'update', 'bulletin_post', post.id, 'Post');
    setEditingPostId(null);
    setEditingBody('');
    setEditingImage(null);
    notify('Post updated.', 'updated');
  };

  const deletePost = async (post: BulletinPost) => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    if (post.attachmentPath) {
      await deleteStorageFile(post.attachmentPath);
    }
    await deleteBulletinPost(post.id);
    await logAuditEvent(profile.uid, profile.displayName, 'delete', 'bulletin_post', post.id, 'Post');
    setEditingPostId(null);
    notify('Post removed.', 'deleted');
  };

  const removePostImage = async (post: BulletinPost) => {
    if (post.attachmentPath) {
      await deleteStorageFile(post.attachmentPath);
    }

    await updateBulletinPost(post.id, {
      attachmentUrl: '',
      attachmentName: '',
      attachmentPath: '',
      attachmentContentType: '',
      attachmentKind: undefined,
    });
    setEditingPostId(null);
    setEditingBody('');
    setEditingImage(null);
    notify('Image removed from post.', 'deleted');
  };

  return (
    <section className="page-section">
      <SectionIntro eyebrow="Bulletin" title="Announcements and family discussion" body="Use the shared board for reminders, updates, and collaborative planning instead of fragmented chats." />
      <div className="content-grid two-up">
        <Card accent="warm">
          <SectionHeader title="New post" meta="Visible to approved members" />
          <form className="form-grid" onSubmit={submitPost}>
            <label className="full-span">
              Message
              <textarea value={newPost} onChange={(event) => setNewPost(event.target.value)} rows={5} />
            </label>
            <label>
              Mention member
              <select value={selectedMemberMention} onChange={(event) => setSelectedMemberMention(event.target.value)}>
                <option value="">Select member</option>
                {directory.map((member) => (
                  <option key={member.uid} value={mentionToken({ type: 'user', id: member.uid, label: member.displayName })}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mention document
              <select value={selectedAssetMention} onChange={(event) => setSelectedAssetMention(event.target.value)}>
                <option value="">Select uploaded document</option>
                {mentionableDocs.map((asset) => (
                  <option key={asset.id} value={mentionToken({ type: 'asset', id: asset.id, label: asset.fileName })}>
                    {asset.fileName}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-span">
              Mention event
              <select value={selectedEventMention} onChange={(event) => setSelectedEventMention(event.target.value)}>
                <option value="">Select event</option>
                {events.map((eventItem) => (
                  <option key={eventItem.id} value={mentionToken({ type: 'event', id: eventItem.id, label: eventItem.title })}>
                    {eventItem.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-actions full-span">
              <button
                className="ghost-button"
                onClick={() => {
                  if (selectedMemberMention) {
                    appendMention(selectedMemberMention, setNewPost, newPost);
                    setSelectedMemberMention('');
                  }
                }}
                type="button"
              >
                Add member mention
              </button>
              <button
                className="ghost-button"
                onClick={() => {
                  if (selectedAssetMention) {
                    appendMention(selectedAssetMention, setNewPost, newPost);
                    setSelectedAssetMention('');
                  }
                }}
                type="button"
              >
                Add document mention
              </button>
              <button
                className="ghost-button"
                onClick={() => {
                  if (selectedEventMention) {
                    appendMention(selectedEventMention, setNewPost, newPost);
                    setSelectedEventMention('');
                  }
                }}
                type="button"
              >
                Add event mention
              </button>
            </div>
            <label className="full-span">
              Upload image
              <input accept="image/*" onChange={(event) => setBulletinImage(event.currentTarget.files?.[0] ?? null)} type="file" />
            </label>
            <div className="form-actions full-span">
              <button className="cta-button" type="submit">
                Publish post
              </button>
            </div>
          </form>
        </Card>

        <Card>
          <SectionHeader title="Thread activity" meta={`${posts.length} posts`} />
          <div className="bulletin-stack">
            {posts.map((post) => (
              <article className="bulletin-post" key={post.id}>
                <div className="post-header">
                  <div>
                    <strong>{post.authorName}</strong>
                    <p>{relativeTime(post.createdAt)}</p>
                  </div>
                  {(post.authorUid === profile.uid || profile.role === 'admin' || profile.role === 'organizer') ? (
                    <span className="stack-row">
                      <button className="ghost-button" onClick={() => startEditing(post)} type="button">
                        Edit
                      </button>
                      <button className="ghost-button danger-button" onClick={() => void deletePost(post)} type="button">
                        Delete
                      </button>
                    </span>
                  ) : null}
                </div>
                {editingPostId === post.id ? (
                  <div className="edit-post-box">
                    <textarea value={editingBody} onChange={(event) => setEditingBody(event.target.value)} rows={5} />
                    <label>
                      Replace image
                      <input accept="image/*" onChange={(event) => setEditingImage(event.currentTarget.files?.[0] ?? null)} type="file" />
                    </label>
                    <div className="form-actions">
                      <button className="cta-button" onClick={() => void saveEdit(post)} type="button">
                        Save changes
                      </button>
                      <button className="ghost-button" onClick={() => setEditingPostId(null)} type="button">
                        Cancel
                      </button>
                      {post.attachmentUrl ? (
                        <button className="ghost-button danger-button" onClick={() => void removePostImage(post)} type="button">
                          Remove image
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rich-text">
                      {parseMentionSegments(post.body).map((segment, index) =>
                        segment.type === 'mention' ? (
                          <span className={`inline-mention mention-${segment.mentionType}`} key={`${segment.value}-${index}`}>
                            @{segment.value}
                          </span>
                        ) : (
                          <span key={`${segment.value}-${index}`}>{segment.value}</span>
                        ),
                      )}
                    </div>
                    {post.attachmentUrl && post.attachmentKind === 'image' ? (
                      <img alt={post.attachmentName ?? 'Bulletin attachment'} className="bulletin-image" src={post.attachmentUrl} />
                    ) : null}
                  </>
                )}
                <div className="comment-stack">
                  {comments
                    .filter((comment) => comment.postId === post.id)
                    .map((comment) => (
                      <div className="comment-card" key={comment.id}>
                        <strong>{comment.authorName}</strong>
                        <p>{comment.body}</p>
                      </div>
                    ))}
                </div>
                <form className="inline-comment-form" onSubmit={(event) => void submitComment(event, post)}>
                  <input
                    value={newComments[post.id] ?? ''}
                    onChange={(event) => setNewComments((current) => ({ ...current, [post.id]: event.target.value }))}
                    placeholder="Add a comment"
                  />
                  <button className="ghost-button" type="submit">
                    Reply
                  </button>
                </form>
              </article>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
};

const MessagesPage = () => {
  const { profile } = useAuth();
  const { notify } = useNotification();
  const { data: directory } = useDirectory();
  const { data: threads } = useThreads(profile?.uid ?? '');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const deferredSearch = useDeferredValue(memberSearch);
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null;
  const { data: messages } = useThreadMessages(selectedThread?.id ?? null);

  if (!profile) {
    return null;
  }

  const selfDirectoryEntry: DirectoryMember = {
    uid: profile.uid,
    id: profile.uid,
    displayName: profile.displayName,
    email: profile.email,
    photoURL: profile.photoURL,
    role: profile.role,
    groupId: profile.groupId ?? null,
  };

  const filteredMembers = directory.filter(
    (member) =>
      member.uid !== profile.uid &&
      `${member.displayName} ${member.email}`.toLowerCase().includes(deferredSearch.toLowerCase()),
  );

  const startThread = async (member: DirectoryMember) => {
    const threadId = await createOrGetDirectThread(selfDirectoryEntry, member);
    const existing = threads.find((thread) => thread.id === threadId);
    setSelectedThreadId(
      existing?.id ?? [profile.uid, member.uid].sort().join('__'),
    );
  };

  const onSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedThread || !messageText.trim()) {
      return;
    }

    await sendThreadMessage(
      selectedThread.id,
      {
        authorUid: profile.uid,
        authorName: profile.displayName,
        body: messageText.trim(),
      },
      selectedThread.participantIds,
      selectedThread.participantNames,
    );
    setMessageText('');
    notify('Message sent.', 'saved');
  };

  return (
    <section className="page-section">
      <SectionIntro eyebrow="Messages" title="Direct coordination threads" body="Use direct messages for side conversations that should not live on the public bulletin board." />
      <div className="messages-layout">
        <Card>
          <SectionHeader title="Start a thread" meta="Approved members only" />
          <label>
            Search members
            <input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search by name or email" />
          </label>
          <div className="list-stack compact">
            {filteredMembers.map((member) => (
              <button className="list-item interactive" key={member.uid} onClick={() => void startThread(member)}>
                <div>
                  <strong>{member.displayName}</strong>
                  <p>{member.email}</p>
                </div>
                <span className="pill">{member.role}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Your threads" meta={`${threads.length} active`} />
          <div className="list-stack compact">
            {threads.map((thread) => (
              <button
                className={`thread-card ${selectedThread?.id === thread.id ? 'selected' : ''}`}
                key={thread.id}
                onClick={() => setSelectedThreadId(thread.id)}
              >
                <strong>{thread.participantNames.filter((name) => name !== profile.displayName).join(', ') || 'Your thread'}</strong>
                <p>{thread.lastMessageText ?? 'No messages yet'}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card accent="cool">
          <SectionHeader title={selectedThread ? 'Conversation' : 'Select a thread'} meta={selectedThread ? relativeTime(selectedThread.updatedAt) : 'No thread selected'} />
          {selectedThread ? (
            <>
              <div className="message-stack">
                {messages.map((message) => (
                  <article
                    className={`message-bubble ${message.authorUid === profile.uid ? 'outbound' : 'inbound'}`}
                    key={message.id}
                  >
                    <strong>{message.authorName}</strong>
                    <p>{message.body}</p>
                  </article>
                ))}
              </div>
              <form className="inline-comment-form" onSubmit={onSend}>
                <input value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Type your message" />
                <button className="cta-button" type="submit">
                  Send
                </button>
              </form>
            </>
          ) : (
            <p className="helper-text">Choose a member on the left or open an existing thread.</p>
          )}
        </Card>
      </div>
    </section>
  );
};

const FilesPage = () => {
  const { profile } = useAuth();
  const { notify } = useNotification();
  const { data: assets } = useAssets();

  if (!profile) {
    return null;
  }

  const onFileChange = async (event: FormEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }

    const kind = file.type === 'application/pdf' ? 'document' : 'image';
    const id = await uploadAsset({ file, kind, ownerUid: profile.uid, ownerName: profile.displayName });
    if (id) await logAuditEvent(profile.uid, profile.displayName, 'create', 'asset', id, file.name);
    notify('File uploaded.', 'saved');
    event.currentTarget.value = '';
  };

  const onDeleteAsset = async (asset: AssetRecord) => {
    if (!window.confirm(`Delete "${asset.fileName}"? This cannot be undone.`)) return;
    await deleteAsset(asset);
    await logAuditEvent(profile.uid, profile.displayName, 'delete', 'asset', asset.id, asset.fileName);
    notify('File removed.', 'deleted');
  };

  return (
    <section className="page-section">
      <SectionIntro eyebrow="Files" title="Images and PDF uploads" body="Uploads are scoped to approved members and limited to image and PDF content types." />
      <div className="content-grid two-up">
        <Card accent="warm">
          <SectionHeader title="Upload asset" meta="Storage-backed" />
          <label className="upload-card">
            <span>Select an image or PDF</span>
            <input accept="image/*,application/pdf" onChange={(event) => void onFileChange(event)} type="file" />
          </label>
        </Card>

        <Card>
          <SectionHeader title="Shared assets" meta={`${assets.length} files`} />
          <div className="list-stack">
            {assets.map((asset) => (
              <article className="list-item" key={asset.id}>
                <div>
                  <strong>{asset.fileName}</strong>
                  <p>
                    {asset.ownerName} · {asset.kind}
                  </p>
                </div>
                <div className="timeline-meta stack-row">
                  <span>{formatFileSize(asset.size)}</span>
                  <a className="ghost-link" href={asset.downloadUrl} target="_blank" rel="noreferrer">
                    Open
                  </a>
                  {(profile?.role === 'admin' || profile?.role === 'organizer') && (
                    <button type="button" className="ghost-button danger-button" onClick={() => void onDeleteAsset(asset)}>
                      Delete
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
};

const RELATIONSHIP_TYPES: { value: RelationshipType; label: string }[] = [
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'wife', label: 'Wife' },
  { value: 'husband', label: 'Husband' },
  { value: 'partner', label: 'Partner' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'cousin', label: 'Cousin' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'grandchild', label: 'Grandchild' },
  { value: 'aunt', label: 'Aunt' },
  { value: 'uncle', label: 'Uncle' },
  { value: 'niece', label: 'Niece' },
  { value: 'nephew', label: 'Nephew' },
];

function RelationshipCombobox({
  value,
  onChange,
  ariaLabel,
  placeholder = 'Type to search...',
}: {
  value: RelationshipType;
  onChange: (v: RelationshipType) => void;
  ariaLabel: string;
  placeholder?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selectedOption = RELATIONSHIP_TYPES.find((o) => o.value === value);
  const filteredOptions = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return RELATIONSHIP_TYPES;
    return RELATIONSHIP_TYPES.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [filterText]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const displayValue = open ? filterText : (selectedOption?.label ?? value);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
        setFilterText('');
        setHighlightedIndex(0);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setFilterText('');
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filteredOptions[highlightedIndex];
      if (opt) {
        onChange(opt.value);
        setOpen(false);
        setFilterText('');
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => (i < filteredOptions.length - 1 ? i + 1 : 0));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => (i > 0 ? i - 1 : filteredOptions.length - 1));
      return;
    }
  };

  return (
    <div className="relationship-combobox" ref={containerRef}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open ? 'true' : 'false'}
        aria-autocomplete="list"
        aria-controls="relationship-listbox"
        aria-activedescendant={open && filteredOptions[highlightedIndex] ? `rel-option-${filteredOptions[highlightedIndex].value}` : undefined}
        aria-label={ariaLabel}
        value={displayValue}
        onChange={(e) => {
          setFilterText(e.target.value);
          setOpen(true);
          setHighlightedIndex(0);
        }}
        onFocus={() => {
          setOpen(true);
          setHighlightedIndex(0);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
      />
      {open && (
        <ul id="relationship-listbox" role="listbox" className="relationship-combobox-list">
          {filteredOptions.map((opt, i) => (
            <li
              key={opt.value}
              id={`rel-option-${opt.value}`}
              role="option"
              aria-selected={opt.value === value ? 'true' : 'false'}
              className={`relationship-combobox-option ${i === highlightedIndex ? 'highlighted' : ''}`}
              onMouseEnter={() => setHighlightedIndex(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
                setFilterText('');
              }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Single initial (first letter of first name), e.g. "Pamela Medas" → "P". Matches profile/center style. */
function getSingleInitial(displayName: string): string {
  const s = (displayName || '').trim();
  if (!s) return '?';
  const firstWord = s.split(/\s+/)[0] ?? s;
  return (firstWord[0] ?? '?').toUpperCase();
}

type FamilyTreeNodeData = {
  label: string;
  initials: string;
  photoURL?: string | null;
  isCenter?: boolean;
};

function FamilyTreeNode({ data }: NodeProps<FlowNode<FamilyTreeNodeData>>) {
  const [imgFailed, setImgFailed] = useState(false);
  const photoUrl = data?.photoURL;
  const name = data?.label ?? '';
  const initials = data?.initials ?? '?';
  const isCenter = data?.isCenter ?? false;
  const showPhoto = Boolean(photoUrl && typeof photoUrl === 'string' && photoUrl.trim() && !imgFailed);
  return (
    <div className={`family-tree-flow-node ${isCenter ? 'family-tree-flow-node-center' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="family-tree-flow-node-body">
        <div className="family-tree-flow-node-avatar">
          {showPhoto ? (
            <img
              src={photoUrl!}
              alt=""
              aria-hidden
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span className="family-tree-flow-node-initials">{initials}</span>
          )}
        </div>
        <span className="family-tree-flow-node-name">{name}</span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const familyTreeNodeTypes = { familyMember: FamilyTreeNode };

function FamilyTreeEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<FlowEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });
  const label = (data?.label as string) ?? '';
  return (
    <>
      <BaseEdge id={id} path={edgePath} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="family-tree-edge-label nodrag nopan"
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const familyTreeEdgeTypes = { familyRelationship: FamilyTreeEdge };

function FamilyTreeFlowChart({ flowNodes, flowEdges }: { flowNodes: FlowNode[]; flowEdges: FlowEdge[] }) {
  const [nodes, setNodes] = useState<FlowNode[]>(flowNodes);
  const [edges, setEdges] = useState<FlowEdge[]>(flowEdges);
  const onNodesChange = useCallback(
    (changes: Parameters<typeof applyNodeChanges>[0]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: Parameters<typeof applyEdgeChanges>[0]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  return (
    <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={familyTreeNodeTypes}
        edgeTypes={familyTreeEdgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.15, duration: 0 }}
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        proOptions={{ hideAttribution: true }}
        className="family-tree-react-flow"
      >
        <Controls />
        <MiniMap />
      </ReactFlow>
    </ReactFlowProvider>
  );
}

function FamilyTreePage() {
  const { profile } = useAuth();
  const { notify } = useNotification();
  const { data: directory } = useDirectory();
  const { data: relationships } = useFamilyRelationships();
  const [viewMode, setViewMode] = useState<'my' | 'full'>('my');
  const [treeModalOpen, setTreeModalOpen] = useState(false);
  useEffect(() => {
    if (!treeModalOpen) return;
    const onKey = (e: Event) => {
      if ((e as unknown as { key: string }).key === 'Escape') setTreeModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [treeModalOpen]);
  const [addForm, setAddForm] = useState<{ toUid: string; relationshipType: RelationshipType }>({ toUid: '', relationshipType: 'parent' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<RelationshipType | null>(null);

  const otherMembers = useMemo(
    () => directory.filter((m) => m.uid !== profile?.uid),
    [directory, profile?.uid],
  );
  const myRelationshipIds = useMemo(
    () =>
      new Set(
        relationships.flatMap((r) =>
          r.fromUid === profile?.uid || r.toUid === profile?.uid ? [r.id] : [],
        ),
      ),
    [relationships, profile?.uid],
  );
  const myRelationships = useMemo(
    () => relationships.filter((r) => myRelationshipIds.has(r.id)),
    [relationships, myRelationshipIds],
  );
  const canEditRel = (r: FamilyRelationship) =>
    r.createdBy === profile?.uid || profile?.role === 'admin';

  const onSubmitAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || !addForm.toUid) return;
    const id = await createRelationship({
      fromUid: profile.uid,
      toUid: addForm.toUid,
      relationshipType: addForm.relationshipType,
      createdBy: profile.uid,
    });
    if (id) {
      await logAuditEvent(profile.uid, profile.displayName, 'create', 'family_relationship', id, addForm.relationshipType);
      notify('Relationship added.', 'saved');
      setAddForm({ toUid: '', relationshipType: 'parent' });
    }
  };

  const onSaveEdit = async () => {
    if (!profile || !editingId || editingType === null) return;
    await updateRelationship(editingId, { relationshipType: editingType });
    await logAuditEvent(profile.uid, profile.displayName, 'update', 'family_relationship', editingId, editingType);
    notify('Relationship updated.', 'saved');
    setEditingId(null);
    setEditingType(null);
  };

  const onDeleteRel = async (r: FamilyRelationship) => {
    if (!profile || !window.confirm('Remove this relationship?')) return;
    await deleteRelationship(r.id);
    await logAuditEvent(profile.uid, profile.displayName, 'delete', 'family_relationship', r.id, r.relationshipType);
    notify('Relationship removed.', 'deleted');
  };

  const memberByUid = (uid: string) => directory.find((m) => m.uid === uid);
  const labelForRel = (r: FamilyRelationship) => {
    const from =
      r.fromUid === profile?.uid
        ? (profile.displayName ?? 'You')
        : (memberByUid(r.fromUid)?.displayName ?? r.fromUid);
    const to =
      r.toUid === profile?.uid
        ? (profile.displayName ?? 'You')
        : (memberByUid(r.toUid)?.displayName ?? r.toUid);
    return `${from} → ${to} (${r.relationshipType})`;
  };

  const nodeUidsMy = useMemo(() => {
    const uid = profile?.uid ?? '';
    const set = new Set<string>(uid ? [uid] : []);
    relationships.forEach((r) => {
      if (r.fromUid === uid || r.toUid === uid) {
        set.add(r.fromUid);
        set.add(r.toUid);
      }
    });
    return Array.from(set);
  }, [profile?.uid, relationships]);

  const nodeUidsFull = useMemo(() => {
    const uids = new Set(directory.map((m) => m.uid));
    if (profile?.uid) uids.add(profile.uid);
    return Array.from(uids);
  }, [directory, profile]);
  const edgesMy = useMemo(
    () => relationships.filter((r) => nodeUidsMy.includes(r.fromUid) && nodeUidsMy.includes(r.toUid)),
    [relationships, nodeUidsMy],
  );
  const edgesFull = relationships;

  const nodesMy = useMemo(() => {
    const members: DirectoryMember[] = [];
    for (const uid of nodeUidsMy) {
      const m = directory.find((md) => md.uid === uid);
      if (m) {
        members.push(m);
      } else if (uid === profile?.uid && profile) {
        members.push({
          id: profile.id ?? profile.uid,
          uid: profile.uid,
          displayName: profile.displayName ?? 'You',
          email: profile.email ?? '',
          photoURL: profile.photoURL ?? null,
          role: profile.role,
          groupId: profile.groupId ?? null,
        });
      }
    }
    return members;
  }, [nodeUidsMy, directory, profile]);
  const nodesFull = useMemo(() => {
    const members: DirectoryMember[] = [];
    for (const uid of nodeUidsFull) {
      const m = directory.find((md) => md.uid === uid);
      if (m) {
        members.push(m);
      } else if (uid === profile?.uid && profile) {
        members.push({
          id: profile.id ?? profile.uid,
          uid: profile.uid,
          displayName: profile.displayName ?? 'You',
          email: profile.email ?? '',
          photoURL: profile.photoURL ?? null,
          role: profile.role,
          groupId: profile.groupId ?? null,
        });
      }
    }
    return members;
  }, [nodeUidsFull, directory, profile]);
  const centerUid = viewMode === 'my' ? profile?.uid ?? null : null;
  const nodes = viewMode === 'my' ? nodesMy : nodesFull;
  const edges = viewMode === 'my' ? edgesMy : edgesFull;

  const graphWidth = 1100;
  const graphHeight = 600;
  const centerX = graphWidth / 2;
  const centerY = graphHeight / 2;
  const radius = Math.min(graphWidth, graphHeight) * 0.38;
  const nodePositions = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
    const list = viewMode === 'my' ? nodeUidsMy : nodeUidsFull;
    if (viewMode === 'my' && centerUid) {
      map[centerUid] = { x: centerX, y: centerY };
      const onCircle = list.filter((uid) => uid !== centerUid);
      onCircle.forEach((uid, i) => {
        const angle = (2 * Math.PI * i) / onCircle.length - Math.PI / 2;
        map[uid] = {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        };
      });
    } else {
      list.forEach((uid, i) => {
        const angle = (2 * Math.PI * i) / list.length - Math.PI / 2;
        map[uid] = {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        };
      });
    }
    return map;
  }, [viewMode, centerUid, nodeUidsMy, nodeUidsFull, centerX, centerY, radius]);

  const flowNodes: FlowNode[] = useMemo(() => {
    return nodes
      .filter((m) => nodePositions[m.uid])
      .map((member) => ({
        id: member.uid,
        type: 'familyMember',
        position: nodePositions[member.uid] ?? { x: 0, y: 0 },
        data: {
          label: member.displayName,
          initials: getSingleInitial(member.displayName),
          photoURL: member.photoURL ?? null,
          isCenter: member.uid === centerUid,
        },
      }));
  }, [nodes, nodePositions, centerUid]);

  const flowEdges: FlowEdge[] = useMemo(() => {
    return edges
      .filter((e) => nodePositions[e.fromUid] && nodePositions[e.toUid])
      .map((edge) => ({
        id: edge.id,
        type: 'familyRelationship',
        source: edge.fromUid,
        target: edge.toUid,
        label: edge.relationshipType,
        data: { label: edge.relationshipType },
      }));
  }, [edges, nodePositions]);

  const flowTreeKey = `${viewMode}-${flowNodes.length}-${flowEdges.length}-${flowNodes.map((n) => n.id).sort().join(',')}`;

  if (!profile) return null;

  return (
    <section className="page-section">
      <SectionIntro
        eyebrow="Family tree"
        title="Relationships and connections"
        body="Add your relationship to other family members and explore the tree. Your view starts with you at the center; the full tree shows everyone."
      />
      <div className="content-grid two-up">
        <Card accent="warm">
          <SectionHeader title="Add relationship" meta="You and another member" />
          <form className="form-grid" onSubmit={onSubmitAdd}>
            <label>
              Family member
              <select
                value={addForm.toUid}
                onChange={(e) => setAddForm((f) => ({ ...f, toUid: e.target.value }))}
                aria-label="Select family member"
              >
                <option value="">— Select —</option>
                {otherMembers.map((m) => (
                  <option key={m.uid} value={m.uid}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Relationship
              <RelationshipCombobox
                value={addForm.relationshipType}
                onChange={(v) => setAddForm((f) => ({ ...f, relationshipType: v }))}
                ariaLabel="Relationship type"
                placeholder="Type to search..."
              />
            </label>
            <div className="stack-row">
              <button type="submit" className="cta-button" disabled={!addForm.toUid}>
                Add
              </button>
            </div>
          </form>
        </Card>
        <Card>
          <SectionHeader title="My relationships" meta={`${myRelationships.length} links`} />
          <div className="list-stack compact">
            {myRelationships.length === 0 ? (
              <p className="helper-text">No relationships yet. Add one above.</p>
            ) : (
              myRelationships.map((r) => (
                <div key={r.id} className="stack-row" style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span className="helper-text">{labelForRel(r)}</span>
                  {canEditRel(r) && (
                    <span className="stack-row">
                      {editingId === r.id ? (
                        <>
                          <RelationshipCombobox
                            value={editingType ?? r.relationshipType}
                            onChange={(v) => setEditingType(v)}
                            ariaLabel="Edit relationship type"
                            placeholder="Type to search..."
                          />
                          <button type="button" className="ghost-button" onClick={() => void onSaveEdit()}>
                            Save
                          </button>
                          <button type="button" className="ghost-button" onClick={() => { setEditingId(null); setEditingType(null); }}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="ghost-button" onClick={() => { setEditingId(r.id); setEditingType(r.relationshipType); }}>
                            Edit
                          </button>
                          <button type="button" className="ghost-button danger-button" onClick={() => void onDeleteRel(r)}>
                            Delete
                          </button>
                        </>
                      )}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
      <div className="family-tree-graph-wrap">
        <div className="stack-row" style={{ marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={viewMode === 'my' ? 'cta-button' : 'ghost-button'}
            onClick={() => setViewMode('my')}
          >
            My tree
          </button>
          <button
            type="button"
            className={viewMode === 'full' ? 'cta-button' : 'ghost-button'}
            onClick={() => setViewMode('full')}
          >
            Full family tree
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setTreeModalOpen(true)}
            aria-label="Open family tree in full screen"
          >
            Expand
          </button>
        </div>
        <div className="family-tree-graph" style={{ width: '100%', maxWidth: graphWidth, height: graphHeight }}>
          <FamilyTreeFlowChart key={flowTreeKey} flowNodes={flowNodes} flowEdges={flowEdges} />
        </div>
      </div>
      {treeModalOpen && (
        <div
          className="family-tree-modal-backdrop"
          onClick={() => setTreeModalOpen(false)}
          role="presentation"
        >
          <div
            className="family-tree-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="family-tree-modal-title"
          >
            <div className="family-tree-modal-header">
              <h2 id="family-tree-modal-title">Family tree</h2>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setTreeModalOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="family-tree-modal-chart">
              <FamilyTreeFlowChart key={flowTreeKey} flowNodes={flowNodes} flowEdges={flowEdges} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const HelpPage = () => {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  }

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showManualInstall, setShowManualInstall] = useState(false);

  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

  useEffect(() => {
    const updateInstalledState = () => {
      const inStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsInstalled(inStandalone || iosStandalone);
    };

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowManualInstall(false);
    };

    updateInstalledState();
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const onInstallClick = async () => {
    if (isInstalled) {
      return;
    }

    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setShowManualInstall(false);
      }
      setDeferredPrompt(null);
      return;
    }

    setShowManualInstall(true);
  };

  return (
    <section className="page-section">
      <SectionIntro
        eyebrow="Help"
        title="How to use the portal"
        body="New to the family reunion portal? This guide walks you through each section so you can get the most out of the hub."
      />

      <Card>
        <SectionHeader title="Install on your device" meta="iPhone, Android, and desktop" />
        <p className="helper-text">
          Installing gives you faster access from your home screen and a more app-like experience.
        </p>
        <div className="stack-row" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            className="cta-button"
            disabled={isInstalled}
            onClick={() => void onInstallClick()}
          >
            {isInstalled ? 'App installed' : 'Install app'}
          </button>
        </div>

        {showManualInstall ? (
          <div className="content-grid two-up" style={{ marginTop: '1rem' }}>
            <Card accent="cool">
              <SectionHeader title="Android or desktop (Chrome/Edge)" meta="Recommended" />
              <ul className="checklist">
                <li>Open this portal in Chrome or Edge.</li>
                <li>Tap the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                <li>Confirm install to place it on your device home screen.</li>
              </ul>
            </Card>
            <Card accent="warm">
              <SectionHeader title="iPhone or iPad (Safari)" meta="Manual install" />
              <ul className="checklist">
                <li>Open this portal in Safari.</li>
                <li>Tap the <strong>Share</strong> button.</li>
                <li>Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</li>
              </ul>
            </Card>
          </div>
        ) : null}

        {!isInstalled && !deferredPrompt && isIos && !showManualInstall ? (
          <p className="helper-text" style={{ marginTop: '0.75rem' }}>
            iPhone and iPad install is manual. Tap <strong>Install app</strong> to view the steps.
          </p>
        ) : null}
      </Card>

      <Card accent="warm">
        <SectionHeader title="Quick start for new users" meta="Step by step" />
        <ul className="checklist">
          <li><strong>Profile</strong> — Confirm your name, photo, phone, and city from Google, and add a short family bio so others know who you are.</li>
          <li><strong>Registration</strong> — Enter attendee details, RSVP status, emergency contact, dietary and accessibility notes, and travel plans.</li>
          <li><strong>Events</strong> — View the reunion schedule (venues, times). RSVP to events. Only organizers and admins can add, edit, or delete events.</li>
          <li><strong>Hotels</strong> — See recommended stays, room blocks, booking links, and deadlines. Only organizers and admins can add, edit, or delete hotels.</li>
          <li><strong>Flights</strong> — Add your flight details (airline, times, airports) and attach boarding passes or confirmations. Only organizers and admins can edit or delete flights; everyone can add their own.</li>
          <li><strong>Family tree</strong> — Add relationships to other members (e.g. aunt, cousin). View <strong>My tree</strong> (you at the center) or <strong>Full family tree</strong>. Use <strong>Expand</strong> to open the map in a full-screen view.</li>
          <li><strong>Bulletin</strong> — Post announcements and discussions for the whole family. You can mention members, events, or documents and attach images.</li>
          <li><strong>Messages</strong> — Start direct threads with other members for private coordination.</li>
          <li><strong>Files</strong> — Upload shared images and PDFs. Only organizers and admins can delete files. You can also attach files to specific events, hotels, or flights from their pages.</li>
          <li><strong>Organizer</strong> — Organizers and admins can open the <strong>Organizer</strong> hub for invite links and shortcuts. The <strong>Admin</strong> page is for approvals and roles (admins only).</li>
        </ul>
      </Card>

      <div className="content-grid two-up">
        <Card>
          <SectionHeader title="Profile & registration" meta="Your identity in the portal" />
          <p className="helper-text">
            Start with <strong>Profile</strong> to set your display name and bio. Then open <strong>Registration</strong> to complete your RSVP, contact info, dietary and accessibility needs, and travel notes. This information helps organizers plan and keep everyone safe.
          </p>
        </Card>

        <Card>
          <SectionHeader title="Events, hotels & flights" meta="Logistics" />
          <p className="helper-text">
            <strong>Events</strong> show the reunion timeline; you can RSVP (Attending / Maybe / Not attending). <strong>Hotels</strong> list room blocks and booking links. In <strong>Flights</strong>, add your travel details and upload boarding passes or confirmations (images and PDFs, up to 5MB). Your flights are shared with members in your family group. Only <strong>organizers and admins</strong> can add, edit, or delete events and hotels, and edit or delete any flight or file.
          </p>
        </Card>

        <Card>
          <SectionHeader title="Family tree" meta="Relationships and connections" />
          <p className="helper-text">
            Add relationships (e.g. parent, spouse, aunt, cousin) between you and other members. <strong>My tree</strong> shows you at the center with your connections; <strong>Full family tree</strong> shows everyone. The map shows profile photos or initials and relationship labels on the lines. Use <strong>Expand</strong> to open the map in a full-screen modal for large family maps. You can edit or remove only relationships you created; admins can edit any.
          </p>
        </Card>

        <Card>
          <SectionHeader title="Bulletin & messages" meta="Communication" />
          <p className="helper-text">
            Use the <strong>Bulletin</strong> for announcements and group discussion. Use <strong>Messages</strong> to chat one-on-one with other approved members. You can search by name or email to start a new thread.
          </p>
        </Card>

        <Card>
          <SectionHeader title="Files & attachments" meta="Shared documents and images" />
          <p className="helper-text">
            The <strong>Files</strong> page is for general uploads (images and PDFs). You can also attach files to a specific event, hotel, or flight from their cards on the Events, Hotels, and Flights pages. All uploads are visible to approved members. Only <strong>organizers and admins</strong> can delete files.
          </p>
        </Card>
      </div>
    </section>
  );
};

const EventAssetCard = ({
  eventItem,
  canManage,
  ownerUid,
  ownerName,
}: {
  eventItem: EventItem;
  canManage: boolean;
  ownerUid: string;
  ownerName: string;
}) => {
  const { data: assets } = useAssociatedAssets('event', eventItem.id);
  const { data: rsvps } = useEventRsvps(eventItem.id);
  const { notify } = useNotification();
  const [previewAsset, setPreviewAsset] = useState<AssetRecord | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: eventItem.title,
    description: eventItem.description,
    venue: eventItem.venue,
    startAt: typeof eventItem.startAt === 'string' && eventItem.startAt.length >= 16 ? (eventItem.startAt as string).slice(0, 16) : '',
    endAt: eventItem.endAt && typeof eventItem.endAt === 'string' && (eventItem.endAt as string).length >= 16 ? (eventItem.endAt as string).slice(0, 16) : '',
  });

  const canEdit = canManage;
  const isEditing = editingEventId === eventItem.id;

  const myRsvp = rsvps.find((r) => r.userId === ownerUid);
  const attendingCount = rsvps.filter((r) => r.status === 'attending').length;
  const maybeCount = rsvps.filter((r) => r.status === 'maybe').length;

  const onRsvpChange = async (status: RSVPStatus) => {
    try {
      await setEventRsvp(ownerUid, eventItem.id, ownerName, status);
      notify(
        status === 'attending' ? 'You’re attending this event.' : status === 'maybe' ? 'Marked as maybe.' : 'RSVP updated.',
        'saved',
      );
    } catch {
      notify('Could not save your RSVP. If this keeps happening, ask an organizer to deploy the latest Firestore rules.', 'error');
    }
  };

  const startEdit = () => {
    setEditingEventId(eventItem.id);
    setEditForm({
      title: eventItem.title,
      description: eventItem.description,
      venue: eventItem.venue,
      startAt: typeof eventItem.startAt === 'string' && eventItem.startAt.length >= 16 ? (eventItem.startAt as string).slice(0, 16) : '',
      endAt: eventItem.endAt && typeof eventItem.endAt === 'string' && (eventItem.endAt as string).length >= 16 ? (eventItem.endAt as string).slice(0, 16) : '',
    });
  };

  const saveEdit = async () => {
    await updateEvent(eventItem.id, {
      title: editForm.title,
      description: editForm.description,
      venue: editForm.venue,
      startAt: editForm.startAt,
      endAt: editForm.endAt || undefined,
    });
    await logAuditEvent(ownerUid, ownerName, 'update', 'event', eventItem.id, eventItem.title);
    setEditingEventId(null);
    notify('Event updated.', 'updated');
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete "${eventItem.title}"? This cannot be undone.`)) return;
    await deleteEvent(eventItem.id);
    await logAuditEvent(ownerUid, ownerName, 'delete', 'event', eventItem.id, eventItem.title);
    notify('Event removed.', 'deleted');
  };

  return (
    <>
      <article className="timeline-card attachment-card">
        <div>
          <div className="stack-row" style={{ flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
            <span className="pill">{formatDate(eventItem.startAt)}</span>
            {canEdit && !isEditing && (
              <span className="stack-row">
                <button type="button" className="ghost-button" onClick={startEdit}>Edit</button>
                <button type="button" className="ghost-button danger-button" onClick={() => void onDelete()}>Delete</button>
              </span>
            )}
          </div>
          {isEditing ? (
            <div className="form-grid" style={{ marginTop: '0.75rem' }}>
              <label>Title <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></label>
              <label>Venue <input value={editForm.venue} onChange={(e) => setEditForm({ ...editForm, venue: e.target.value })} /></label>
              <label>Start <input type="datetime-local" value={editForm.startAt} onChange={(e) => setEditForm({ ...editForm, startAt: e.target.value })} /></label>
              <label>End <input type="datetime-local" value={editForm.endAt} onChange={(e) => setEditForm({ ...editForm, endAt: e.target.value })} /></label>
              <label className="full-span">Description <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} /></label>
              <div className="stack-row full-span">
                <button type="button" className="cta-button" onClick={() => void saveEdit()}>Save</button>
                <button type="button" className="ghost-button" onClick={() => setEditingEventId(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <h3>{eventItem.title}</h3>
              <p>{eventItem.description}</p>
            </>
          )}
        </div>
        {!isEditing && (
          <>
        <div className="timeline-meta">
          <strong>{eventItem.venue}</strong>
          <span>{formatDateTime(eventItem.startAt)}</span>
        </div>
        <div className="event-rsvp-row">
          <label className="event-rsvp-label">
            <span className="helper-text">Your RSVP</span>
            <select
              value={myRsvp?.status ?? ''}
              onChange={(e) => {
                const v = e.target.value as RSVPStatus | '';
                if (v) void onRsvpChange(v);
              }}
              aria-label={`RSVP for ${eventItem.title}`}
            >
              <option value="">—</option>
              <option value="attending">Attending</option>
              <option value="maybe">Maybe</option>
              <option value="not-attending">Not attending</option>
            </select>
          </label>
          {(attendingCount > 0 || maybeCount > 0) && (
            <span className="event-rsvp-counts helper-text">
              {attendingCount > 0 && `${attendingCount} attending`}
              {attendingCount > 0 && maybeCount > 0 && ', '}
              {maybeCount > 0 && `${maybeCount} maybe`}
            </span>
          )}
        </div>
        <AssociatedAssetSection
          title="Event attachments"
          relatedType="event"
          relatedId={eventItem.id}
          relatedLabel={eventItem.title}
          assets={assets}
          canManage={canManage}
          ownerUid={ownerUid}
          ownerName={ownerName}
          onPreview={setPreviewAsset}
        />
          </>
        )}
      </article>
      <AssetPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />
    </>
  );
};

const HotelAssetCard = ({
  hotel,
  canManage,
  ownerUid,
  ownerName,
}: {
  hotel: Hotel;
  canManage: boolean;
  ownerUid: string;
  ownerName: string;
}) => {
  const { data: assets } = useAssociatedAssets('hotel', hotel.id);
  const { notify } = useNotification();
  const [previewAsset, setPreviewAsset] = useState<AssetRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: hotel.name,
    address: hotel.address,
    bookingUrl: hotel.bookingUrl,
    contactName: hotel.contactName,
    contactEmail: hotel.contactEmail,
    roomBlock: hotel.roomBlock,
    rateNotes: hotel.rateNotes,
    deadline: hotel.deadline ? (typeof hotel.deadline === 'string' ? (hotel.deadline as string).slice(0, 10) : '') : '',
  });

  const canEdit = canManage;

  const saveEdit = async () => {
    await updateHotel(hotel.id, {
      ...editForm,
      deadline: editForm.deadline || undefined,
    });
    await logAuditEvent(ownerUid, ownerName, 'update', 'hotel', hotel.id, hotel.name);
    setEditing(false);
    notify('Hotel updated.', 'updated');
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete "${hotel.name}"? This cannot be undone.`)) return;
    await deleteHotel(hotel.id);
    await logAuditEvent(ownerUid, ownerName, 'delete', 'hotel', hotel.id, hotel.name);
    notify('Hotel removed.', 'deleted');
  };

  return (
    <>
      <article className="hotel-card attachment-card">
        <div>
          <div className="stack-row" style={{ flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
            <h3>{hotel.name}</h3>
            {canEdit && !editing && (
              <span className="stack-row">
                <button type="button" className="ghost-button" onClick={() => { setEditing(true); setEditForm({ name: hotel.name, address: hotel.address, bookingUrl: hotel.bookingUrl, contactName: hotel.contactName, contactEmail: hotel.contactEmail, roomBlock: hotel.roomBlock, rateNotes: hotel.rateNotes, deadline: hotel.deadline ? (typeof hotel.deadline === 'string' ? (hotel.deadline as string).slice(0, 10) : '') : '' }); }}>Edit</button>
                <button type="button" className="ghost-button danger-button" onClick={() => void onDelete()}>Delete</button>
              </span>
            )}
          </div>
          {editing ? (
            <div className="form-grid" style={{ marginTop: '0.75rem' }}>
              <label>Name <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></label>
              <label>Booking URL <input type="url" value={editForm.bookingUrl} onChange={(e) => setEditForm({ ...editForm, bookingUrl: e.target.value })} /></label>
              <label className="full-span">Address <input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></label>
              <label>Contact <input value={editForm.contactName} onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })} /></label>
              <label>Email <input type="email" value={editForm.contactEmail} onChange={(e) => setEditForm({ ...editForm, contactEmail: e.target.value })} /></label>
              <label>Room block <input value={editForm.roomBlock} onChange={(e) => setEditForm({ ...editForm, roomBlock: e.target.value })} /></label>
              <label>Deadline <input type="date" value={editForm.deadline} onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })} /></label>
              <label className="full-span">Rate notes <textarea value={editForm.rateNotes} onChange={(e) => setEditForm({ ...editForm, rateNotes: e.target.value })} rows={3} /></label>
              <div className="stack-row full-span">
                <button type="button" className="cta-button" onClick={() => void saveEdit()}>Save</button>
                <button type="button" className="ghost-button" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <p>{hotel.address}</p>
              <p>{hotel.rateNotes}</p>
            </>
          )}
        </div>
        {!editing && (
          <>
        <div className="timeline-meta">
          <span>{hotel.roomBlock}</span>
          <span>Deadline: {formatDate(hotel.deadline)}</span>
          <a className="ghost-link" href={hotel.bookingUrl} target="_blank" rel="noreferrer">
            Visit booking link
          </a>
        </div>
        <AssociatedAssetSection
          title="Hotel attachments"
          relatedType="hotel"
          relatedId={hotel.id}
          relatedLabel={hotel.name}
          assets={assets}
          canManage={canManage}
          ownerUid={ownerUid}
          ownerName={ownerName}
          onPreview={setPreviewAsset}
        />
          </>
        )}
      </article>
      <AssetPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />
    </>
  );
};

const AssociatedAssetSection = ({
  title,
  relatedType,
  relatedId,
  relatedLabel,
  assets,
  canManage,
  ownerUid,
  ownerName,
  onPreview,
}: {
  title: string;
  relatedType: 'event' | 'hotel' | 'flight';
  relatedId: string;
  relatedLabel: string;
  assets: AssetRecord[];
  canManage: boolean;
  ownerUid: string;
  ownerName: string;
  onPreview: (asset: AssetRecord | null) => void;
}) => {
  const { notify } = useNotification();
  const [description, setDescription] = useState('');
  const maxFileSizeBytes = 5 * 1024 * 1024; // 5MB

  const onFileChange = async (event: FormEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file || !ownerUid) {
      return;
    }

    if (file.size > maxFileSizeBytes) {
      notify('Please upload files smaller than 5MB (images or PDFs).', 'error');
      event.currentTarget.value = '';
      return;
    }

    const kind = file.type === 'application/pdf' ? 'document' : 'image';
    const id = await uploadAsset({
      file,
      kind,
      ownerUid,
      ownerName,
      description,
      relatedType,
      relatedId,
      relatedLabel,
    });
    if (id) await logAuditEvent(ownerUid, ownerName, 'create', 'asset', id, file.name);
    setDescription('');
    notify('Attachment uploaded.', 'saved');
    event.currentTarget.value = '';
  };

  const onDelete = async (asset: AssetRecord) => {
    await deleteAsset(asset);
    await logAuditEvent(ownerUid, ownerName, 'delete', 'asset', asset.id, asset.fileName);
    notify('File removed.', 'deleted');
  };

  return (
    <section className="associated-assets">
      <SectionHeader title={title} meta={`${assets.length} attached`} />
      {canManage ? (
        <div className="asset-upload-box">
          <label className="full-span">
            Optional description
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add a short note about this image or document"
            />
          </label>
          <label className="upload-card compact-upload">
            <span>Upload image or PDF for {relatedLabel}</span>
            <input accept="image/*,application/pdf" onChange={(event) => void onFileChange(event)} type="file" />
          </label>
        </div>
      ) : null}
      <div className="asset-grid">
        {assets.length ? (
          assets.map((asset) => (
            <article className="asset-preview-card" key={asset.id}>
              <div>
                <strong>{asset.fileName}</strong>
                <p>{asset.description || `${asset.ownerName} · ${asset.kind}`}</p>
              </div>
              {asset.kind === 'image' ? (
                <button className="asset-thumb-button" onClick={() => onPreview(asset)} type="button">
                  <img alt={asset.fileName} className="asset-thumb" src={asset.downloadUrl} />
                </button>
              ) : (
                <button className="document-preview-button" onClick={() => onPreview(asset)} type="button">
                  Preview PDF
                </button>
              )}
              <div className="stack-row">
                <button className="ghost-button" onClick={() => onPreview(asset)} type="button">
                  Preview
                </button>
                <a className="ghost-link" href={asset.downloadUrl} target="_blank" rel="noreferrer">
                  Open
                </a>
                {(canManage || asset.ownerUid === ownerUid) ? (
                  <button className="ghost-button danger-button" onClick={() => void onDelete(asset)} type="button">
                    Delete
                  </button>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <p className="helper-text">No attachments yet for this {relatedType}.</p>
        )}
      </div>
    </section>
  );
};

const AssetPreviewModal = ({
  asset,
  onClose,
}: {
  asset: AssetRecord | null;
  onClose: () => void;
}) => {
  if (!asset) {
    return null;
  }

  return (
    <div className="asset-modal-backdrop" onClick={onClose} role="presentation">
      <div className="asset-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="section-header">
          <div>
            <h2>{asset.fileName}</h2>
            <p className="helper-text">{asset.description || `${asset.relatedLabel ?? 'Attachment'} · ${asset.kind}`}</p>
          </div>
          <button className="ghost-button" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <div className="asset-modal-body">
          {asset.kind === 'image' ? (
            <img alt={asset.fileName} className="asset-modal-image" src={asset.downloadUrl} />
          ) : (
            <iframe className="asset-modal-frame" src={asset.downloadUrl} title={asset.fileName} />
          )}
        </div>
      </div>
    </div>
  );
};

const AuditPage = () => {
  const { data: logs } = useAuditLogs();

  return (
    <section className="page-section">
      <SectionIntro
        eyebrow="Audit log"
        title="Activity history"
        body="All create, update, and delete actions are logged. Visible to admins only."
      />
      <Card>
        <SectionHeader title="Recent activity" meta={`${logs.length} entries`} />
        <div className="list-stack">
          {logs.map((entry) => (
            <article className="list-item" key={entry.id}>
              <div>
                <strong>{entry.userDisplayName}</strong>
                <p>
                  {entry.action} {entry.resourceType.replace('_', ' ')}
                  {entry.resourceLabel ? `: ${entry.resourceLabel}` : ''}
                  {entry.details ? ` — ${entry.details}` : ''}
                </p>
              </div>
              <span className="helper-text">{formatDateTime(entry.createdAt)}</span>
            </article>
          ))}
        </div>
      </Card>
    </section>
  );
};

const PendingApprovalsCard = () => {
  const { user, isDemoMode } = useAuth();
  const { notify } = useNotification();
  const { data: pendingUsers } = usePendingApprovals();

  if (!user) {
    return null;
  }

  const withToken = async <T,>(callback: (token: string) => Promise<T>) => {
    if (isDemoMode) {
      notify('Demo mode active. Connect Firebase Functions to approve members.', 'error');
      return null;
    }
    const token = await user.getIdToken();
    return callback(token);
  };

  const approveMember = async (uid: string, role: Role = 'member') => {
    await withToken((token) => callBackend(token, 'approveUser', { uid, role }));
    notify('Member approved.', 'saved');
  };

  return (
    <Card accent="warm">
      <SectionHeader title="Pending join requests" meta={`${pendingUsers.length} waiting`} />
      <p className="helper-text">
        Approve people who signed in and are waiting for access. They join as <strong>members</strong>. Admins can promote roles from the Admin page.
      </p>
      <div className="list-stack">
        {pendingUsers.length === 0 ? (
          <p className="helper-text">No pending requests.</p>
        ) : (
          pendingUsers.map((member) => (
            <article className="list-item" key={member.uid}>
              <div>
                <strong>{member.displayName}</strong>
                <p>{member.email}</p>
              </div>
              <button type="button" className="cta-button" onClick={() => void approveMember(member.uid)}>
                Approve
              </button>
            </article>
          ))
        )}
      </div>
    </Card>
  );
};

const InviteLinkCard = () => {
  const { user, isDemoMode } = useAuth();
  const { notify } = useNotification();
  const [inviteLink, setInviteLink] = useState('');

  if (!user) {
    return null;
  }

  const withToken = async <T,>(callback: (token: string) => Promise<T>) => {
    if (isDemoMode) {
      notify('Demo mode active. Connect Firebase Functions to run admin actions.', 'error');
      return null;
    }
    const token = await user.getIdToken();
    return callback(token);
  };

  const createInvite = async () => {
    const response = await withToken<{ inviteUrl: string }>((token) =>
      callBackend(token, 'createInvite', { expiresInDays: 14 }),
    );
    if (response?.inviteUrl) {
      setInviteLink(response.inviteUrl);
    }
    notify('Invite link created.', 'saved');
  };

  const copyInviteLink = async () => {
    if (!inviteLink) {
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteLink);
      } else {
        const fallbackInput = document.createElement('input');
        fallbackInput.value = inviteLink;
        document.body.appendChild(fallbackInput);
        fallbackInput.select();
        document.execCommand('copy');
        document.body.removeChild(fallbackInput);
      }
      notify('Invite link copied.', 'saved');
    } catch {
      notify('Could not copy link. Please copy it manually.', 'error');
    }
  };

  return (
    <Card>
      <SectionHeader title="Create invite link" meta="Organizer or admin" />
      <p className="helper-text">
        Create a shareable login link, copy it, and send it to family members so they can sign in and request access.
      </p>
      <div className="stack-row" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="cta-button" onClick={() => void createInvite()}>
          Create invite
        </button>
        <button type="button" className="ghost-button" disabled={!inviteLink} onClick={() => void copyInviteLink()}>
          Copy invite link
        </button>
        {inviteLink ? (
          <a className="ghost-link" href={inviteLink} target="_blank" rel="noreferrer">
            Open invite link
          </a>
        ) : null}
      </div>
      {inviteLink ? (
        <label>
          Invite URL
          <input readOnly value={inviteLink} />
        </label>
      ) : null}
    </Card>
  );
};

const OrganizerPage = () => {
  return (
    <section className="page-section">
      <SectionIntro
        eyebrow="Organizer"
        title="Organizer hub"
        body="Approve join requests, share invite links, and manage reunion logistics. Admins can change member roles from the Admin page."
      />
      <div className="content-grid two-up">
        <PendingApprovalsCard />
        <InviteLinkCard />
        <Card accent="warm">
          <SectionHeader title="What you can manage" meta="From the main nav" />
          <ul className="checklist">
            <li>
              <Link to="/app/events">Events</Link> — add, edit, and delete schedule items; members RSVP from each event card.
            </li>
            <li>
              <Link to="/app/hotels">Hotels</Link> — room blocks, booking links, and deadlines.
            </li>
            <li>
              <Link to="/app/flights">Flights</Link> — edit or remove any member&apos;s flight entries and attachments.
            </li>
            <li>
              <Link to="/app/files">Files</Link> — delete shared uploads when needed.
            </li>
            <li>
              <Link to="/app/bulletin">Bulletin</Link> — edit or delete any post to keep announcements clear.
            </li>
          </ul>
        </Card>
      </div>
    </section>
  );
};

const AdminPage = () => {
  const { profile, user, isDemoMode } = useAuth();
  const { notify } = useNotification();
  const { data: directory } = useDirectory();

  if (!profile || !user) {
    return null;
  }

  const withToken = async <T,>(callback: (token: string) => Promise<T>) => {
    if (isDemoMode) {
      notify('Demo mode active. Connect Firebase Functions to run admin actions.', 'error');
      return null;
    }

    const token = await user.getIdToken();
    return callback(token);
  };

  const changeRole = async (uid: string, role: Role) => {
    await withToken((token) => callBackend(token, 'changeRole', { uid, role }));
    notify('Role updated.', 'updated');
  };

  return (
    <section className="page-section">
      <SectionIntro eyebrow="Admin" title="Approvals, roles, and invites" body="Privileged actions route through the single HTTPS function so admin credentials never reach the client." />
      <div className="content-grid two-up">
        <PendingApprovalsCard />

        <InviteLinkCard />

        <Card className="full-grid">
          <SectionHeader title="Role assignments" meta="Approved directory" />
          <div className="list-stack">
            {directory.map((member) => (
              <article className="list-item" key={member.uid}>
                <div>
                  <strong>{member.displayName}</strong>
                  <p>{member.email}</p>
                </div>
                <div className="stack-row">
                  <span className="pill">{member.role}</span>
                  <select defaultValue={member.role} onChange={(event) => void changeRole(member.uid, event.target.value as Role)}>
                    <option value="member">member</option>
                    <option value="organizer">organizer</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
              </article>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
};

const Card = ({
  children,
  accent,
  className = '',
}: {
  children: ReactNode;
  accent?: 'warm' | 'cool';
  className?: string;
}) => <section className={`panel-card ${accent ? `accent-${accent}` : ''} ${className}`.trim()}>{children}</section>;

const SectionHeader = ({ title, meta }: { title: string; meta?: string }) => (
  <header className="section-header">
    <h2>{title}</h2>
    {meta ? <span>{meta}</span> : null}
  </header>
);

const SectionIntro = ({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) => (
  <header className="section-intro">
    <p className="eyebrow">{eyebrow}</p>
    <h1>{title}</h1>
    <p>{body}</p>
  </header>
);

const StatCard = ({ title, value, detail }: { title: string; value: string; detail: string }) => (
  <article className="stat-card">
    <span>{title}</span>
    <strong>{value}</strong>
    <p>{detail}</p>
  </article>
);
