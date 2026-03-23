import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { onRequest } from 'firebase-functions/v2/https';

initializeApp();

const db = getFirestore();
const adminAuth = getAuth();
const adminStorage = getStorage();

type Role = 'member' | 'organizer' | 'admin';

interface ApiBody {
  action?: string;
  payload?: Record<string, unknown>;
}

const json = (ok: boolean, body: Record<string, unknown> = {}) => ({
  ok,
  ...body,
});

const badRequest = (message: string) => json(false, { errorCode: 'bad_request', message });
const forbidden = (message: string) => json(false, { errorCode: 'forbidden', message });

const getBearerToken = (header?: string) => {
  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  return header.slice('Bearer '.length);
};

const hasApprovedRole = async (uid: string, roles: Role[]) => {
  const snapshot = await db.collection('users').doc(uid).get();
  const data = snapshot.data();
  return data?.status === 'approved' && roles.includes(data?.role as Role);
};

const writeAuditLog = async (
  userId: string,
  userDisplayName: string,
  resourceId: string,
  resourceLabel?: string,
  details?: string,
) => {
  await db.collection('auditLogs').add({
    userId,
    userDisplayName,
    action: 'delete',
    resourceType: 'user',
    resourceId,
    resourceLabel: resourceLabel ?? null,
    details: details ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
};

const deleteStoragePath = async (path?: string | null) => {
  if (!path) {
    return;
  }

  await adminStorage.bucket().file(path).delete({ ignoreNotFound: true });
};

const approveUser = async (callerUid: string, payload: Record<string, unknown>) => {
  const callerAdmin = await hasApprovedRole(callerUid, ['admin']);
  const callerOrganizer = await hasApprovedRole(callerUid, ['organizer']);
  if (!callerAdmin && !callerOrganizer) {
    return forbidden('Organizer or admin role required.');
  }

  const uid = typeof payload.uid === 'string' ? payload.uid : '';
  let role = (payload.role === 'organizer' || payload.role === 'admin' ? payload.role : 'member') as Role;
  if (!callerAdmin) {
    role = 'member';
  }
  const groupId = typeof payload.groupId === 'string' ? payload.groupId : null;
  if (!uid) {
    return badRequest('Missing user id.');
  }

  const userRef = db.collection('users').doc(uid);
  const userSnapshot = await userRef.get();
  if (!userSnapshot.exists) {
    return badRequest('User was not found.');
  }

  const existing = userSnapshot.data() ?? {};
  await userRef.set(
    {
      status: 'approved',
      role,
      groupId,
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await db.collection('directory').doc(uid).set(
    {
      uid,
      displayName: existing.displayName ?? existing.email ?? 'Family member',
      email: existing.email ?? '',
      photoURL: existing.photoURL ?? null,
      role,
      groupId,
    },
    { merge: true },
  );

  return json(true, { data: { uid, role } });
};

const changeRole = async (callerUid: string, payload: Record<string, unknown>) => {
  if (!(await hasApprovedRole(callerUid, ['admin']))) {
    return forbidden('Admin role required.');
  }

  const uid = typeof payload.uid === 'string' ? payload.uid : '';
  const role = payload.role;
  if (!uid || (role !== 'member' && role !== 'organizer' && role !== 'admin')) {
    return badRequest('Valid uid and role are required.');
  }

  await db.collection('users').doc(uid).set(
    {
      role,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await db.collection('directory').doc(uid).set({ role }, { merge: true });

  return json(true, { data: { uid, role } });
};

const deleteUser = async (callerUid: string, payload: Record<string, unknown>) => {
  if (!(await hasApprovedRole(callerUid, ['admin']))) {
    return forbidden('Admin role required.');
  }

  const uid = typeof payload.uid === 'string' ? payload.uid : '';
  if (!uid) {
    return badRequest('Missing user id.');
  }

  if (uid === callerUid) {
    return forbidden('Admins cannot delete their own account from the Admin page.');
  }

  const userRef = db.collection('users').doc(uid);
  const userSnapshot = await userRef.get();
  if (!userSnapshot.exists) {
    return badRequest('User was not found.');
  }

  const callerSnapshot = await db.collection('users').doc(callerUid).get();
  const callerDisplayName =
    (callerSnapshot.data()?.displayName as string | undefined) ?? callerUid;

  const existing = userSnapshot.data() ?? {};
  const displayName =
    (existing.displayName as string | undefined) ??
    (existing.email as string | undefined) ??
    'Family member';

  const [
    assetsSnapshot,
    flightsSnapshot,
    eventRsvpsSnapshot,
    relationshipsFromSnapshot,
    relationshipsToSnapshot,
    threadsSnapshot,
    invitesSnapshot,
    directorySnapshot,
    registrationSnapshot,
  ] = await Promise.all([
    db.collection('assets').where('ownerUid', '==', uid).get(),
    db.collection('flights').where('ownerUid', '==', uid).get(),
    db.collection('eventRsvps').where('userId', '==', uid).get(),
    db.collection('familyRelationships').where('fromUid', '==', uid).get(),
    db.collection('familyRelationships').where('toUid', '==', uid).get(),
    db.collection('threads').where('participantIds', 'array-contains', uid).get(),
    db.collection('invites').where('createdBy', '==', uid).get(),
    db.collection('directory').doc(uid).get(),
    db.collection('registrations').doc(uid).get(),
  ]);

  await Promise.all(
    assetsSnapshot.docs.map(async (assetDoc) => {
      const asset = assetDoc.data();
      await deleteStoragePath(typeof asset.path === 'string' ? asset.path : null);
      await assetDoc.ref.delete();
    }),
  );

  await Promise.all(flightsSnapshot.docs.map((flightDoc) => flightDoc.ref.delete()));
  await Promise.all(eventRsvpsSnapshot.docs.map((eventRsvpDoc) => eventRsvpDoc.ref.delete()));
  await Promise.all(relationshipsFromSnapshot.docs.map((relationshipDoc) => relationshipDoc.ref.delete()));
  await Promise.all(relationshipsToSnapshot.docs.map((relationshipDoc) => relationshipDoc.ref.delete()));
  await Promise.all(invitesSnapshot.docs.map((inviteDoc) => inviteDoc.ref.delete()));

  let deletedThreadMessageCount = 0;
  await Promise.all(
    threadsSnapshot.docs.map(async (threadDoc) => {
      const messagesSnapshot = await threadDoc.ref.collection('messages').get();
      deletedThreadMessageCount += messagesSnapshot.size;
      await Promise.all(messagesSnapshot.docs.map((messageDoc) => messageDoc.ref.delete()));
      await threadDoc.ref.delete();
    }),
  );

  await Promise.all([
    directorySnapshot.exists ? directorySnapshot.ref.delete() : Promise.resolve(),
    registrationSnapshot.exists ? registrationSnapshot.ref.delete() : Promise.resolve(),
    deleteStoragePath(`profile-images/${uid}/avatar-${uid}`),
    deleteStoragePath(`images/${uid}/avatar-${uid}`),
  ]);

  try {
    await adminAuth.deleteUser(uid);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code !== 'auth/user-not-found') {
      throw error;
    }
  }

  await userRef.delete();

  await writeAuditLog(
    callerUid,
    callerDisplayName,
    uid,
    displayName,
    'Deleted account data while preserving bulletin posts and bulletin comments.',
  );

  return json(true, {
    data: {
      uid,
      displayName,
      deleted: {
        assets: assetsSnapshot.size,
        flights: flightsSnapshot.size,
        eventRsvps: eventRsvpsSnapshot.size,
        familyRelationships: relationshipsFromSnapshot.size + relationshipsToSnapshot.size,
        invites: invitesSnapshot.size,
        threads: threadsSnapshot.size,
        threadMessages: deletedThreadMessageCount,
        directory: directorySnapshot.exists ? 1 : 0,
        registration: registrationSnapshot.exists ? 1 : 0,
        userProfile: 1,
      },
      preserved: ['bulletinPosts', 'bulletinComments'],
    },
  });
};

const createInvite = async (callerUid: string, payload: Record<string, unknown>) => {
  if (!(await hasApprovedRole(callerUid, ['admin', 'organizer']))) {
    return forbidden('Organizer or admin role required.');
  }

  const expiresInDays = typeof payload.expiresInDays === 'number' ? Math.max(1, Math.min(30, payload.expiresInDays)) : 14;
  const token = randomUUID();
  const inviteRef = db.collection('invites').doc(token);
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  await inviteRef.set({
    token,
    status: 'active',
    createdBy: callerUid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  });

  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';
  return json(true, { data: { token, inviteUrl: `${baseUrl.replace(/\/$/, '')}/?invite=${token}` } });
};

const revokeInvite = async (callerUid: string, payload: Record<string, unknown>) => {
  if (!(await hasApprovedRole(callerUid, ['admin']))) {
    return forbidden('Admin role required.');
  }

  const token = typeof payload.token === 'string' ? payload.token : '';
  if (!token) {
    return badRequest('Missing invite token.');
  }

  await db.collection('invites').doc(token).set(
    {
      status: 'revoked',
      revokedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return json(true, { data: { token } });
};

const sendInvite = async (callerUid: string) => {
  if (!(await hasApprovedRole(callerUid, ['admin']))) {
    return forbidden('Admin role required.');
  }

  return json(false, {
    errorCode: 'email_not_configured',
    message: 'Email sending is not configured yet. Use createInvite and share the link manually or add a mail provider secret.',
  });
};

/** Approved members: push users/{uid} → directory (photo/name after profile edit). Avoids Firestore-trigger + Eventarc deploy issues. */
const syncMyDirectory = async (callerUid: string) => {
  const snap = await db.collection('users').doc(callerUid).get();
  if (!snap.exists) {
    return badRequest('User not found.');
  }
  const u = snap.data() ?? {};
  if (u.status !== 'approved') {
    return json(true);
  }
  await db.collection('directory').doc(callerUid).set(
    {
      uid: callerUid,
      displayName: u.displayName ?? u.email ?? 'Family member',
      email: u.email ?? '',
      photoURL: u.photoURL ?? null,
      role: u.role ?? 'member',
      groupId: u.groupId ?? null,
    },
    { merge: true },
  );
  return json(true);
};

export const backendApi = onRequest({ region: 'us-central1' }, async (request, response) => {
  response.set('Access-Control-Allow-Origin', request.headers.origin ?? '*');
  response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }

  if (request.method !== 'POST') {
    response.status(405).json(json(false, { errorCode: 'method_not_allowed', message: 'POST only.' }));
    return;
  }

  const token = getBearerToken(request.header('Authorization') ?? undefined);
  if (!token) {
    response.status(401).json(json(false, { errorCode: 'unauthenticated', message: 'Missing bearer token.' }));
    return;
  }

  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(token);
  } catch {
    response.status(401).json(json(false, { errorCode: 'invalid_token', message: 'Unable to verify token.' }));
    return;
  }

  const body = (request.body ?? {}) as ApiBody;
  const action = body.action;
  const payload = body.payload ?? {};
  if (!action) {
    response.status(400).json(badRequest('Missing action.'));
    return;
  }

  let result;
  switch (action) {
    case 'approveUser':
      result = await approveUser(decodedToken.uid, payload);
      break;
    case 'changeRole':
      result = await changeRole(decodedToken.uid, payload);
      break;
    case 'deleteUser':
      result = await deleteUser(decodedToken.uid, payload);
      break;
    case 'createInvite':
      result = await createInvite(decodedToken.uid, payload);
      break;
    case 'revokeInvite':
      result = await revokeInvite(decodedToken.uid, payload);
      break;
    case 'sendInvite':
      result = await sendInvite(decodedToken.uid);
      break;
    case 'syncMyDirectory':
      result = await syncMyDirectory(decodedToken.uid);
      break;
    default:
      response.status(400).json(badRequest('Unsupported action.'));
      return;
  }

  response.status(result.ok ? 200 : 403).json(result);
});
