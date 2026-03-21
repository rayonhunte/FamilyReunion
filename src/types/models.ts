export type ApprovalStatus = 'pending' | 'approved' | 'disabled';
export type Role = 'member' | 'organizer' | 'admin';
export type RSVPStatus = 'attending' | 'maybe' | 'not-attending';
export type AssetKind = 'image' | 'document';
export type AssetRelatedType = 'general' | 'event' | 'hotel' | 'flight';
export type RelationshipType =
  | 'parent'
  | 'child'
  | 'spouse'
  | 'wife'
  | 'husband'
  | 'partner'
  | 'sibling'
  | 'cousin'
  | 'grandparent'
  | 'grandchild'
  | 'aunt'
  | 'uncle'
  | 'niece'
  | 'nephew';

export interface FamilyRelationship {
  id: string;
  fromUid: string;
  toUid: string;
  relationshipType: RelationshipType;
  createdBy: string;
  createdAt?: unknown;
}

export interface UserProfile {
  id: string;
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string | null;
  status: ApprovalStatus;
  role: Role;
  groupId?: string | null;
  bio?: string;
  phone?: string;
  city?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  approvedAt?: unknown;
}

export interface DirectoryMember {
  id: string;
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string | null;
  role: Role;
  groupId?: string | null;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  organizerIds: string[];
  memberCount?: number;
}

export interface Registration {
  id: string;
  attendeeName: string;
  email: string;
  phone: string;
  city: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  dietaryNotes: string;
  accessibilityNotes: string;
  travelPlans: string;
  tShirtSize: string;
  rsvpStatus: RSVPStatus;
  checkedIn?: boolean;
  updatedAt?: unknown;
}

export interface EventItem {
  id: string;
  title: string;
  description: string;
  venue: string;
  startAt: unknown;
  endAt?: unknown;
  visibility: 'members' | 'all';
  createdBy: string;
}

export interface EventRsvp {
  id: string;
  userId: string;
  eventId: string;
  displayName: string;
  status: RSVPStatus;
  updatedAt?: unknown;
}

export interface Hotel {
  id: string;
  name: string;
  address: string;
  bookingUrl: string;
  contactName: string;
  contactEmail: string;
  roomBlock: string;
  rateNotes: string;
  deadline?: unknown;
  createdBy?: string;
}

export type AuditAction = 'create' | 'update' | 'delete';
export type AuditResourceType = 'event' | 'hotel' | 'flight' | 'bulletin_post' | 'asset' | 'bulletin_comment' | 'event_rsvp' | 'registration' | 'user' | 'family_relationship';

export interface AuditLogEntry {
  id: string;
  userId: string;
  userDisplayName: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string;
  resourceLabel?: string;
  details?: string;
  createdAt?: unknown;
}

export interface Flight {
  id: string;
  ownerUid: string;
  ownerName: string;
  groupId?: string | null;
  airline: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureAt: unknown;
  arrivalAt?: unknown;
  notes?: string;
  confirmationCode?: string;
  seat?: string;
  updatedAt?: unknown;
}

export interface BulletinPost {
  id: string;
  authorUid: string;
  authorName: string;
  body: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentPath?: string;
  attachmentContentType?: string;
  attachmentKind?: AssetKind;
  createdAt?: unknown;
  updatedAt?: unknown;
  editedAt?: unknown;
}

export interface BulletinComment {
  id: string;
  postId: string;
  authorUid: string;
  authorName: string;
  body: string;
  createdAt?: unknown;
}

export interface Thread {
  id: string;
  participantIds: string[];
  participantKey: string;
  participantNames: string[];
  lastMessageText?: string;
  lastMessageAuthorUid?: string | null;
  lastMessageAuthorName?: string | null;
  lastMessageAt?: unknown;
  updatedAt?: unknown;
}

export interface ThreadMessage {
  id: string;
  authorUid: string;
  authorName: string;
  body: string;
  createdAt?: unknown;
}

export interface AssetRecord {
  id: string;
  ownerUid: string;
  ownerName: string;
  fileName: string;
  kind: AssetKind;
  description?: string;
  path: string;
  downloadUrl: string;
  contentType: string;
  size: number;
  relatedType: AssetRelatedType;
  relatedId?: string;
  relatedLabel?: string;
  relatedKey: string;
  createdAt?: unknown;
}

export interface InviteRecord {
  id: string;
  token: string;
  status: 'active' | 'revoked' | 'used';
  email?: string;
  expiresAt?: unknown;
  createdBy: string;
}
