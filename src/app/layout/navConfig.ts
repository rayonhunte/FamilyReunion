export const primaryNavItems: { label: string; to: string; roles?: ('admin' | 'organizer')[] }[] = [
  { label: 'Dashboard', to: '/app' },
  { label: 'Profile', to: '/app/profile' },
  { label: 'Organizer', to: '/app/organizer', roles: ['admin', 'organizer'] },
  { label: 'Admin', to: '/app/admin', roles: ['admin'] },
];

export const menuNavItems: { label: string; to: string; adminOnly?: boolean }[] = [
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
