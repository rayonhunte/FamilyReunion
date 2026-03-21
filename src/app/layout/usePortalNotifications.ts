import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNotification } from '../../contexts/useNotification';
import { useAuth } from '../../hooks/useAuth';
import { useBulletinComments, useBulletinPosts, usePendingApprovals, useThreads } from '../../lib/firestore';
import { relativeTime, toDate } from '../../lib/format';
import { maybeSystemNotify } from '../../lib/systemNotifications';
import type { BulletinComment, BulletinPost, Thread } from '../../types/models';

type NotificationReadState = {
  posts: string[];
  comments: string[];
  pending: string[];
  threads: Record<string, number>;
};

export type PortalNotificationItem = {
  id: string;
  kind: 'direct-message' | 'bulletin-post' | 'bulletin-mention' | 'join-request';
  title: string;
  body: string;
  href: string;
  createdAtLabel: string;
  createdAtMs: number;
  unread: boolean;
};

const EMPTY_NOTIFICATION_READ_STATE: NotificationReadState = {
  posts: [],
  comments: [],
  pending: [],
  threads: {},
};

type BadgeNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>;
  setAppBadge?: (contents?: number) => Promise<void>;
};

const extractMentionedUserUids = (text: string): string[] => {
  const re = /@\[(user):([^:\]]+):([^\]]+)\]/g;
  const uids: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    uids.push(match[2]);
  }

  return Array.from(new Set(uids));
};

const formatShortAuthor = (authorName?: string | null, authorUid?: string | null) => {
  if (authorName) return authorName;
  if (authorUid) return authorUid;
  return 'Someone';
};

const toTimestamp = (value: unknown) => toDate(value)?.getTime() ?? 0;

const sanitizeStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

const sanitizeThreadReadMap = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[0] === 'string' && typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    ),
  );
};

const loadNotificationReadState = (storageKey: string | null): NotificationReadState => {
  if (!storageKey) {
    return EMPTY_NOTIFICATION_READ_STATE;
  }

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return EMPTY_NOTIFICATION_READ_STATE;
    }

    const parsed = JSON.parse(raw) as Partial<NotificationReadState>;
    return {
      posts: sanitizeStringArray(parsed.posts),
      comments: sanitizeStringArray(parsed.comments),
      pending: sanitizeStringArray(parsed.pending),
      threads: sanitizeThreadReadMap(parsed.threads),
    };
  } catch {
    return EMPTY_NOTIFICATION_READ_STATE;
  }
};

const persistNotificationReadState = (storageKey: string | null, readState: NotificationReadState) => {
  if (!storageKey) {
    return;
  }

  localStorage.setItem(storageKey, JSON.stringify(readState));
};

const mergeUnique = (current: string[], incoming: string[]) => Array.from(new Set([...current, ...incoming]));

const getThreadOtherParticipantLabel = (thread: Thread, currentDisplayName: string) =>
  thread.participantNames.filter((name) => name !== currentDisplayName).join(', ') || 'Your thread';

