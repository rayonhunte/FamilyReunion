import { useDeferredValue, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { callBackend } from '../lib/functionsApi';
import {
  addBulletinComment,
  createBulletinPost,
  createEvent,
  createHotel,
  createOrGetDirectThread,
  deleteAsset,
  deleteStorageFile,
  saveRegistration,
  sendThreadMessage,
  updateBulletinPost,
  updateProfileFields,
  uploadAsset,
  uploadBulletinAttachment,
  useAssociatedAssets,
  useAssets,
  useBulletinComments,
  useBulletinPosts,
  useDirectory,
  useEvents,
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
  Hotel,
  Registration,
  Role,
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

const navItems = [
  { label: 'Dashboard', to: '/app' },
  { label: 'Registration', to: '/app/registration' },
  { label: 'Events', to: '/app/events' },
  { label: 'Hotels', to: '/app/hotels' },
  { label: 'Bulletin', to: '/app/bulletin' },
  { label: 'Messages', to: '/app/messages' },
  { label: 'Files', to: '/app/files' },
  { label: 'Admin', to: '/app/admin' },
];

export const App = () => {
  const { loading, profile, user } = useAuth();

  if (loading) {
    return <FullscreenState title="Loading portal" description="Checking your member access and reunion profile." />;
  }

  return (
    <Routes>
      <Route path="/" element={user && profile?.status === 'approved' ? <Navigate to="/app" replace /> : <LandingPage />} />
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
      <Route path="*" element={<Navigate to={user ? '/app' : '/'} replace />} />
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

  return (
    <div className="portal-page">
      <header className="topbar portal-bar">
        <div className="brand-lockup">
          <p className="eyebrow">Family Reunion</p>
          <h2>Member Portal</h2>
        </div>
        <nav className="hero-nav portal-nav">
          {navItems
            .filter((item) => (profile?.role === 'admin' ? true : item.to !== '/app/admin'))
            .map((item) => (
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

      <main className="content-shell portal-content">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="registration" element={<RegistrationPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="hotels" element={<HotelsPage />} />
          <Route path="bulletin" element={<BulletinPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="files" element={<FilesPage />} />
          <Route path="admin" element={profile?.role === 'admin' ? <AdminPage /> : <Navigate to="/app" replace />} />
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

const RegistrationPage = () => {
  const { profile } = useAuth();
  const { data: registration, loading } = useUserRegistration(
    profile?.uid ?? '',
    profile?.email ?? '',
    profile?.displayName ?? '',
  );
  const [form, setForm] = useState<Registration>(registration);
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    setForm(registration);
  }, [registration]);

  if (!profile) {
    return null;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('Saving registration...');
    await saveRegistration(profile.uid, form);
    await updateProfileFields(profile.uid, {
      bio: profile.bio,
      city: form.city,
      phone: form.phone,
    });
    setStatus('Registration saved.');
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
            {status ? <span className="helper-text">{status}</span> : null}
          </div>
        </form>
      </Card>
    </section>
  );
};

const EventsPage = () => {
  const { profile } = useAuth();
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

    await createEvent({
      ...form,
      startAt: form.startAt,
      endAt: form.endAt,
      visibility: 'members',
      createdBy: profile.uid,
    } as Omit<EventItem, 'id'>);

    setForm({ title: '', description: '', venue: '', startAt: '', endAt: '' });
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
    await createHotel(form as Omit<Hotel, 'id'>);
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

const BulletinPage = () => {
  const { profile } = useAuth();
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

    await createBulletinPost({
      authorUid: profile.uid,
      authorName: profile.displayName,
      body: newPost.trim(),
      ...(attachment ?? {}),
    });

    setNewPost('');
    setBulletinImage(null);
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

    setEditingPostId(null);
    setEditingBody('');
    setEditingImage(null);
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
                  {post.authorUid === profile.uid ? (
                    <button className="ghost-button" onClick={() => startEditing(post)} type="button">
                      Edit
                    </button>
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
  const { data: assets } = useAssets();
  const [uploadStatus, setUploadStatus] = useState('');

  if (!profile) {
    return null;
  }

  const onFileChange = async (event: FormEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }

    const kind = file.type === 'application/pdf' ? 'document' : 'image';
    setUploadStatus('Uploading file...');
    await uploadAsset({ file, kind, ownerUid: profile.uid, ownerName: profile.displayName });
    setUploadStatus('Upload complete.');
    event.currentTarget.value = '';
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
          {uploadStatus ? <p className="helper-text">{uploadStatus}</p> : null}
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
                <div className="timeline-meta">
                  <span>{formatFileSize(asset.size)}</span>
                  <a className="ghost-link" href={asset.downloadUrl} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </div>
              </article>
            ))}
          </div>
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
  const [previewAsset, setPreviewAsset] = useState<AssetRecord | null>(null);

  return (
    <>
      <article className="timeline-card attachment-card">
        <div>
          <span className="pill">{formatDate(eventItem.startAt)}</span>
          <h3>{eventItem.title}</h3>
          <p>{eventItem.description}</p>
        </div>
        <div className="timeline-meta">
          <strong>{eventItem.venue}</strong>
          <span>{formatDateTime(eventItem.startAt)}</span>
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
  const [previewAsset, setPreviewAsset] = useState<AssetRecord | null>(null);

  return (
    <>
      <article className="hotel-card attachment-card">
        <div>
          <h3>{hotel.name}</h3>
          <p>{hotel.address}</p>
          <p>{hotel.rateNotes}</p>
        </div>
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
  relatedType: 'event' | 'hotel';
  relatedId: string;
  relatedLabel: string;
  assets: AssetRecord[];
  canManage: boolean;
  ownerUid: string;
  ownerName: string;
  onPreview: (asset: AssetRecord | null) => void;
}) => {
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('');

  const onFileChange = async (event: FormEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file || !ownerUid) {
      return;
    }

    const kind = file.type === 'application/pdf' ? 'document' : 'image';
    setStatus('Uploading file...');
    await uploadAsset({
      file,
      kind,
      ownerUid,
      ownerName,
      description,
      relatedType,
      relatedId,
      relatedLabel,
    });
    setDescription('');
    setStatus('Upload complete.');
    event.currentTarget.value = '';
  };

  const onDelete = async (asset: AssetRecord) => {
    setStatus('Deleting file...');
    await deleteAsset(asset);
    setStatus('File removed.');
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
          {status ? <p className="helper-text">{status}</p> : null}
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

const AdminPage = () => {
  const { profile, user, isDemoMode } = useAuth();
  const { data: pendingUsers } = usePendingApprovals();
  const { data: directory } = useDirectory();
  const [inviteLink, setInviteLink] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  if (!profile || !user) {
    return null;
  }

  const withToken = async <T,>(callback: (token: string) => Promise<T>) => {
    if (isDemoMode) {
      setStatusMessage('Demo mode active. Connect Firebase Functions to run admin actions.');
      return null;
    }

    const token = await user.getIdToken();
    return callback(token);
  };

  const approveMember = async (uid: string, role: Role = 'member') => {
    setStatusMessage('Approving member...');
    await withToken((token) => callBackend(token, 'approveUser', { uid, role }));
    setStatusMessage('Member approved.');
  };

  const createInvite = async () => {
    setStatusMessage('Creating invite...');
    const response = await withToken<{ inviteUrl: string }>((token) =>
      callBackend(token, 'createInvite', { expiresInDays: 14 }),
    );
    if (response?.inviteUrl) {
      setInviteLink(response.inviteUrl);
    }
    setStatusMessage('Invite link created.');
  };

  const changeRole = async (uid: string, role: Role) => {
    setStatusMessage('Updating role...');
    await withToken((token) => callBackend(token, 'changeRole', { uid, role }));
    setStatusMessage('Role updated.');
  };

  return (
    <section className="page-section">
      <SectionIntro eyebrow="Admin" title="Approvals, roles, and invites" body="Privileged actions route through the single HTTPS function so admin credentials never reach the client." />
      <div className="content-grid two-up">
        <Card accent="warm">
          <SectionHeader title="Pending approvals" meta={`${pendingUsers.length} waiting`} />
          <div className="list-stack">
            {pendingUsers.map((member) => (
              <article className="list-item" key={member.uid}>
                <div>
                  <strong>{member.displayName}</strong>
                  <p>{member.email}</p>
                </div>
                <button className="ghost-button" onClick={() => void approveMember(member.uid)}>
                  Approve
                </button>
              </article>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Create invite link" meta="Single function API" />
          <p className="helper-text">
            Invite links are opaque tokens created server-side. Sending email can be added later without changing the client contract.
          </p>
          <div className="stack-row">
            <button className="cta-button" onClick={() => void createInvite()}>
              Create invite
            </button>
            {inviteLink ? (
              <a className="ghost-link" href={inviteLink} target="_blank" rel="noreferrer">
                Open invite link
              </a>
            ) : null}
          </div>
          {statusMessage ? <p className="helper-text">{statusMessage}</p> : null}
        </Card>

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
