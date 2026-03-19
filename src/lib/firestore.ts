import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { startTransition, useEffect, useMemo, useState } from 'react';
import {
  demoAssets,
  demoAuditLogs,
  demoComments,
  demoEventRsvps,
  demoEvents,
  demoFamilyRelationships,
  demoFlights,
  demoHotels,
  demoMembers,
  demoMessages,
  demoPendingApprovals,
  demoPosts,
  demoRegistration,
  demoThreads,
} from '../data/mock';
import type {
  AssetKind,
  AssetRecord,
  AssetRelatedType,
  AuditAction,
  AuditLogEntry,
  AuditResourceType,
  BulletinComment,
  BulletinPost,
  DirectoryMember,
  EventItem,
  EventRsvp,
  FamilyRelationship,
  Flight,
  Hotel,
  Registration,
  RelationshipType,
  RSVPStatus,
  Thread,
  ThreadMessage,
  UserProfile,
} from '../types/models';
import { auth, db, storage } from './firebase';

const mapDocs = <T extends { id: string }>(snapshot: { docs: Array<{ id: string; data: () => DocumentData }> }) =>
  snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as T);

const useDemoOrLive = <T,>(
  initialData: T,
  subscribe?: (setData: (value: T) => void) => () => void,
) => {
  const [liveData, setLiveData] = useState<T>(initialData);
  const [loading, setLoading] = useState<boolean>(Boolean(subscribe));

  useEffect(() => {
    if (!subscribe) {
      return undefined;
    }

    const unsubscribe = subscribe((value) => {
      startTransition(() => {
        setLiveData(value);
        setLoading(false);
      });
    });

    return unsubscribe;
  }, [subscribe]);

  return { data: subscribe ? liveData : initialData, loading: subscribe ? loading : false };
};

const subscribeCollection = <T extends { id: string }>(
  collectionName: string,
  constraints: QueryConstraint[],
  setData: (value: T[]) => void,
) => {
  if (!db) {
    return () => undefined;
  }

  const target = query(collection(db, collectionName), ...constraints);
  return onSnapshot(target, (snapshot) => setData(mapDocs<T>(snapshot)));
};

export const useEvents = () =>
  useDemoOrLive<EventItem[]>(
    demoEvents,
    useMemo(
      () =>
        db ? (setData: (value: EventItem[]) => void) => subscribeCollection<EventItem>('events', [orderBy('startAt', 'asc')], setData) : undefined,
      [],
    ),
  );

export const useHotels = () =>
  useDemoOrLive<Hotel[]>(
    demoHotels,
    useMemo(
      () =>
        db ? (setData: (value: Hotel[]) => void) => subscribeCollection<Hotel>('hotels', [orderBy('deadline', 'asc')], setData) : undefined,
      [],
    ),
  );

export const useFlights = () =>
  useDemoOrLive<Flight[]>(
    demoFlights,
    useMemo(
      () =>
        db
          ? (setData: (value: Flight[]) => void) =>
              subscribeCollection<Flight>('flights', [orderBy('departureAt', 'asc')], setData)
          : undefined,
      [],
    ),
  );

export const useBulletinPosts = () =>
  useDemoOrLive<BulletinPost[]>(
    demoPosts,
    useMemo(
      () =>
        db
          ? (setData: (value: BulletinPost[]) => void) =>
              subscribeCollection<BulletinPost>('bulletinPosts', [orderBy('createdAt', 'desc')], setData)
          : undefined,
      [],
    ),
  );

export const useBulletinComments = () =>
  useDemoOrLive<BulletinComment[]>(
    demoComments,
    useMemo(
      () =>
        db
          ? (setData: (value: BulletinComment[]) => void) =>
              subscribeCollection<BulletinComment>('bulletinComments', [orderBy('createdAt', 'asc')], setData)
          : undefined,
      [],
    ),
  );

export const useAssets = () =>
  useDemoOrLive<AssetRecord[]>(
    demoAssets,
    useMemo(
      () =>
        db
          ? (setData: (value: AssetRecord[]) => void) =>
              subscribeCollection<AssetRecord>('assets', [orderBy('createdAt', 'desc')], setData)
          : undefined,
      [],
    ),
  );

