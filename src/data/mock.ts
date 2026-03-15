import type {
  AssetRecord,
  BulletinComment,
  BulletinPost,
  DirectoryMember,
  EventItem,
  Hotel,
  Registration,
  Thread,
  ThreadMessage,
  UserProfile,
} from '../types/models';

export const demoProfile: UserProfile = {
  id: 'demo-admin',
  uid: 'demo-admin',
  displayName: 'Reunion Admin',
  email: 'admin@familyreunion.dev',
  photoURL: null,
  status: 'approved',
  role: 'admin',
  groupId: 'founders',
  bio: 'Demo profile shown until Firebase config is connected.',
  city: 'Georgetown',
};

export const demoMembers: DirectoryMember[] = [
  {
    id: 'demo-admin',
    uid: 'demo-admin',
    displayName: 'Reunion Admin',
    email: 'admin@familyreunion.dev',
    role: 'admin',
    groupId: 'founders',
  },
  {
    id: 'maya-james',
    uid: 'maya-james',
    displayName: 'Maya James',
    email: 'maya@example.com',
    role: 'organizer',
    groupId: 'james',
  },
  {
    id: 'rohan-bacchus',
    uid: 'rohan-bacchus',
    displayName: 'Rohan Bacchus',
    email: 'rohan@example.com',
    role: 'member',
    groupId: 'bacchus',
  },
];

export const demoRegistration: Registration = {
  id: 'demo-admin',
  attendeeName: 'Reunion Admin',
  email: 'admin@familyreunion.dev',
  phone: '+592-600-1234',
  city: 'Georgetown',
  emergencyContactName: 'Auntie June',
  emergencyContactPhone: '+592-611-2233',
  dietaryNotes: 'Vegetarian meal requested.',
  accessibilityNotes: 'Ground-floor seating preferred.',
  travelPlans: 'Arriving Friday night and staying through Monday.',
  tShirtSize: 'M',
  rsvpStatus: 'attending',
};

export const demoEvents: EventItem[] = [
  {
    id: 'welcome-dinner',
    title: 'Welcome Dinner',
    description: 'A relaxed opening dinner with introductions, music, and family photos.',
    venue: 'Garden Terrace, Georgetown Club',
    startAt: '2026-08-14T18:30:00.000Z',
    endAt: '2026-08-14T21:30:00.000Z',
    visibility: 'members',
    createdBy: 'demo-admin',
  },
  {
    id: 'heritage-brunch',
    title: 'Heritage Brunch',
    description: 'Story sharing, archive table, and memory recording session.',
    venue: 'Riverside Pavilion',
    startAt: '2026-08-15T15:00:00.000Z',
    endAt: '2026-08-15T18:00:00.000Z',
    visibility: 'members',
    createdBy: 'maya-james',
  },
];

export const demoHotels: Hotel[] = [
  {
    id: 'cara-lodge',
    name: 'Cara Lodge',
    address: '294 Quamina Street, Georgetown',
    bookingUrl: 'https://example.com/cara-lodge',
    contactName: 'Front Desk',
    contactEmail: 'reservations@caralodge.example',
    roomBlock: 'Family Reunion 2026',
    rateNotes: 'Corporate rate available until July 20.',
    deadline: '2026-07-20T00:00:00.000Z',
  },
  {
    id: 'pegasus-hotel',
    name: 'Pegasus Suites',
    address: 'Seawall Road, Kingston',
    bookingUrl: 'https://example.com/pegasus',
    contactName: 'Bookings Team',
    contactEmail: 'stay@pegasus.example',
    roomBlock: 'Reunion Overflow Block',
    rateNotes: 'Airport shuttle can be added on request.',
    deadline: '2026-07-28T00:00:00.000Z',
  },
];

export const demoPosts: BulletinPost[] = [
  {
    id: 'post-1',
    authorUid: 'maya-james',
    authorName: 'Maya James',
    body: 'Please upload any old photos from the 2004 reunion and review @[event:welcome-dinner:Welcome Dinner] for the latest updates.',
    createdAt: '2026-03-01T18:00:00.000Z',
  },
  {
    id: 'post-2',
    authorUid: 'demo-admin',
    authorName: 'Reunion Admin',
    body: 'Registration is open. Please complete your attendee profile and travel notes by June 30. Ask @[user:maya-james:Maya James] if you need help with @[asset:asset-1:family-tree.pdf].',
    createdAt: '2026-03-03T12:15:00.000Z',
  },
];

