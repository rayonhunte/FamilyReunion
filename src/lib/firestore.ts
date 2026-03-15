import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
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
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { startTransition, useEffect, useMemo, useState } from 'react';
import {
  demoAssets,
  demoComments,
  demoEvents,
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
import { db, storage } from './firebase';

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

export const createEvent = async (payload: Omit<EventItem, 'id'>) => {
  if (!db) {
    return;
  }

  await addDoc(collection(db!, 'events'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
};

export const createHotel = async (payload: Omit<Hotel, 'id'>) => {
  if (!db) {
    return;
  }

  await addDoc(collection(db!, 'hotels'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
};

export const createBulletinPost = async (payload: Omit<BulletinPost, 'id' | 'createdAt' | 'updatedAt'>) => {
  if (!db) {
    return;
  }

  await addDoc(collection(db!, 'bulletinPosts'), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
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

  const existingSnapshot = await getDocs(query(collection(db!, 'threads'), where('participantKey', '==', participantKey)));
  if (!existingSnapshot.empty) {
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

  await addDoc(collection(db!, 'threads', threadId, 'messages'), {
    ...payload,
    createdAt: serverTimestamp(),
  });

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
    return;
  }

  const folder =
    relatedType === 'general'
      ? kind === 'image'
        ? 'gallery'
        : 'documents'
      : `associations/${relatedType}/${ownerUid}/${relatedId ?? 'unassigned'}`;
  const relatedKey = relatedType === 'general' ? 'general' : `${relatedType}:${relatedId ?? ''}`;
  const safeFileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
  const storagePath = `${folder}/${safeFileName}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, { contentType: file.type });
  const downloadUrl = await getDownloadURL(storageRef);

  await addDoc(collection(db!, 'assets'), {
    ownerUid,
    ownerName,
    fileName: file.name,
    kind,
    description: description?.trim() || '',
    path: storagePath,
    downloadUrl,
    contentType: file.type,
    size: file.size,
    relatedType,
    relatedId: relatedId ?? null,
    relatedLabel: relatedLabel ?? null,
    relatedKey,
    createdAt: serverTimestamp(),
  });
};

export const deleteAsset = async (asset: AssetRecord) => {
  if (!db || !storage) {
    return;
  }

  await deleteDoc(doc(db!, 'assets', asset.id));
  await deleteObject(ref(storage, asset.path));
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

export const updateProfileFields = async (uid: string, payload: Pick<UserProfile, 'bio' | 'city' | 'phone'>) => {
  if (!db) {
    return;
  }

  await updateDoc(doc(db!, 'users', uid), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
};
