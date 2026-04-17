import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ReactFlow, ReactFlowProvider, Controls, MiniMap, Handle, BaseEdge, EdgeLabelRenderer, getSmoothStepPath, applyNodeChanges, applyEdgeChanges, Position, type Node as FlowNode, type Edge as FlowEdge, type NodeProps, type EdgeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useNotification } from '../contexts/useNotification';
import { useAuth } from '../hooks/useAuth';
import { callBackend, requestSyncMyDirectory } from '../lib/functionsApi';
import { AssetPreviewModal } from '../components/AssetPreviewModal';
import { QuickMessageModal } from '../components/QuickMessageModal';
import { PortalShell } from './layout/PortalShell';
import { Card, SectionHeader, SectionIntro, StatCard } from '../components/ui/PortalPrimitives';
import { FullscreenState } from './components/FullscreenState';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LandingPage } from './pages/LandingPage';
import { PendingPage } from './pages/PendingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import {
  addBulletinComment,
  createBulletinPost,
  createEvent,
  createFamilyPerson,
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
  uploadFamilyPersonPhoto,
  uploadProfileImage,
  useAssociatedAssets,
  useAssets,
  useAuditLogs,
  useBulletinComments,
  useBulletinPosts,
  useDirectory,
  useEventRsvps,
  useEvents,
  useFamilyPeople,
  useFamilyRelationships,
  useFlights,
  useHotels,
  usePendingApprovals,
  useRegistrations,
  useThreadMessages,
  useThreads,
  useUserRegistration,
} from '../lib/firestore';
import { formatDate, formatDateTime, formatFileSize, relativeTime, toDate } from '../lib/format';
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
  Thread,
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
  const segments: Array<{ type: 'text' | 'mention'; value: string; mentionType?: string; mentionId?: string }> = [];
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
      mentionId: match[2],
    });
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
};

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
            <PortalShell
              overview={<OverviewPage />}
              profile={<ProfilePage />}
              registration={<RegistrationPage />}
              events={<EventsPage />}
              hotels={<HotelsPage />}
              flights={<FlightsPage />}
              bulletin={<BulletinPage />}
              messages={<MessagesPage />}
              files={<FilesPage />}
              familyTree={<FamilyTreePage />}
              help={<HelpPage />}
              audit={<AuditPage />}
              organizer={<OrganizerPage />}
              admin={<AdminPage />}
            />
          </ProtectedRoute>
        }
      />
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

const OverviewPage = () => {
  const { data: events } = useEvents();
  const { data: hotels } = useHotels();
  const { data: posts } = useBulletinPosts();
  const { data: assets } = useAssets();
  const { data: registrations } = useRegistrations();
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const stripMentionTokens = (text: string) =>
    text.replace(/@\[(user|asset|event):[^:\]]+:[^\]]+]/g, (_m, _t1: string, t2: string) => t2).trim();

  const latestPost = posts[0] ?? null;
  const latestPostSnippet = latestPost
    ? `${stripMentionTokens(latestPost.body ?? '').slice(0, 120)}${stripMentionTokens(latestPost.body ?? '').length > 120 ? '…' : ''}`
    : '';

  const upcomingEvents = [...events]
    .sort((a, b) => Date.parse(String(a.startAt)) - Date.parse(String(b.startAt)))
    .slice(0, 2);
  const latestActivity = posts.slice(0, 3);
  const planningMembers = [...new Set(posts.slice(0, 4).map((post) => post.authorName))];
  const primaryEvent = upcomingEvents[0] ?? events[0] ?? null;
  const bannerTitle = primaryEvent?.title?.trim() || 'Family Reunion Weekend';
  const bannerVenue = primaryEvent?.venue?.trim() || 'Location TBD';
  const startDate = toDate(primaryEvent?.startAt);
  const endDate = toDate(primaryEvent?.endAt);
  const bannerStatus = (() => {
    if (!startDate) return 'Coming soon';
    const startTs = startDate.getTime();
    const endTs = endDate ? endDate.getTime() : startTs + 24 * 60 * 60 * 1000;
    if (nowTs < startTs) return 'Coming soon';
    if (nowTs <= endTs) return 'Happening now';
    return 'Completed';
  })();
  const bannerDate = startDate
    ? endDate
      ? `${formatDate(startDate)} to ${formatDate(endDate)}`
      : formatDate(startDate)
    : 'Date TBD';
  const attendingCount = registrations.filter((registration) => registration.rsvpStatus === 'attending').length;
  const bannerRsvp = attendingCount > 0 ? `${attendingCount} RSVPs confirmed.` : 'RSVPs pending.';

  return (
    <section className="page-section hk-dashboard-page">
      <header className="hk-dashboard-intro">
        <div>
          <h1>Heritage Hearth</h1>
          <p>Welcome back to the family hub.</p>
        </div>
        <div className="hk-dashboard-search" aria-hidden="true">
          <span>Search memories...</span>
        </div>
      </header>

      <article className="hk-dashboard-hero">
        <span className="pill">{bannerStatus}</span>
        <h2>{bannerTitle}</h2>
        <p>{`${bannerVenue}. ${bannerDate}. ${bannerRsvp}`}</p>
      </article>

      <div className="hk-dashboard-main-grid">
        <div>
          <div className="hk-section-headline">
            <h3>Upcoming Details</h3>
            <Link to="/app/events">View All</Link>
          </div>

          <div className="hk-upcoming-grid">
            <article className="hk-upcoming-card">
              <p className="hk-card-tag">Booked</p>
              <h4>{hotels[0]?.name ?? 'Grand Tahoe Lodge'}</h4>
              <p>{hotels[0]?.deadline ? `Deadline ${formatDate(hotels[0].deadline)}` : 'Check-in Friday, July 12'}</p>
              <Link to="/app/hotels">Get directions</Link>
            </article>
            <article className="hk-upcoming-card">
              <p className="hk-card-tag">Day 1</p>
              <h4>{upcomingEvents[0]?.title ?? 'Welcome BBQ'}</h4>
              <p>{upcomingEvents[0] ? formatDateTime(upcomingEvents[0].startAt) : '6:00 PM at the pavilion'}</p>
              <Link to="/app/events">See potluck list</Link>
            </article>
          </div>

          <div className="hk-section-headline">
            <h3>Latest Activity</h3>
          </div>
          <div className="hk-activity-list">
            {latestActivity.length ? latestActivity.map((post) => (
              <article key={post.id} className="hk-activity-item">
                <div>
                  <strong>{post.authorName} shared a new post</strong>
                  <p>{stripMentionTokens(post.body ?? '').slice(0, 85) || 'Family bulletin update'}</p>
                </div>
                <span>{relativeTime(post.createdAt)}</span>
              </article>
            )) : (
              <article className="hk-activity-item">
                <div>
                  <strong>No recent updates yet</strong>
                  <p>Posts and uploads will appear here as your family starts sharing.</p>
                </div>
              </article>
            )}
          </div>
        </div>

        <aside className="hk-dashboard-side">
          <article className="hk-checklist-card">
            <h3>Preparation Guide</h3>
            <ul>
              <li>Update profile info</li>
              <li>Confirm RSVP</li>
              <li>Book lodging</li>
              <li>Sign up for potluck</li>
            </ul>
          </article>

          <article className="hk-committee-card">
            <h3>Planning Committee</h3>
            <div className="hk-avatars-row">
              {planningMembers.length ? planningMembers.map((name) => (
                <span key={name} className="hk-avatar-chip" title={name}>{name.slice(0, 1).toUpperCase()}</span>
              )) : (
                <span className="helper-text">No committee activity yet</span>
              )}
            </div>
          </article>
        </aside>
      </div>
      <div className="stats-grid hk-dashboard-stats">
        <StatCard title="Upcoming events" value={String(events.length)} detail="Schedule items available to approved members." />
        <StatCard title="Hotel blocks" value={String(hotels.length)} detail="Informational stays with deadline and booking links." />
        <StatCard title="Bulletin posts" value={String(posts.length)} detail="Announcements and discussions shared with the family." />
        <StatCard title="Shared files" value={String(assets.length)} detail="Images and PDFs stored in Firebase Storage." />
      </div>

      {latestPost ? (
        <article className="hk-dashboard-footer-note">
          <strong>Latest bulletin by {latestPost.authorName}:</strong> {latestPostSnippet}
        </article>
      ) : null}
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

const mutationError = (
  err: unknown,
  {
    action,
    subject,
    requiresOrganizer = false,
  }: {
    action: 'save' | 'publish' | 'update' | 'delete' | 'upload' | 'send' | 'open' | 'start';
    subject: string;
    requiresOrganizer?: boolean;
  },
): string => {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: string }).code)
      : '';

  if (code === 'permission-denied') {
    if (requiresOrganizer) {
      return `You do not have permission to ${action} ${subject}. Only organizers and admins can do this.`;
    }
    return `You do not have permission to ${action} ${subject}.`;
  }

  if (code === 'unavailable') {
    return `Could not ${action} ${subject} right now. Check your connection and try again.`;
  }

  return err instanceof Error ? err.message : `Could not ${action} ${subject}.`;
};