export const demoComments: BulletinComment[] = [
  {
    id: 'comment-1',
    postId: 'post-1',
    authorUid: 'rohan-bacchus',
    authorName: 'Rohan Bacchus',
    body: 'I found three scanned albums and will upload them tonight.',
    createdAt: '2026-03-02T09:45:00.000Z',
  },
];

export const demoThreads: Thread[] = [
  {
    id: 'demo-admin__maya-james',
    participantIds: ['demo-admin', 'maya-james'],
    participantKey: 'demo-admin__maya-james',
    participantNames: ['Reunion Admin', 'Maya James'],
    lastMessageText: 'The hotel block rates are confirmed.',
    lastMessageAt: '2026-03-04T10:00:00.000Z',
    updatedAt: '2026-03-04T10:00:00.000Z',
  },
];

export const demoMessages: Record<string, ThreadMessage[]> = {
  'demo-admin__maya-james': [
    {
      id: 'message-1',
      authorUid: 'maya-james',
      authorName: 'Maya James',
      body: 'The hotel block rates are confirmed.',
      createdAt: '2026-03-04T10:00:00.000Z',
    },
  ],
};

export const demoAssets: AssetRecord[] = [
  {
    id: 'asset-1',
    ownerUid: 'demo-admin',
    ownerName: 'Reunion Admin',
    fileName: 'family-tree.pdf',
    kind: 'document',
    description: 'Printable family tree handout for welcome night.',
    path: 'documents/demo-admin/family-tree.pdf',
    downloadUrl: '#',
    contentType: 'application/pdf',
    size: 1024 * 320,
    relatedType: 'general',
    relatedKey: 'general',
    createdAt: '2026-03-05T11:00:00.000Z',
  },
  {
    id: 'asset-2',
    ownerUid: 'maya-james',
    ownerName: 'Maya James',
    fileName: 'summer-reunion-photo.jpg',
    kind: 'image',
    description: 'Past reunion photo for the lobby slideshow.',
    path: 'gallery/maya-james/summer-reunion-photo.jpg',
    downloadUrl: '#',
    contentType: 'image/jpeg',
    size: 1024 * 620,
    relatedType: 'general',
    relatedKey: 'general',
    createdAt: '2026-03-06T16:20:00.000Z',
  },
  {
    id: 'asset-3',
    ownerUid: 'demo-admin',
    ownerName: 'Reunion Admin',
    fileName: 'welcome-dinner-menu.pdf',
    kind: 'document',
    description: 'Draft dinner menu for the welcome event.',
    path: 'associations/event/demo-admin/welcome-dinner/welcome-dinner-menu.pdf',
    downloadUrl: '#',
    contentType: 'application/pdf',
    size: 1024 * 240,
    relatedType: 'event',
    relatedId: 'welcome-dinner',
    relatedLabel: 'Welcome Dinner',
    relatedKey: 'event:welcome-dinner',
    createdAt: '2026-03-06T16:20:00.000Z',
  },
  {
    id: 'asset-4',
    ownerUid: 'maya-james',
    ownerName: 'Maya James',
    fileName: 'cara-lodge-map.jpg',
    kind: 'image',
    description: 'Exterior and location reference for the hotel.',
    path: 'associations/hotel/maya-james/cara-lodge/cara-lodge-map.jpg',
    downloadUrl: '#',
    contentType: 'image/jpeg',
    size: 1024 * 420,
    relatedType: 'hotel',
    relatedId: 'cara-lodge',
    relatedLabel: 'Cara Lodge',
    relatedKey: 'hotel:cara-lodge',
    createdAt: '2026-03-06T16:20:00.000Z',
  },
];

export const demoPendingApprovals: UserProfile[] = [
  {
    id: 'new-member',
    uid: 'new-member',
    displayName: 'New Family Member',
    email: 'new.member@example.com',
    photoURL: null,
    status: 'pending',
    role: 'member',
    groupId: null,
  },
];