export const useAssociatedAssets = (relatedType: AssetRelatedType, relatedId: string) => {
  const relatedKey = `${relatedType}:${relatedId}`;
  const fallback = useMemo(
    () => demoAssets.filter((asset) => asset.relatedKey === relatedKey),
    [relatedKey],
  );
  const result = useDemoOrLive<AssetRecord[]>(
    fallback,
    useMemo(
      () =>
        db && relatedId
          ? (setData: (value: AssetRecord[]) => void) =>
              subscribeCollection<AssetRecord>('assets', [where('relatedKey', '==', relatedKey)], setData)
          : undefined,
      [relatedId, relatedKey],
    ),
  );

  return {
    ...result,
    data: [...result.data].sort((left, right) => {
      const leftValue = new Date(String(left.createdAt ?? 0)).getTime();
      const rightValue = new Date(String(right.createdAt ?? 0)).getTime();
      return rightValue - leftValue;
    }),
  };
};

export const useDirectory = () =>
  useDemoOrLive<DirectoryMember[]>(
    demoMembers,
    useMemo(
      () =>
        db
          ? (setData: (value: DirectoryMember[]) => void) =>
              subscribeCollection<DirectoryMember>('directory', [orderBy('displayName', 'asc')], setData)
          : undefined,
      [],
    ),
  );

export const useFamilyRelationships = () =>
  useDemoOrLive<FamilyRelationship[]>(
    demoFamilyRelationships,
    useMemo(
      () =>
        db
          ? (setData: (value: FamilyRelationship[]) => void) =>
              subscribeCollection<FamilyRelationship>('familyRelationships', [orderBy('createdAt', 'desc')], setData)
          : undefined,
      [],
    ),
  );

export const usePendingApprovals = () =>
  {
    const result = useDemoOrLive<UserProfile[]>(
      demoPendingApprovals,
      useMemo(
        () =>
          db
            ? (setData: (value: UserProfile[]) => void) =>
                subscribeCollection<UserProfile>(
                  'users',
                  [where('status', '==', 'pending')],
                  setData,
                )
            : undefined,
        [],
      ),
    );

    return {
      ...result,
      data: [...result.data].sort((left, right) => left.displayName.localeCompare(right.displayName)),
    };
  };

export const useUserRegistration = (uid: string, fallbackEmail: string, fallbackName: string) => {
  const fallback = useMemo<Registration>(
    () => ({
      ...demoRegistration,
      id: uid,
      attendeeName: fallbackName || demoRegistration.attendeeName,
      email: fallbackEmail || demoRegistration.email,
    }),
    [fallbackEmail, fallbackName, uid],
  );

  return useDemoOrLive<Registration>(
    fallback,
    useMemo(
      () =>
        db && uid
          ? (setData: (value: Registration) => void) =>
              onSnapshot(doc(db!, 'registrations', uid), (snapshot) => {
                setData(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Registration) : fallback);
              })
          : undefined,
      [fallback, uid],
    ),
  );
};

export const useThreads = (uid: string) => {
  const fallback = useMemo(() => demoThreads.filter((thread) => thread.participantIds.includes(uid)), [uid]);
  const result = useDemoOrLive<Thread[]>(
    fallback,
    useMemo(
      () =>
        db && uid
          ? (setData: (value: Thread[]) => void) =>
              subscribeCollection<Thread>(
                'threads',
                [where('participantIds', 'array-contains', uid)],
                setData,
              )
          : undefined,
      [uid],
    ),
  );

  return {
    ...result,
    data: [...result.data].sort((left, right) => {
      const leftValue = new Date(String(left.updatedAt ?? left.lastMessageAt ?? 0)).getTime();
      const rightValue = new Date(String(right.updatedAt ?? right.lastMessageAt ?? 0)).getTime();
      return rightValue - leftValue;
    }),
  };
};

export const useThreadMessages = (threadId: string | null) => {
  const fallback = useMemo(() => (threadId ? demoMessages[threadId] ?? [] : []), [threadId]);

  return useDemoOrLive<ThreadMessage[]>(
    fallback,
    useMemo(
      () =>
        db && threadId
          ? (setData: (value: ThreadMessage[]) => void) =>
              onSnapshot(
                query(collection(db!, 'threads', threadId, 'messages'), orderBy('createdAt', 'asc')),
                (snapshot) => setData(mapDocs<ThreadMessage>(snapshot)),
              )
          : undefined,
      [threadId],
    ),
  );
};