const ProfilePage = () => {
  const { profile, user, isDemoMode } = useAuth();
  const { notify } = useNotification();
  const [imageUploading, setImageUploading] = useState(false);
  const [form, setForm] = useState({
    displayName: profile?.displayName ?? user?.displayName ?? '',
    phone: profile?.phone ?? user?.phoneNumber ?? '',
    city: profile?.city ?? '',
    bio: profile?.bio ?? '',
  });
  const uid = profile?.uid ?? '';
  const initialPhoto = profile?.photoURL || user?.photoURL || null;
  const [profilePhoto, setProfilePhoto] = useState<string | null>(initialPhoto);

  useEffect(() => {
    setProfilePhoto(initialPhoto);
  }, [initialPhoto, uid]);

  const tryPushDirectory = useCallback(async () => {
    if (isDemoMode) {
      return;
    }
    try {
      const token = await user?.getIdToken();
      if (!token) return;
      await requestSyncMyDirectory(token);
    } catch {
      /* e.g. /api not wired locally — profile still saved in Firestore */
    }
  }, [isDemoMode, user]);

  const handleProfilePhotoError = useCallback(() => {
    if (user?.photoURL && profilePhoto !== user.photoURL) {
      setProfilePhoto(user.photoURL);
      return;
    }
    setProfilePhoto(null);
  }, [user?.photoURL, profilePhoto]);

  if (!profile || !user) {
    return null;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await updateProfileFields(profile.uid, {
        displayName: form.displayName.trim() || user.displayName || profile.displayName,
        phone: form.phone.trim(),
        city: form.city.trim(),
        bio: form.bio.trim(),
      });
      await tryPushDirectory();
      notify('Profile saved.', 'saved');
    } catch (err) {
      notify(mutationError(err, { action: 'save', subject: 'profile' }), 'error');
    }
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
      await tryPushDirectory();
      notify('Profile photo saved.', 'updated');
    } catch (err) {
      notify(profileImageUploadError(err), 'error');
    } finally {
      setImageUploading(false);
      input.value = '';
    }
  };

  const firstName = (profile.displayName || user.displayName || 'Family').split(' ')[0];
  const createdAt = user.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString()
    : 'Google account';
  const lastSignInAt = user.metadata?.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleString()
    : 'Unavailable';
  const emailVerified = typeof user.emailVerified === 'boolean' ? user.emailVerified : true;

  return (
    <section className="page-section hk-unified-page hk-profile-page">
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
              <img
                alt={profile.displayName}
                className="profile-avatar"
                src={profilePhoto}
                onError={handleProfilePhotoError}
              />
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
              <img
                alt={profile.displayName}
                className="profile-avatar profile-avatar-large"
                src={profilePhoto}
                onError={handleProfilePhotoError}
              />
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
    <section className="page-section hk-unified-page hk-registration-page">
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
    if (!canManage) {
      notify('Only organizers and admins can publish events.', 'error');
      return;
    }

    try {
      const id = await createEvent({
        ...form,
        startAt: form.startAt,
        endAt: form.endAt,
        visibility: 'members',
        createdBy: profile.uid,
      } as Omit<EventItem, 'id'>);

      if (!id) {
        notify('Firebase is not configured. Add your Firebase environment variables and try again.', 'error');
        return;
      }

      await logAuditEvent(profile.uid, profile.displayName, 'create', 'event', id, form.title);
      setForm({ title: '', description: '', venue: '', startAt: '', endAt: '' });
      notify('Event published.', 'saved');
    } catch (err) {
      notify(mutationError(err, { action: 'publish', subject: 'event', requiresOrganizer: true }), 'error');
    }
  };

  return (
    <section className="page-section hk-events-page">
      <article className="hk-events-hero">
        <p className="eyebrow">Our Itinerary</p>
        <h1>Weekend Events</h1>
        <p>Gathering points, meals, and celebrations are listed below so everyone can stay coordinated.</p>
      </article>

      <div className="hk-events-layout">
        <Card className="hk-events-stream">
          <SectionHeader title="Published itinerary" meta={`${events.length} items`} />
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

        <Card accent="warm" className="hk-events-editor">
          <SectionHeader title="Schedule editor" meta={canManage ? 'Organizer or admin' : 'Read-only'} />
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
    if (!canManage) {
      notify('Only organizers and admins can save hotel details.', 'error');
      return;
    }
    try {
      const id = await createHotel({ ...form, createdBy: profile.uid } as Omit<Hotel, 'id'>);
      if (!id) {
        notify('Firebase is not configured. Add your Firebase environment variables and try again.', 'error');
        return;
      }

      await logAuditEvent(profile.uid, profile.displayName, 'create', 'hotel', id, form.name);
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
    } catch (err) {
      notify(mutationError(err, { action: 'save', subject: 'hotel details', requiresOrganizer: true }), 'error');
    }
  };

  return (
    <section className="page-section hk-hotels-page">
      <article className="hk-hotels-hero">
        <p className="eyebrow">Where to Stay</p>
        <h1>The Riverside Inn and Suites</h1>
        <p>Use the family room block where available and keep all booking details centralized for arrivals.</p>
      </article>

      <div className="hk-hotels-layout">
        <Card className="hk-hotels-list">
          <SectionHeader title="Family hotel options" meta="Outbound booking links" />
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

        <Card accent="cool" className="hk-hotels-editor">
          <SectionHeader title="Lodging manager" meta={canManage ? 'Organizer or admin' : 'Read-only'} />
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
    try {
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
      if (!id) {
        notify('Firebase is not configured. Add your Firebase environment variables and try again.', 'error');
        return;
      }

      await logAuditEvent(
        profile.uid,
        profile.displayName,
        'create',
        'flight',
        id,
        `${form.airline} ${form.flightNumber}`,
      );
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
    } catch (err) {
      notify(mutationError(err, { action: 'save', subject: 'flight' }), 'error');
    }
  };

  return (
    <section className="page-section hk-unified-page hk-flights-page">
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
    try {
      if (!canEdit) {
        notify('Only organizers and admins can update flights.', 'error');
        return;
      }
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
    } catch (err) {
      notify(mutationError(err, { action: 'update', subject: 'flight', requiresOrganizer: true }), 'error');
    }
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete "${flightLabel}"? This cannot be undone.`)) return;
    try {
      if (!canEdit) {
        notify('Only organizers and admins can delete flights.', 'error');
        return;
      }
      await deleteFlight(flight.id);
      await logAuditEvent(ownerUid, ownerName, 'delete', 'flight', flight.id, flightLabel);
      notify('Flight removed.', 'deleted');
    } catch (err) {
      notify(mutationError(err, { action: 'delete', subject: 'flight', requiresOrganizer: true }), 'error');
    }
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
  const [assetPreview, setAssetPreview] = useState<AssetRecord | null>(null);
  const [quickDmMember, setQuickDmMember] = useState<DirectoryMember | null>(null);
  const [quickDmText, setQuickDmText] = useState('');
  const [quickDmSending, setQuickDmSending] = useState(false);

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

  const mentionableDocs = assets.filter((asset) => asset.ownerUid === profile.uid && asset.kind === 'document');

  const openQuickDm = (memberUid: string, displayName: string) => {
    const found = directory.find((m) => m.uid === memberUid);
    const target: DirectoryMember = found
      ? found
      : {
          uid: memberUid,
          id: memberUid,
          displayName: displayName || memberUid,
          email: '',
          photoURL: null,
          role: 'member',
          groupId: null,
        };

    setQuickDmMember(target);
    setQuickDmText('');
  };

  const submitQuickDm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quickDmMember || !quickDmText.trim()) {
      return;
    }

    setQuickDmSending(true);
    try {
      const threadId = await createOrGetDirectThread(selfDirectoryEntry, quickDmMember);
      const participantIds = [selfDirectoryEntry.uid, quickDmMember.uid].sort();
      const participantNames = [selfDirectoryEntry.displayName, quickDmMember.displayName].sort();

      await sendThreadMessage(
        threadId,
        {
          authorUid: selfDirectoryEntry.uid,
          authorName: selfDirectoryEntry.displayName,
          body: quickDmText.trim(),
        },
        participantIds,
        participantNames,
      );

      setQuickDmMember(null);
      setQuickDmText('');
    } catch (err) {
      notify(mutationError(err, { action: 'send', subject: 'message' }), 'error');
    } finally {
      setQuickDmSending(false);
    }
  };

  const appendMention = (token: string, setValue: (value: string) => void, current: string) => {
    setValue(`${current.trimEnd()} ${token}`.trim());
  };

  const submitPost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newPost.trim()) {
      return;
    }

    try {
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
    } catch (err) {
      notify(mutationError(err, { action: 'publish', subject: 'post' }), 'error');
    }
  };

  const submitComment = async (event: FormEvent<HTMLFormElement>, post: BulletinPost) => {
    event.preventDefault();
    const body = newComments[post.id]?.trim();
    if (!body) {
      return;
    }

    try {
      await addBulletinComment({
        postId: post.id,
        authorUid: profile.uid,
        authorName: profile.displayName,
        body,
      });

      setNewComments((current) => ({ ...current, [post.id]: '' }));
    } catch (err) {
      notify(mutationError(err, { action: 'publish', subject: 'comment' }), 'error');
    }
  };

  const startEditing = (post: BulletinPost) => {
    setEditingPostId(post.id);
    setEditingBody(post.body);
    setEditingImage(null);
  };

  const saveEdit = async (post: BulletinPost) => {
    try {
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
    } catch (err) {
      notify(mutationError(err, { action: 'update', subject: 'post' }), 'error');
    }
  };

  const deletePost = async (post: BulletinPost) => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    try {
      if (post.attachmentPath) {
        await deleteStorageFile(post.attachmentPath);
      }
      await deleteBulletinPost(post.id);
      await logAuditEvent(profile.uid, profile.displayName, 'delete', 'bulletin_post', post.id, 'Post');
      setEditingPostId(null);
      notify('Post removed.', 'deleted');
    } catch (err) {
      notify(mutationError(err, { action: 'delete', subject: 'post' }), 'error');
    }
  };

  const removePostImage = async (post: BulletinPost) => {
    try {
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
    } catch (err) {
      notify(mutationError(err, { action: 'update', subject: 'post image' }), 'error');
    }
  };

  const getTrailingMentionQuery = (text: string) => {
    const idx = text.lastIndexOf('@');
    if (idx < 0) return null;
    // Require a word boundary before '@' (start or whitespace)
    if (idx > 0 && !/\s/.test(text[idx - 1] ?? '')) return null;
    const query = text.slice(idx + 1).trim();
    if (!query) return null;
    return { startIndex: idx, query };
  };

  return (
    <>
      <section className="page-section hk-unified-page hk-bulletin-page">
      <SectionIntro eyebrow="Bulletin" title="Announcements and family discussion" body="Use the shared board for reminders, updates, and collaborative planning instead of fragmented chats." />
      <div className="content-grid two-up">
        <Card accent="warm">
          <SectionHeader title="New post" meta="Visible to approved members" />
          <form className="form-grid" onSubmit={submitPost}>
            <label className="full-span">
              Message
              <div className="relationship-combobox">
                <textarea value={newPost} onChange={(event) => setNewPost(event.target.value)} rows={5} />
                {(() => {
                  const mention = getTrailingMentionQuery(newPost);
                  if (!mention) return null;
                  const q = mention.query.toLowerCase();
                  const filteredMembers = directory
                    .filter((m) => m.uid !== profile?.uid)
                    .filter((m) => (m.displayName ?? '').toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q));

                  const filteredDocs = mentionableDocs
                    .filter((d) => (d.fileName ?? '').toLowerCase().includes(q))
                    .slice(0, 6);

                  const combined = [
                    ...filteredMembers.slice(0, 6).map((m) => ({ kind: 'member' as const, uid: m.uid, label: m.displayName })),
                    ...filteredDocs.map((d) => ({ kind: 'doc' as const, uid: d.id, label: d.fileName })),
                  ];

                  if (combined.length === 0) return null;

                  return (
                    <ul className="relationship-combobox-list" role="listbox" aria-label="Mention suggestions">
                      {combined.map((item) => {
                        const token =
                          item.kind === 'member'
                            ? mentionToken({ type: 'user', id: item.uid, label: item.label })
                            : mentionToken({ type: 'asset', id: item.uid, label: item.label });

                        return (
                          <li
                            key={`${item.kind}:${item.uid}`}
                            role="option"
                            className="relationship-combobox-option"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setNewPost((current) => `${current.slice(0, mention.startIndex)}${token} `);
                            }}
                          >
                            {item.kind === 'member' ? item.label : `${item.label}`}
                          </li>
                        );
                      })}
                    </ul>
                  );
                })()}
              </div>
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
                          segment.mentionType === 'user' && segment.mentionId ? (
                            <button
                              type="button"
                              className={`inline-mention mention-${segment.mentionType}`}
                              key={`${segment.value}-${index}`}
                              onClick={() => openQuickDm(segment.mentionId!, segment.value)}
                            >
                              @{segment.value}
                            </button>
                          ) : segment.mentionType === 'asset' && segment.mentionId ? (
                            (() => {
                              const asset = assets.find((a) => a.id === segment.mentionId);
                              return asset ? (
                                <a
                                  href={asset.downloadUrl}
                                  className="inline-mention mention-asset"
                                  key={`${segment.value}-${index}`}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setAssetPreview(asset);
                                  }}
                                >
                                  @{segment.value}
                                </a>
                              ) : (
                                <span className="inline-mention mention-asset" key={`${segment.value}-${index}`}>
                                  @{segment.value}
                                </span>
                              );
                            })()
                          ) : (
                            <span className={`inline-mention mention-${segment.mentionType}`} key={`${segment.value}-${index}`}>
                              @{segment.value}
                            </span>
                          )
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
                        <p>
                          {parseMentionSegments(comment.body).map((segment, index) =>
                            segment.type === 'mention' ? (
                              segment.mentionType === 'user' && segment.mentionId ? (
                                <button
                                  type="button"
                                  className={`inline-mention mention-${segment.mentionType ?? 'user'}`}
                                  key={`${comment.id}-${index}`}
                                  onClick={() => openQuickDm(segment.mentionId!, segment.value)}
                                >
                                  @{segment.value}
                                </button>
                              ) : segment.mentionType === 'asset' && segment.mentionId ? (
                                (() => {
                                  const asset = assets.find((a) => a.id === segment.mentionId);
                                  return asset ? (
                                    <a
                                      href={asset.downloadUrl}
                                      className="inline-mention mention-asset"
                                      key={`${comment.id}-${index}`}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        setAssetPreview(asset);
                                      }}
                                    >
                                      @{segment.value}
                                    </a>
                                  ) : (
                                    <span className="inline-mention mention-asset" key={`${comment.id}-${index}`}>
                                      @{segment.value}
                                    </span>
                                  );
                                })()
                              ) : (
                                <span className={`inline-mention mention-${segment.mentionType ?? 'user'}`} key={`${comment.id}-${index}`}>
                                  @{segment.value}
                                </span>
                              )
                            ) : (
                              <span key={`${comment.id}-${index}`}>{segment.value}</span>
                            ),
                          )}
                        </p>
                      </div>
                    ))}
                </div>
                <form className="inline-comment-form" onSubmit={(event) => void submitComment(event, post)}>
                  <div className="relationship-combobox">
                    <input
                      value={newComments[post.id] ?? ''}
                      onChange={(event) => setNewComments((current) => ({ ...current, [post.id]: event.target.value }))}
                      placeholder="Add a comment"
                    />
                    {(() => {
                      const value = newComments[post.id] ?? '';
                      const mention = getTrailingMentionQuery(value);
                      if (!mention) return null;
                      const q = mention.query.toLowerCase();
                      const filteredMembers = directory
                        .filter((m) => m.uid !== profile?.uid)
                        .filter((m) => (m.displayName ?? '').toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q));

                      const filteredDocs = mentionableDocs
                        .filter((d) => (d.fileName ?? '').toLowerCase().includes(q))
                        .slice(0, 6);

                      const combined = [
                        ...filteredMembers.slice(0, 6).map((m) => ({ kind: 'member' as const, uid: m.uid, label: m.displayName })),
                        ...filteredDocs.map((d) => ({ kind: 'doc' as const, uid: d.id, label: d.fileName })),
                      ];

                      if (combined.length === 0) return null;

                      return (
                        <ul className="relationship-combobox-list" role="listbox" aria-label="Mention suggestions">
                          {combined.map((item) => {
                            const token =
                              item.kind === 'member'
                                ? mentionToken({ type: 'user', id: item.uid, label: item.label })
                                : mentionToken({ type: 'asset', id: item.uid, label: item.label });
                            return (
                              <li
                                key={`${item.kind}:${item.uid}`}
                                role="option"
                                className="relationship-combobox-option"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setNewComments((current) => {
                                    const currentText = current[post.id] ?? '';
                                    const nextText = `${currentText.slice(0, mention.startIndex)}${token} `;
                                    return { ...current, [post.id]: nextText };
                                  });
                                }}
                              >
                                {item.kind === 'member' ? item.label : `${item.label}`}
                              </li>
                            );
                          })}
                        </ul>
                      );
                    })()}
                  </div>
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
    <AssetPreviewModal asset={assetPreview} onClose={() => setAssetPreview(null)} />
    <QuickMessageModal
      member={quickDmMember}
      text={quickDmText}
      sending={quickDmSending}
      onTextChange={setQuickDmText}
      onSubmit={submitQuickDm}
      onClose={() => {
        setQuickDmMember(null);
        setQuickDmText('');
      }}
    />
    </>
  );
};

const participantKeyFor = (ids: string[]) => [...ids].sort().join('__');

const MessagesPage = () => {
  const { profile } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const { threadId: threadIdParam } = useParams<{ threadId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const withUid = searchParams.get('with');
  const { data: directory } = useDirectory();
  const { data: threads } = useThreads(profile?.uid ?? '');
  const selectedThreadId = threadIdParam ?? null;
  const [pendingThreadMember, setPendingThreadMember] = useState<DirectoryMember | null>(null);
  const [messageText, setMessageText] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const deferredSearch = useDeferredValue(memberSearch);

  const virtualThread: Thread | null =
    selectedThreadId && pendingThreadMember && profile
      ? {
          id: selectedThreadId,
          participantIds: [profile.uid, pendingThreadMember.uid].sort(),
          participantKey: participantKeyFor([profile.uid, pendingThreadMember.uid]),
          participantNames: [profile.displayName ?? '', pendingThreadMember.displayName ?? ''].sort(),
        }
      : null;
  const selectedThread: Thread | null =
    threads.find((t) => t.id === selectedThreadId) ?? virtualThread ?? null;
  const { data: messages } = useThreadMessages(selectedThread?.id ?? null);

  useEffect(() => {
    if (selectedThreadId && threads.some((t) => t.id === selectedThreadId)) {
      // Avoid synchronous setState directly inside an effect to satisfy lint rules.
      void Promise.resolve().then(() => setPendingThreadMember(null));
    }
  }, [selectedThreadId, threads]);

  const withHandledRef = useRef(false);
  const lastWithUidRef = useRef<string | null>(null);
  useEffect(() => {
    if (!withUid || !profile) return;
    if (lastWithUidRef.current !== withUid) {
      lastWithUidRef.current = withUid;
      withHandledRef.current = false;
    }
    if (withHandledRef.current) return;
    const member = directory.find((m) => m.uid === withUid);
    if (!member || member.uid === profile.uid) {
      setSearchParams((prev: URLSearchParams) => {
        const next = new URLSearchParams(prev);
        next.delete('with');
        return next;
      }, { replace: true });
      withHandledRef.current = true;
      return;
    }
    withHandledRef.current = true;
    const self: DirectoryMember = {
      uid: profile.uid,
      id: profile.uid,
      displayName: profile.displayName,
      email: profile.email,
      photoURL: profile.photoURL,
      role: profile.role,
      groupId: profile.groupId ?? null,
    };
    // Avoid synchronous setState directly inside an effect to satisfy lint rules.
    void Promise.resolve().then(() => setPendingThreadMember(member));
    createOrGetDirectThread(self, member)
      .then((threadId) => {
        setSearchParams((prev: URLSearchParams) => {
          const next = new URLSearchParams(prev);
          next.delete('with');
          return next;
        }, { replace: true });
        navigate(`/app/messages/${threadId}`, { replace: true });
      })
      .catch((err) => {
        notify(mutationError(err, { action: 'open', subject: 'conversation' }), 'error');
        setPendingThreadMember(null);
        withHandledRef.current = false;
        setSearchParams((prev: URLSearchParams) => {
          const next = new URLSearchParams(prev);
          next.delete('with');
          return next;
        }, { replace: true });
      });
  }, [withUid, profile, directory, navigate, setSearchParams, notify]);

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
    setPendingThreadMember(member);
    try {
      const threadId = await createOrGetDirectThread(selfDirectoryEntry, member);
      navigate(`/app/messages/${threadId}`);
    } catch (err) {
      const message = mutationError(err, { action: 'start', subject: 'conversation' });
      notify(message, 'error');
      setPendingThreadMember(null);
    }
  };

  const selectThread = (threadId: string) => {
    setPendingThreadMember(null);
    navigate(`/app/messages/${threadId}`);
  };

  const backToList = () => {
    setPendingThreadMember(null);
    navigate('/app/messages');
  };

  const onSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedThread || !messageText.trim()) {
      return;
    }
    try {
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
    } catch (err) {
      const message = mutationError(err, { action: 'send', subject: 'message' });
      notify(message, 'error');
    }
  };

  const conversationTitle =
    selectedThread?.participantNames.filter((n) => n !== profile.displayName).join(', ') || 'Conversation';

  return (
    <section className="page-section messages-page hk-unified-page hk-messages-page">
      <SectionIntro eyebrow="Messages" title="Direct coordination threads" body="Use direct messages for side conversations that should not live on the public bulletin board." />
      <div className={`messages-layout ${selectedThreadId ? 'conversation-open' : ''}`}>
        <Card className="messages-panel-start">
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

        <Card className="messages-panel-threads">
          <SectionHeader title="Your threads" meta={`${threads.length} active`} />
          <div className="list-stack compact">
            {threads.length === 0 ? (
              <p className="helper-text">No conversations yet. Start one by choosing a member on the left.</p>
            ) : (
              threads.map((thread) => (
                <button
                  className={`thread-card ${selectedThread?.id === thread.id ? 'selected' : ''}`}
                  key={thread.id}
                  onClick={() => selectThread(thread.id)}
                >
                  <strong>{thread.participantNames.filter((name) => name !== profile.displayName).join(', ') || 'Your thread'}</strong>
                  <p>{thread.lastMessageText ?? 'No messages yet'}</p>
                </button>
              ))
            )}
          </div>
        </Card>

        <Card accent="cool" className="messages-panel-conversation">
          <div className="messages-conversation-header">
            <button type="button" className="messages-back-button ghost-button" onClick={backToList} aria-label="Back to conversations">
              Back
            </button>
            <SectionHeader title={selectedThread ? conversationTitle : 'Select a thread'} meta={selectedThread ? relativeTime(selectedThread.updatedAt) : 'No thread selected'} />
          </div>
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

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const kind = isPdf ? 'document' : 'image';
    try {
      const id = await uploadAsset({ file, kind, ownerUid: profile.uid, ownerName: profile.displayName });
      if (id) await logAuditEvent(profile.uid, profile.displayName, 'create', 'asset', id, file.name);
      notify('File uploaded.', 'saved');
    } catch (err) {
      notify(mutationError(err, { action: 'upload', subject: 'file' }), 'error');
    } finally {
      event.currentTarget.value = '';
    }
  };

  const onDeleteAsset = async (asset: AssetRecord) => {
    if (!window.confirm(`Delete "${asset.fileName}"? This cannot be undone.`)) return;
    try {
      if (!(profile?.role === 'admin' || profile?.role === 'organizer')) {
        notify('Only organizers and admins can delete files.', 'error');
        return;
      }
      await deleteAsset(asset);
      await logAuditEvent(profile.uid, profile.displayName, 'delete', 'asset', asset.id, asset.fileName);
      notify('File removed.', 'deleted');
    } catch (err) {
      notify(mutationError(err, { action: 'delete', subject: 'file', requiresOrganizer: true }), 'error');
    }
  };

  const imageAssets = assets.filter((asset) => asset.kind === 'image');
  const documentAssets = assets.filter((asset) => asset.kind === 'document');

  return (
    <section className="page-section hk-gallery-page">
      <header className="hk-gallery-intro">
        <h1>Family Gallery</h1>
        <p>A digital heirloom of our shared journey. Explore the faces and places that define the family legacy.</p>
      </header>

      <Card className="hk-gallery-grid-card">
        <SectionHeader title="Recent highlights" meta={`${imageAssets.length} photos`} />
        <div className="hk-gallery-grid">
          {imageAssets.slice(0, 6).map((asset) => (
            <a key={asset.id} className="hk-gallery-tile" href={asset.downloadUrl} target="_blank" rel="noreferrer">
              <img src={asset.downloadUrl} alt={asset.fileName} loading="lazy" />
              <span>{asset.fileName}</span>
            </a>
          ))}
        </div>
      </Card>

      <Card className="hk-files-row-card" accent="warm">
        <SectionHeader title="Shared files and documents" meta={`${documentAssets.length} documents`} />
        <div className="hk-files-toolbar">
          <label className="upload-card hk-upload-inline">
            <span>Upload document or photo</span>
            <input accept="image/*,application/pdf" onChange={(event) => void onFileChange(event)} type="file" />
          </label>
        </div>
        <div className="list-stack">
          {documentAssets.map((asset) => (
            <article className="list-item hk-file-row" key={asset.id}>
              <div>
                <strong>{asset.fileName}</strong>
                <p>
                  {asset.ownerName} · {formatFileSize(asset.size)}
                </p>
              </div>
              <div className="timeline-meta stack-row">
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
  uid: string;
  label: string;
  initials: string;
  photoURL?: string | null;
  isCenter?: boolean;
};

function FamilyTreeNode({ data }: NodeProps<FlowNode<FamilyTreeNodeData>>) {
  const [imgFailed, setImgFailed] = useState(false);
  const [resolvedPhotoUrl, setResolvedPhotoUrl] = useState<string | null>(data?.photoURL ?? null);
  const photoUrl = data?.photoURL ?? null;
  const name = data?.label ?? '';
  const initials = data?.initials ?? '?';
  const isCenter = data?.isCenter ?? false;
  const showPhoto = Boolean(resolvedPhotoUrl && typeof resolvedPhotoUrl === 'string' && resolvedPhotoUrl.trim() && !imgFailed);

  useEffect(() => {
    queueMicrotask(() => {
      setResolvedPhotoUrl(photoUrl);
      setImgFailed(false);
    });
  }, [photoUrl, data?.uid]);

  const handlePhotoError = () => {
    setImgFailed(true);
  };
  return (
    <div className={`family-tree-flow-node ${isCenter ? 'family-tree-flow-node-center' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="family-tree-flow-node-body">
        <div
          className={`family-tree-flow-node-avatar ${showPhoto ? 'family-tree-flow-node-avatar-photo' : 'family-tree-flow-node-avatar-placeholder'}`}
        >
          {showPhoto ? (
            <img
              src={resolvedPhotoUrl!}
              alt=""
              aria-hidden
              onError={handlePhotoError}
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

function FamilyTreeEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<FlowEdge>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition: sourcePosition ?? Position.Bottom,
    targetX,
    targetY,
    targetPosition: targetPosition ?? Position.Top,
    borderRadius: 0,
  });
  const label = (data?.label as string) ?? '';
  return (
    <>
      <BaseEdge id={id} path={edgePath} className="family-tree-flow-edge-path" />
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

type FamilyTreePerson = {
  id: string;
  displayName: string;
  photoURL?: string | null;
  source: 'directory' | 'manual';
  linkedUserUid?: string | null;
  isDeceased?: boolean;
  birthYear?: string | null;
  deathYear?: string | null;
};

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
  const { data: familyPeople } = useFamilyPeople();
  const { data: relationships } = useFamilyRelationships();
  const myUid = profile?.uid ?? '';
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
  const [addForm, setAddForm] = useState<{ toPersonId: string; relationshipType: RelationshipType }>({ toPersonId: '', relationshipType: 'parent' });
  const [manualForm, setManualForm] = useState<{
    displayName: string;
    birthYear: string;
    deathYear: string;
    relationshipType: RelationshipType;
    isDeceased: boolean;
  }>({
    displayName: '',
    birthYear: '',
    deathYear: '',
    relationshipType: 'parent',
    isDeceased: true,
  });
  const [manualPhotoFile, setManualPhotoFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<RelationshipType | null>(null);

  const allPeople = useMemo<FamilyTreePerson[]>(() => {
    const items = new Map<string, FamilyTreePerson>();

    for (const member of directory) {
      items.set(member.uid, {
        id: member.uid,
        displayName: member.displayName,
        photoURL: member.photoURL ?? null,
        source: 'directory',
        linkedUserUid: member.uid,
      });
    }

    if (profile && !items.has(profile.uid)) {
      items.set(profile.uid, {
        id: profile.uid,
        displayName: profile.displayName ?? 'You',
        photoURL: profile.photoURL ?? null,
        source: 'directory',
        linkedUserUid: profile.uid,
      });
    }

    for (const person of familyPeople) {
      items.set(person.id, {
        id: person.id,
        displayName: person.displayName,
        photoURL: person.photoURL ?? null,
        source: 'manual',
        linkedUserUid: person.linkedUserUid ?? null,
        isDeceased: person.isDeceased ?? false,
        birthYear: person.birthYear ?? null,
        deathYear: person.deathYear ?? null,
      });
    }

    return Array.from(items.values()).sort((left, right) => left.displayName.localeCompare(right.displayName));
  }, [directory, familyPeople, profile]);

  const peopleById = useMemo(() => new Map(allPeople.map((person) => [person.id, person])), [allPeople]);

  /** Members you don't already have any relationship edge with (either direction). */
  const peopleRelatedToMe = useMemo(() => {
    const s = new Set<string>();
    const me = myUid;
    if (!me) return s;
    for (const r of relationships) {
      if (r.fromUid === me) s.add(r.toUid);
      if (r.toUid === me) s.add(r.fromUid);
    }
    return s;
  }, [myUid, relationships]);

  const peopleSelectableForNewRel = useMemo(
    () => allPeople.filter((person) => person.id !== myUid && !peopleRelatedToMe.has(person.id)),
    [allPeople, myUid, peopleRelatedToMe],
  );
  const addToPersonId = addForm.toPersonId && !peopleRelatedToMe.has(addForm.toPersonId) ? addForm.toPersonId : '';
  const myRelationshipIds = useMemo(
    () =>
      new Set(
        relationships.flatMap((r) =>
          r.fromUid === myUid || r.toUid === myUid ? [r.id] : [],
        ),
      ),
    [myUid, relationships],
  );
  const myRelationships = useMemo(
    () => relationships.filter((r) => myRelationshipIds.has(r.id)),
    [relationships, myRelationshipIds],
  );
  const canEditRel = (r: FamilyRelationship) =>
    r.createdBy === profile?.uid || profile?.role === 'admin';

  const onSubmitAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || !addToPersonId) return;
    const id = await createRelationship({
      fromUid: profile.uid,
      toUid: addToPersonId,
      relationshipType: addForm.relationshipType,
      createdBy: profile.uid,
    });
    if (id) {
      await logAuditEvent(profile.uid, profile.displayName, 'create', 'family_relationship', id, addForm.relationshipType);
      notify('Relationship added.', 'saved');
      setAddForm({ toPersonId: '', relationshipType: 'parent' });
    }
  };

  const onSubmitManualMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    const displayName = manualForm.displayName.trim();
    if (!displayName) {
      notify('Please enter a family member name.', 'error');
      return;
    }

    const personId = await createFamilyPerson({
      linkedUserUid: null,
      displayName,
      photoURL: null,
      birthYear: manualForm.birthYear.trim() || null,
      deathYear: manualForm.isDeceased ? manualForm.deathYear.trim() || null : null,
      isDeceased: manualForm.isDeceased,
      createdBy: profile.uid,
    });

    if (!personId) {
      notify('Could not create family member.', 'error');
      return;
    }

    if (manualPhotoFile) {
      await uploadFamilyPersonPhoto(personId, manualPhotoFile);
    }

    const relationshipId = await createRelationship({
      fromUid: profile.uid,
      toUid: personId,
      relationshipType: manualForm.relationshipType,
      createdBy: profile.uid,
    });

    await logAuditEvent(profile.uid, profile.displayName, 'create', 'family_person', personId, displayName);
    if (relationshipId) {
      await logAuditEvent(
        profile.uid,
        profile.displayName,
        'create',
        'family_relationship',
        relationshipId,
        manualForm.relationshipType,
      );
    }

    notify('Family member added to the tree.', 'saved');
    setManualForm({
      displayName: '',
      birthYear: '',
      deathYear: '',
      relationshipType: 'parent',
      isDeceased: true,
    });
    setManualPhotoFile(null);
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

  const personById = (personId: string) => peopleById.get(personId);
  const labelForRel = (r: FamilyRelationship) => {
    const from =
      r.fromUid === myUid
        ? (profile?.displayName ?? 'You')
        : (personById(r.fromUid)?.displayName ?? r.fromUid);
    const to =
      r.toUid === myUid
        ? (profile?.displayName ?? 'You')
        : (personById(r.toUid)?.displayName ?? r.toUid);
    return `${from} → ${to} (${r.relationshipType})`;
  };

  const nodeIdsMy = useMemo(() => {
    const uid = myUid;
    const set = new Set<string>(uid ? [uid] : []);
    relationships.forEach((r) => {
      if (r.fromUid === uid || r.toUid === uid) {
        set.add(r.fromUid);
        set.add(r.toUid);
      }
    });
    return Array.from(set);
  }, [myUid, relationships]);

  const nodeIdsFull = useMemo(() => {
    const ids = new Set(allPeople.map((person) => person.id));
    relationships.forEach((relationship) => {
      ids.add(relationship.fromUid);
      ids.add(relationship.toUid);
    });
    if (myUid) ids.add(myUid);
    return Array.from(ids);
  }, [allPeople, myUid, relationships]);
  const edgesMy = useMemo(
    () => relationships.filter((r) => nodeIdsMy.includes(r.fromUid) && nodeIdsMy.includes(r.toUid)),
    [relationships, nodeIdsMy],
  );
  const edgesFull = relationships;

  const nodesMy = useMemo(() => {
    const people: FamilyTreePerson[] = [];
    for (const personId of nodeIdsMy) {
      const person = peopleById.get(personId);
      if (person) {
        people.push(person);
      }
    }
    return people;
  }, [nodeIdsMy, peopleById]);
  const nodesFull = useMemo(() => {
    const people: FamilyTreePerson[] = [];
    for (const personId of nodeIdsFull) {
      const person = peopleById.get(personId);
      if (person) {
        people.push(person);
      }
    }
    return people;
  }, [nodeIdsFull, peopleById]);
  const centerUid = viewMode === 'my' ? myUid || null : null;
  const nodes = viewMode === 'my' ? nodesMy : nodesFull;
  const edges = viewMode === 'my' ? edgesMy : edgesFull;

  const graphWidth = 1100;
  const graphHeight = 600;
  const centerX = graphWidth / 2;
  const centerY = graphHeight / 2;
  const radius = Math.min(graphWidth, graphHeight) * 0.38;
  const nodePositions = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
    const list = viewMode === 'my' ? nodeIdsMy : nodeIdsFull;
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
  }, [viewMode, centerUid, nodeIdsMy, nodeIdsFull, centerX, centerY, radius]);

  const flowNodes: FlowNode[] = useMemo(() => {
    return nodes
      .filter((person) => nodePositions[person.id])
      .map((person) => ({
        id: person.id,
        type: 'familyMember',
        position: nodePositions[person.id] ?? { x: 0, y: 0 },
        data: {
          uid: person.id,
          label: `${person.displayName}${person.isDeceased ? ' †' : ''}`,
          initials: getSingleInitial(person.displayName),
          photoURL: person.photoURL ?? null,
          isCenter: person.id === centerUid,
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
    <section className="page-section hk-unified-page hk-familytree-page">
      <SectionIntro
        eyebrow="Family tree"
        title="Relationships and connections"
        body="Add relationships to portal members and manually add relatives who do not have accounts. Your view starts with you at the center; the full tree shows both registered and offline family members."
      />
      <div className="content-grid two-up">
        <Card accent="warm">
          <SectionHeader title="Add relationship" meta="You and another person on the tree" />
          <form className="form-grid" onSubmit={onSubmitAdd}>
            <label>
              Family person
              <select
                value={addToPersonId}
                onChange={(e) => setAddForm((f) => ({ ...f, toPersonId: e.target.value }))}
                aria-label="Select family member"
                disabled={peopleSelectableForNewRel.length === 0}
              >
                <option value="">
                  {peopleSelectableForNewRel.length === 0
                    ? '— No members left to add —'
                    : '— Select —'}
                </option>
                {peopleSelectableForNewRel.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName}{person.source === 'manual' ? ' (manual)' : ''}
                  </option>
                ))}
              </select>
              {peopleSelectableForNewRel.length === 0 ? (
                <p className="helper-text relationship-add-empty-hint">
                  Everyone already on your tree is connected to you. Remove a relationship below to
                  choose that member again.
                </p>
              ) : null}
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
              <button type="submit" className="cta-button" disabled={!addToPersonId}>
                Add
              </button>
            </div>
          </form>
        </Card>
        <Card accent="cool">
          <SectionHeader title="Add family member" meta="Manual relative profile" />
          <form className="form-grid" onSubmit={onSubmitManualMember}>
            <label>
              Full name
              <input
                value={manualForm.displayName}
                onChange={(e) => setManualForm((current) => ({ ...current, displayName: e.target.value }))}
                placeholder="Grandma Iris"
              />
            </label>
            <label>
              Relationship to you
              <RelationshipCombobox
                value={manualForm.relationshipType}
                onChange={(value) => setManualForm((current) => ({ ...current, relationshipType: value }))}
                ariaLabel="Manual family relationship type"
                placeholder="Type to search..."
              />
            </label>
            <label>
              Birth year
              <input
                value={manualForm.birthYear}
                onChange={(e) => setManualForm((current) => ({ ...current, birthYear: e.target.value }))}
                placeholder="1934"
                inputMode="numeric"
              />
            </label>
            <label>
              <span className="stack-row" style={{ justifyContent: 'space-between' }}>
                <span>Remembered with us</span>
                <input
                  type="checkbox"
                  checked={manualForm.isDeceased}
                  onChange={(e) => setManualForm((current) => ({ ...current, isDeceased: e.target.checked }))}
                  style={{ width: 'auto', marginTop: 0 }}
                />
              </span>
            </label>
            <label>
              Death year
              <input
                value={manualForm.deathYear}
                onChange={(e) => setManualForm((current) => ({ ...current, deathYear: e.target.value }))}
                placeholder="2011"
                inputMode="numeric"
                disabled={!manualForm.isDeceased}
              />
            </label>
            <label>
              Photo
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setManualPhotoFile(e.target.files?.[0] ?? null)}
              />
              <p className="helper-text">Upload a portrait or memorial image for relatives who are not in the portal.</p>
            </label>
            <div className="stack-row">
              <button type="submit" className="cta-button" disabled={!manualForm.displayName.trim()}>
                Add family member
              </button>
            </div>
          </form>
        </Card>
        <Card className="full-grid">
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
    <section className="page-section hk-unified-page hk-help-page">
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
    try {
      if (!canEdit) {
        notify('Only organizers and admins can update events.', 'error');
        return;
      }
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
    } catch (err) {
      notify(mutationError(err, { action: 'update', subject: 'event', requiresOrganizer: true }), 'error');
    }
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete "${eventItem.title}"? This cannot be undone.`)) return;
    try {
      if (!canEdit) {
        notify('Only organizers and admins can delete events.', 'error');
        return;
      }
      await deleteEvent(eventItem.id);
      await logAuditEvent(ownerUid, ownerName, 'delete', 'event', eventItem.id, eventItem.title);
      notify('Event removed.', 'deleted');
    } catch (err) {
      notify(mutationError(err, { action: 'delete', subject: 'event', requiresOrganizer: true }), 'error');
    }
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
    try {
      if (!canEdit) {
        notify('Only organizers and admins can save hotel details.', 'error');
        return;
      }
      await updateHotel(hotel.id, {
        ...editForm,
        deadline: editForm.deadline || undefined,
      });
      await logAuditEvent(ownerUid, ownerName, 'update', 'hotel', hotel.id, hotel.name);
      setEditing(false);
      notify('Hotel updated.', 'updated');
    } catch (err) {
      notify(mutationError(err, { action: 'update', subject: 'hotel details', requiresOrganizer: true }), 'error');
    }
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete "${hotel.name}"? This cannot be undone.`)) return;
    try {
      if (!canEdit) {
        notify('Only organizers and admins can delete hotels.', 'error');
        return;
      }
      await deleteHotel(hotel.id);
      await logAuditEvent(ownerUid, ownerName, 'delete', 'hotel', hotel.id, hotel.name);
      notify('Hotel removed.', 'deleted');
    } catch (err) {
      notify(mutationError(err, { action: 'delete', subject: 'hotel', requiresOrganizer: true }), 'error');
    }
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
    if (!canManage) {
      notify('Only organizers and admins can upload attachments here.', 'error');
      event.currentTarget.value = '';
      return;
    }

    if (file.size > maxFileSizeBytes) {
      notify('Please upload files smaller than 5MB (images or PDFs).', 'error');
      event.currentTarget.value = '';
      return;
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const kind = isPdf ? 'document' : 'image';
    try {
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
    } catch (err) {
      notify(mutationError(err, { action: 'upload', subject: 'attachment', requiresOrganizer: true }), 'error');
    } finally {
      event.currentTarget.value = '';
    }
  };

  const onDelete = async (asset: AssetRecord) => {
    try {
      if (!canManage) {
        notify('Only organizers and admins can delete attachments.', 'error');
        return;
      }
      await deleteAsset(asset);
      await logAuditEvent(ownerUid, ownerName, 'delete', 'asset', asset.id, asset.fileName);
      notify('File removed.', 'deleted');
    } catch (err) {
      notify(mutationError(err, { action: 'delete', subject: 'file', requiresOrganizer: true }), 'error');
    }
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

const AuditPage = () => {
  const { data: logs } = useAuditLogs();

  return (
    <section className="page-section hk-unified-page hk-audit-page">
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
    <section className="page-section hk-unified-page hk-organizer-page">
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

  const deleteMember = async (member: DirectoryMember) => {
    if (member.uid === profile.uid) {
      notify('Use another admin account if you need to remove this one.', 'error');
      return;
    }

    const confirmed = window.confirm(
      `Delete ${member.displayName}? Their bulletin posts and comments will stay, but their profile, directory entry, flights, RSVPs, files, relationships, and private messages will be removed.`,
    );
    if (!confirmed) {
      return;
    }

    const result = await withToken((token) =>
      callBackend<{ displayName: string }>(token, 'deleteUser', { uid: member.uid }),
    );
    if (!result) {
      return;
    }

    notify(`${result.displayName} deleted and cleaned up.`, 'deleted');
  };

  return (
    <section className="page-section hk-unified-page hk-admin-page">
      <SectionIntro eyebrow="Admin" title="Approvals, roles, and invites" body="Privileged actions route through the single HTTPS function so admin credentials never reach the client." />
      <div className="content-grid two-up">
        <PendingApprovalsCard />

        <InviteLinkCard />

        <Card className="full-grid">
          <SectionHeader title="Role assignments" meta="Approved directory" />
          <p className="helper-text" style={{ marginBottom: '0.9rem' }}>
            Deleting a user keeps bulletin posts and comments, but removes other account-linked data.
          </p>
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
                  <button
                    type="button"
                    className="ghost-button danger-button"
                    onClick={() => void deleteMember(member)}
                    disabled={member.uid === profile.uid}
                  >
                    Delete user
                  </button>
                </div>
              </article>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
};