export const usePortalNotifications = (pathname: string) => {
  const { profile, isDemoMode } = useAuth();
  const { notify } = useNotification();

  const myUid = profile?.uid ?? '';
  const myDisplayName = profile?.displayName ?? '';
  const isAdminOrOrganizer = profile?.role === 'admin' || profile?.role === 'organizer';

  const { data: pendingUsers } = usePendingApprovals();
  const { data: posts } = useBulletinPosts();
  const { data: comments } = useBulletinComments();
  const { data: threads } = useThreads(myUid);

  const storageKey = myUid ? `familyreunion:notification_read_state:${myUid}` : null;
  const [storedReadState, setStoredReadState] = useState<{
    key: string | null;
    value: NotificationReadState;
  }>({
    key: null,
    value: EMPTY_NOTIFICATION_READ_STATE,
  });

  const readState = storedReadState.key === storageKey ? storedReadState.value : EMPTY_NOTIFICATION_READ_STATE;
  const readStateLoaded = storedReadState.key === storageKey;

  const baseDocumentTitleRef = useRef('');
  const seenPendingUidsRef = useRef<Set<string>>(new Set());
  const pendingInitializedRef = useRef(false);
  const seenPostIdsRef = useRef<Set<string>>(new Set());
  const postInitializedRef = useRef(false);
  const seenCommentIdsRef = useRef<Set<string>>(new Set());
  const commentInitializedRef = useRef(false);
  const seenThreadActivityRef = useRef<Map<string, number>>(new Map());
  const threadInitializedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void Promise.resolve().then(() => {
      if (cancelled) return;
      setStoredReadState({
        key: storageKey,
        value: loadNotificationReadState(storageKey),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || storedReadState.key !== storageKey) {
      return;
    }

    persistNotificationReadState(storageKey, storedReadState.value);
  }, [storageKey, storedReadState]);

  const updateReadState = useCallback(
    (updater: (current: NotificationReadState) => NotificationReadState) => {
      if (!storageKey) {
        return;
      }

      setStoredReadState((current) => {
        const base = current.key === storageKey ? current.value : loadNotificationReadState(storageKey);
        return {
          key: storageKey,
          value: updater(base),
        };
      });
    },
    [storageKey],
  );

  const markPostsRead = useCallback(
    (postIds: string[]) => {
      if (postIds.length === 0) return;
      updateReadState((current) => ({
        ...current,
        posts: mergeUnique(current.posts, postIds),
      }));
    },
    [updateReadState],
  );

  const markCommentsRead = useCallback(
    (commentIds: string[]) => {
      if (commentIds.length === 0) return;
      updateReadState((current) => ({
        ...current,
        comments: mergeUnique(current.comments, commentIds),
      }));
    },
    [updateReadState],
  );

  const markPendingRead = useCallback(
    (pendingUids: string[]) => {
      if (pendingUids.length === 0) return;
      updateReadState((current) => ({
        ...current,
        pending: mergeUnique(current.pending, pendingUids),
      }));
    },
    [updateReadState],
  );

  const markThreadRead = useCallback(
    (threadId: string, lastMessageAt?: unknown) => {
      if (!threadId) return;

      const readAt = Math.max(toTimestamp(lastMessageAt), Date.now());
      updateReadState((current) => ({
        ...current,
        threads: {
          ...current.threads,
          [threadId]: Math.max(current.threads[threadId] ?? 0, readAt),
        },
      }));
    },
    [updateReadState],
  );

  const pendingItems = useMemo<PortalNotificationItem[]>(() => {
    if (!isAdminOrOrganizer) {
      return [];
    }

    return pendingUsers.map((member) => ({
      id: `pending:${member.uid}`,
      kind: 'join-request',
      title: 'New join request',
      body: `${member.displayName} is waiting for approval.`,
      href: '/app/organizer',
      createdAtLabel: 'Needs review',
      createdAtMs: 0,
      unread: readStateLoaded && !readState.pending.includes(member.uid),
    }));
  }, [isAdminOrOrganizer, pendingUsers, readState.pending, readStateLoaded]);

  const bulletinPostItems = useMemo<PortalNotificationItem[]>(
    () =>
      (posts as BulletinPost[])
        .filter((post) => post.authorUid !== myUid)
        .map((post) => ({
          id: `post:${post.id}`,
          kind: 'bulletin-post',
          title: 'New bulletin post',
          body: `${formatShortAuthor(post.authorName, post.authorUid)} published a new bulletin update.`,
          href: '/app/bulletin',
          createdAtLabel: relativeTime(post.createdAt),
          createdAtMs: toTimestamp(post.createdAt),
          unread: readStateLoaded && !readState.posts.includes(post.id),
        })),
    [myUid, posts, readState.posts, readStateLoaded],
  );

  const bulletinCommentItems = useMemo<PortalNotificationItem[]>(
    () =>
      (comments as BulletinComment[])
        .filter((comment) => extractMentionedUserUids(comment.body).includes(myUid))
        .map((comment) => ({
          id: `comment:${comment.id}`,
          kind: 'bulletin-mention',
          title: 'Bulletin mention',
          body: `${formatShortAuthor(comment.authorName, comment.authorUid)} mentioned you in a bulletin reply.`,
          href: '/app/bulletin',
          createdAtLabel: relativeTime(comment.createdAt),
          createdAtMs: toTimestamp(comment.createdAt),
          unread: readStateLoaded && !readState.comments.includes(comment.id),
        })),
    [comments, myUid, readState.comments, readStateLoaded],
  );

  const directMessageItems = useMemo<PortalNotificationItem[]>(
    () =>
      threads
        .filter((thread) => {
          const lastMessageAtMs = toTimestamp(thread.lastMessageAt);
          if (!thread.lastMessageAuthorUid || thread.lastMessageAuthorUid === myUid || lastMessageAtMs <= 0) {
            return false;
          }

          return lastMessageAtMs > (readStateLoaded ? readState.threads[thread.id] ?? 0 : Number.MAX_SAFE_INTEGER);
        })
        .map((thread) => {
          const senderName =
            thread.lastMessageAuthorName ??
            getThreadOtherParticipantLabel(thread, myDisplayName);

          return {
            id: `thread:${thread.id}`,
            kind: 'direct-message' as const,
            title: `New message from ${senderName}`,
            body: thread.lastMessageText ?? 'Open the conversation to read the latest message.',
            href: `/app/messages/${thread.id}`,
            createdAtLabel: relativeTime(thread.lastMessageAt),
            createdAtMs: toTimestamp(thread.lastMessageAt),
            unread: true,
          };
        }),
    [myDisplayName, myUid, readState.threads, readStateLoaded, threads],
  );

  const items = useMemo(
    () =>
      [...directMessageItems, ...bulletinCommentItems, ...bulletinPostItems, ...pendingItems].sort(
        (left, right) => right.createdAtMs - left.createdAtMs,
      ),
    [bulletinCommentItems, bulletinPostItems, directMessageItems, pendingItems],
  );

  const unreadCount = useMemo(
    () => items.reduce((count, item) => count + (item.unread ? 1 : 0), 0),
    [items],
  );

  const markNotificationRead = useCallback(
    (item: PortalNotificationItem) => {
      if (item.kind === 'bulletin-post') {
        markPostsRead([item.id.replace('post:', '')]);
        return;
      }

      if (item.kind === 'bulletin-mention') {
        markCommentsRead([item.id.replace('comment:', '')]);
        return;
      }

      if (item.kind === 'join-request') {
        markPendingRead([item.id.replace('pending:', '')]);
        return;
      }

      if (item.kind === 'direct-message') {
        const threadId = item.id.replace('thread:', '');
        const thread = threads.find((entry) => entry.id === threadId);
        markThreadRead(threadId, thread?.lastMessageAt);
      }
    },
    [markCommentsRead, markPendingRead, markPostsRead, markThreadRead, threads],
  );

  const markAllRead = useCallback(() => {
    updateReadState((current) => {
      const nextThreads = { ...current.threads };

      for (const thread of threads) {
        const lastMessageAtMs = toTimestamp(thread.lastMessageAt);
        if (lastMessageAtMs > 0) {
          nextThreads[thread.id] = Math.max(nextThreads[thread.id] ?? 0, lastMessageAtMs);
        }
      }

      return {
        posts: mergeUnique(
          current.posts,
          bulletinPostItems.map((item) => item.id.replace('post:', '')),
        ),
        comments: mergeUnique(
          current.comments,
          bulletinCommentItems.map((item) => item.id.replace('comment:', '')),
        ),
        pending: mergeUnique(
          current.pending,
          pendingItems.map((item) => item.id.replace('pending:', '')),
        ),
        threads: nextThreads,
      };
    });
  }, [bulletinCommentItems, bulletinPostItems, pendingItems, threads, updateReadState]);

  useEffect(() => {
    if (!readStateLoaded) {
      return;
    }

    if (pathname.startsWith('/app/bulletin')) {
      void Promise.resolve().then(() => {
        markPostsRead(bulletinPostItems.map((item) => item.id.replace('post:', '')));
        markCommentsRead(bulletinCommentItems.map((item) => item.id.replace('comment:', '')));
      });
      return;
    }

    const threadMatch = pathname.match(/^\/app\/messages\/([^/]+)$/);
    if (threadMatch) {
      const thread = threads.find((entry) => entry.id === threadMatch[1]);
      if (thread) {
        void Promise.resolve().then(() => {
          markThreadRead(thread.id, thread.lastMessageAt);
        });
      }
      return;
    }

    if (pathname.startsWith('/app/organizer') || pathname.startsWith('/app/admin')) {
      void Promise.resolve().then(() => {
        markPendingRead(pendingItems.map((item) => item.id.replace('pending:', '')));
      });
    }
  }, [
    bulletinCommentItems,
    bulletinPostItems,
    markCommentsRead,
    markPendingRead,
    markPostsRead,
    markThreadRead,
    pathname,
    pendingItems,
    readStateLoaded,
    threads,
  ]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    if (!baseDocumentTitleRef.current) {
      baseDocumentTitleRef.current = document.title || 'Family Reunion Portal';
    }

    document.title = unreadCount > 0 ? `(${unreadCount}) ${baseDocumentTitleRef.current}` : baseDocumentTitleRef.current;

    const badgeNavigator = navigator as BadgeNavigator;
    if (unreadCount > 0 && badgeNavigator.setAppBadge) {
      void badgeNavigator.setAppBadge(unreadCount).catch(() => undefined);
      return;
    }

    if (badgeNavigator.clearAppBadge) {
      void badgeNavigator.clearAppBadge().catch(() => undefined);
    }
  }, [unreadCount]);

  useEffect(() => {
    if (isDemoMode) return;
    if (!profile) return;

    const nextPending = new Set(pendingUsers.map((user) => user.uid));

    if (!pendingInitializedRef.current) {
      pendingInitializedRef.current = true;
      seenPendingUidsRef.current = nextPending;
      return;
    }

    if (isAdminOrOrganizer) {
      for (const uid of nextPending) {
        if (!seenPendingUidsRef.current.has(uid)) {
          notify('New join request received.', 'updated');
          maybeSystemNotify('New join request', 'A member request is waiting for approval.');
        }
      }
    }

    seenPendingUidsRef.current = nextPending;
  }, [isAdminOrOrganizer, isDemoMode, notify, pendingUsers, profile]);

  useEffect(() => {
    if (isDemoMode) return;
    if (!profile) return;
    if (!myUid) return;

    const nextPostIds = new Set(posts.map((post) => post.id));

    if (!postInitializedRef.current) {
      if (nextPostIds.size === 0) return;
      postInitializedRef.current = true;
      seenPostIdsRef.current = nextPostIds;
      return;
    }

    for (const post of posts as BulletinPost[]) {
      if (!seenPostIdsRef.current.has(post.id) && post.authorUid !== myUid) {
        const author = formatShortAuthor(post.authorName, post.authorUid);
        const body = `${author} published a new bulletin post.`;
        notify(body, 'updated');
        maybeSystemNotify('New bulletin post', body);
      }
    }

    seenPostIdsRef.current = nextPostIds;
  }, [isDemoMode, myUid, notify, posts, profile]);

  useEffect(() => {
    if (isDemoMode) return;
    if (!profile) return;
    if (!myUid) return;

    const nextCommentIds = new Set(comments.map((comment) => comment.id));

    if (!commentInitializedRef.current) {
      if (nextCommentIds.size === 0) return;
      commentInitializedRef.current = true;
      seenCommentIdsRef.current = nextCommentIds;
      return;
    }

    for (const comment of comments as BulletinComment[]) {
      if (!seenCommentIdsRef.current.has(comment.id) && extractMentionedUserUids(comment.body).includes(myUid)) {
        const author = formatShortAuthor(comment.authorName, comment.authorUid);
        const body = `Bulletin reply by ${author} mentions you.`;
        notify(body, 'updated');
        maybeSystemNotify('You were mentioned', body);
      }
    }

    seenCommentIdsRef.current = nextCommentIds;
  }, [comments, isDemoMode, myUid, notify, profile]);

  useEffect(() => {
    if (isDemoMode) return;
    if (!profile) return;
    if (!myUid) return;

    const nextThreadActivity = new Map(
      threads.map((thread) => [thread.id, toTimestamp(thread.lastMessageAt)]),
    );

    if (!threadInitializedRef.current) {
      threadInitializedRef.current = true;
      seenThreadActivityRef.current = nextThreadActivity;
      return;
    }

    for (const thread of threads) {
      const lastMessageAtMs = toTimestamp(thread.lastMessageAt);
      const previousMessageAtMs = seenThreadActivityRef.current.get(thread.id) ?? 0;
      if (lastMessageAtMs <= previousMessageAtMs) {
        continue;
      }
      if (!thread.lastMessageAuthorUid || thread.lastMessageAuthorUid === myUid) {
        continue;
      }

      const sender =
        thread.lastMessageAuthorName ??
        getThreadOtherParticipantLabel(thread, myDisplayName);
      const body = thread.lastMessageText ?? 'Open the conversation to read the latest message.';
      notify(`New message from ${sender}.`, 'updated');
      maybeSystemNotify(`New message from ${sender}`, body);
    }

    seenThreadActivityRef.current = nextThreadActivity;
  }, [isDemoMode, myDisplayName, myUid, notify, profile, threads]);

  return {
    items,
    unreadCount,
    markAllRead,
    markNotificationRead,
  };
};