export const saveRegistration = async (uid: string, payload: Registration) => {
  if (!db) {
    return;
  }

  await setDoc(
    doc(db!, 'registrations', uid),
    {
      ...payload,
      id: uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const createEvent = async (payload: Omit<EventItem, 'id'>): Promise<string | void> => {
  if (!db) {
    return;
  }

  const ref = await addDoc(collection(db!, 'events'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const updateEvent = async (eventId: string, payload: Partial<Omit<EventItem, 'id' | 'createdBy'>>) => {
  if (!db) {
    return;
  }

  await updateDoc(doc(db!, 'events', eventId), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
};

export const deleteEvent = async (eventId: string) => {
  if (!db) {
    return;
  }

  await deleteDoc(doc(db!, 'events', eventId));
};

export const useEventRsvps = (eventId: string) => {
  const fallback = useMemo(
    () => demoEventRsvps.filter((r) => r.eventId === eventId),
    [eventId],
  );
  return useDemoOrLive<EventRsvp[]>(
    fallback,
    useMemo(
      () =>
        db && eventId
          ? (setData: (value: EventRsvp[]) => void) =>
              subscribeCollection<EventRsvp>(
                'eventRsvps',
                [where('eventId', '==', eventId)],
                setData,
              )
          : undefined,
      [eventId],
    ),
  );
};

export const setEventRsvp = async (
  userId: string,
  eventId: string,
  displayName: string,
  status: RSVPStatus,
) => {
  if (!db) {
    return;
  }

  const docId = `${userId}_${eventId}`;
  await setDoc(
    doc(db!, 'eventRsvps', docId),
    {
      id: docId,
      userId,
      eventId,
      displayName,
      status,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const createHotel = async (payload: Omit<Hotel, 'id'>): Promise<string | void> => {
  if (!db) {
    return;
  }

  const ref = await addDoc(collection(db!, 'hotels'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const updateHotel = async (hotelId: string, payload: Partial<Omit<Hotel, 'id'>>) => {
  if (!db) {
    return;
  }

  await updateDoc(doc(db!, 'hotels', hotelId), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
};

export const deleteHotel = async (hotelId: string) => {
  if (!db) {
    return;
  }

  await deleteDoc(doc(db!, 'hotels', hotelId));
};

export const createFlight = async (payload: Omit<Flight, 'id'>): Promise<string | void> => {
  if (!db) {
    return;
  }

  const ref = await addDoc(collection(db!, 'flights'), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const updateFlight = async (flightId: string, payload: Partial<Omit<Flight, 'id' | 'ownerUid' | 'ownerName'>>) => {
  if (!db) {
    return;
  }

  await updateDoc(doc(db!, 'flights', flightId), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
};

export const deleteFlight = async (flightId: string) => {
  if (!db) {
    return;
  }

  await deleteDoc(doc(db!, 'flights', flightId));
};

export const createBulletinPost = async (payload: Omit<BulletinPost, 'id' | 'createdAt' | 'updatedAt'>): Promise<string | void> => {
  if (!db) {
    return;
  }

  const ref = await addDoc(collection(db!, 'bulletinPosts'), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const updateBulletinPost = async (
  postId: string,
  payload: Partial<Omit<BulletinPost, 'id' | 'authorUid' | 'authorName' | 'createdAt'>>,
) => {
  if (!db) {
    return;
  }

  await updateDoc(doc(db!, 'bulletinPosts', postId), {
    ...payload,
    editedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const deleteBulletinPost = async (postId: string) => {
  if (!db) {
    return;
  }

  await deleteDoc(doc(db!, 'bulletinPosts', postId));
};

export const logAuditEvent = async (
  userId: string,
  userDisplayName: string,
  action: AuditAction,
  resourceType: AuditResourceType,
  resourceId: string,
  resourceLabel?: string,
  details?: string,
) => {
  if (!db) {
    return;
  }

  // Audit logging is best-effort. If Firestore rules don't allow writes to `auditLogs`
  // (common in local/dev deployments), we don't want to block core CRUD flows.
  try {
    await addDoc(collection(db!, 'auditLogs'), {
      userId,
      userDisplayName,
      action,
      resourceType,
      resourceId,
      resourceLabel: resourceLabel ?? null,
      details: details ?? null,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[logAuditEvent] write failed (non-fatal):', err);
  }
};

const subscribeAuditLogs = (setData: (value: AuditLogEntry[]) => void) => {
  if (!db) return () => undefined;
  const q = query(
    collection(db, 'auditLogs'),
    orderBy('createdAt', 'desc'),
    limit(500),
  );
  return onSnapshot(q, (snapshot) => setData(mapDocs<AuditLogEntry>(snapshot)));
};

export const useAuditLogs = () => {
  return useDemoOrLive<AuditLogEntry[]>(
    demoAuditLogs,
    useMemo(
      () => (db ? (setData: (value: AuditLogEntry[]) => void) => subscribeAuditLogs(setData) : undefined),
      [],
    ),
  );
};

export const addBulletinComment = async (payload: Omit<BulletinComment, 'id' | 'createdAt'>) => {
  if (!db) {
    return;
  }

  await addDoc(collection(db!, 'bulletinComments'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
};

const participantKeyFor = (participantIds: string[]) => [...participantIds].sort().join('__');

export const createOrGetDirectThread = async (
  currentUser: DirectoryMember,
  otherMember: DirectoryMember,
) => {
  const participantIds = [currentUser.uid, otherMember.uid];
  const participantKey = participantKeyFor(participantIds);

  if (!db) {
    return participantKey;
  }

  // We attempt to reuse an existing thread by participantKey.
  // If reads are denied for some reason, we still try to create the thread doc;
  // the subsequent create/update rules will determine whether the user can proceed.
  let existingSnapshot: Awaited<ReturnType<typeof getDocs>> | null = null;
  try {
    existingSnapshot = await getDocs(
      query(collection(db!, 'threads'), where('participantKey', '==', participantKey)),
    );
  } catch (err) {
    // #region agent log (minimal console so the user sees a stack in devtools)
    // eslint-disable-next-line no-console
    console.error('[createOrGetDirectThread] existing thread lookup failed:', err);
    // #endregion
  }
  if (existingSnapshot && !existingSnapshot.empty) {
    return existingSnapshot.docs[0].id;
  }

  const threadRef = doc(db!, 'threads', participantKey);
  await setDoc(threadRef, {
    participantIds: [...participantIds].sort(),
    participantKey,
    participantNames: [currentUser.displayName, otherMember.displayName].sort(),
    updatedAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
    lastMessageText: 'Thread created',
  });

  return threadRef.id;
};

export const sendThreadMessage = async (
  threadId: string,
  payload: Omit<ThreadMessage, 'id' | 'createdAt'>,
  participantIds: string[],
  participantNames: string[],
) => {
  if (!db) {
    return;
  }

  try {
    await addDoc(collection(db!, 'threads', threadId, 'messages'), {
      ...payload,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Missing or insufficient permissions.';
    throw new Error(`SendThreadMessage: could not create message. ${message}`);
  }

  try {
    await setDoc(
      doc(db!, 'threads', threadId),
      {
        participantIds,
        participantKey: participantKeyFor(participantIds),
        participantNames,
        lastMessageText: payload.body,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Missing or insufficient permissions.';
    throw new Error(`SendThreadMessage: could not update thread metadata. ${message}`);
  }
};

export const uploadAsset = async ({
  file,
  kind,
  ownerUid,
  ownerName,
  description,
  relatedType = 'general',
  relatedId,
  relatedLabel,
}: {
  file: File;
  kind: AssetKind;
  ownerUid: string;
  ownerName: string;
  description?: string;
  relatedType?: AssetRelatedType;
  relatedId?: string;
  relatedLabel?: string;
}) => {
  if (!db || !storage) {
    throw new Error('File upload needs Firebase Storage configured.');
  }

  const contentType =
    kind === 'image'
      ? file.type && file.type.startsWith('image/')
        ? file.type
        : 'image/jpeg'
      : file.type === 'application/pdf'
        ? 'application/pdf'
        : 'application/pdf';

  const folder =
    relatedType === 'general'
      ? kind === 'image'
        ? `gallery/${ownerUid}`
        : `documents/${ownerUid}`
      : `associations/${relatedType}/${ownerUid}/${relatedId ?? 'unassigned'}`;
  const relatedKey = relatedType === 'general' ? 'general' : `${relatedType}:${relatedId ?? ''}`;
  const safeFileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
  const storagePath = `${folder}/${safeFileName}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, { contentType });
  const downloadUrl = await getDownloadURL(storageRef);

  const docRef = await addDoc(collection(db!, 'assets'), {
    ownerUid,
    ownerName,
    fileName: file.name,
    kind,
    description: description?.trim() || '',
    path: storagePath,
    downloadUrl,
    contentType,
    size: file.size,
    relatedType,
    relatedId: relatedId ?? null,
    relatedLabel: relatedLabel ?? null,
    relatedKey,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
};

export const deleteAsset = async (asset: AssetRecord) => {
  if (!db || !storage) {
    return;
  }

  await deleteDoc(doc(db!, 'assets', asset.id));
  await deleteObject(ref(storage, asset.path));
};

export const createRelationship = async (payload: {
  fromUid: string;
  toUid: string;
  relationshipType: RelationshipType;
  createdBy: string;
}) => {
  if (!db) return;
  const { fromUid, toUid, relationshipType, createdBy } = payload;
  if (fromUid === toUid) return;
  const docRef = await addDoc(collection(db, 'familyRelationships'), {
    fromUid,
    toUid,
    relationshipType,
    createdBy,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
};

export const updateRelationship = async (
  relationshipId: string,
  payload: { relationshipType: RelationshipType },
) => {
  if (!db) return;
  await updateDoc(doc(db, 'familyRelationships', relationshipId), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
};

export const deleteRelationship = async (relationshipId: string) => {
  if (!db) return;
  await deleteDoc(doc(db, 'familyRelationships', relationshipId));
};

export const uploadBulletinAttachment = async ({
  file,
  ownerUid,
}: {
  file: File;
  ownerUid: string;
}) => {
  if (!storage) {
    return null;
  }

  const safeFileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
  const storagePath = `bulletin/${ownerUid}/${safeFileName}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, { contentType: file.type });
  const downloadUrl = await getDownloadURL(storageRef);

  return {
    attachmentUrl: downloadUrl,
    attachmentName: file.name,
    attachmentPath: storagePath,
    attachmentContentType: file.type,
    attachmentKind: (file.type === 'application/pdf' ? 'document' : 'image') as AssetKind,
  };
};

export const deleteStorageFile = async (path?: string) => {
  if (!storage || !path) {
    return;
  }

  await deleteObject(ref(storage, path));
};

export const uploadProfileImage = async (uid: string, file: File) => {
  if (!db || !storage) {
    throw new Error('Photo upload needs Firebase Storage configured.');
  }

  const safeFileName = `avatar-${uid}`;
  const storagePath = `profile-images/${uid}/${safeFileName}`;
  const storageRef = ref(storage, storagePath);
  const contentType =
    file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
  await uploadBytes(storageRef, file, { contentType });
  const downloadUrl = await getDownloadURL(storageRef);

  try {
    await updateDoc(doc(db!, 'users', uid), {
      photoURL: downloadUrl,
      updatedAt: serverTimestamp(),
    });
    if (auth?.currentUser?.uid === uid) {
      try {
        await updateProfile(auth.currentUser, { photoURL: downloadUrl });
      } catch {
        /* Auth profile update is best-effort; Firestore remains source of truth */
      }
    }
  } catch (err) {
    // Avoid orphaned file in Storage if Firestore rules reject the write
    try {
      await deleteObject(storageRef);
    } catch {
      /* ignore */
    }
    throw err;
  }

  return downloadUrl;
};

export const updateProfileFields = async (
  uid: string,
  payload: Pick<UserProfile, 'displayName' | 'bio' | 'city' | 'phone'>,
) => {
  if (!db) {
    return;
  }

  await updateDoc(doc(db!, 'users', uid), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
};
