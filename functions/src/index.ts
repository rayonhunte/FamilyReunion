import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { onRequest } from 'firebase-functions/v2/https';

initializeApp();

const db = getFirestore();
const adminAuth = getAuth();

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

const assertAdmin = async (uid: string) => {
  const snapshot = await db.collection('users').doc(uid).get();
  const data = snapshot.data();
  return data?.status === 'approved' && data?.role === 'admin';
};

const approveUser = async (callerUid: string, payload: Record<string, unknown>) => {
  if (!(await assertAdmin(callerUid))) {
    return forbidden('Admin role required.');
  }

  const uid = typeof payload.uid === 'string' ? payload.uid : '';
  const role = (payload.role === 'organizer' || payload.role === 'admin' ? payload.role : 'member') as Role;
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
  if (!(await assertAdmin(callerUid))) {
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

const createInvite = async (callerUid: string, payload: Record<string, unknown>) => {
  if (!(await assertAdmin(callerUid))) {
    return forbidden('Admin role required.');
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
  if (!(await assertAdmin(callerUid))) {
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
  if (!(await assertAdmin(callerUid))) {
    return forbidden('Admin role required.');
  }

  return json(false, {
    errorCode: 'email_not_configured',
    message: 'Email sending is not configured yet. Use createInvite and share the link manually or add a mail provider secret.',
  });
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
    case 'createInvite':
      result = await createInvite(decodedToken.uid, payload);
      break;
    case 'revokeInvite':
      result = await revokeInvite(decodedToken.uid, payload);
      break;
    case 'sendInvite':
      result = await sendInvite(decodedToken.uid);
      break;
    default:
      response.status(400).json(badRequest('Unsupported action.'));
      return;
  }

  response.status(result.ok ? 200 : 403).json(result);
});
