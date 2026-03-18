import { useEffect, useRef } from 'react';
import { useNotification } from '../contexts/useNotification';
import { useAuth } from '../hooks/useAuth';
import { usePendingApprovals, useBulletinPosts, useBulletinComments } from '../lib/firestore';
import { env } from '../lib/env';
import { maybeSystemNotify } from '../lib/systemNotifications';
import type { BulletinComment, BulletinPost } from '../types/models';

const extractMentionedUserUids = (text: string): string[] => {
  // Token format: @[user:UID:Label]
  const re = /@\[(user):([^:\]]+):([^\]]+)\]/g;
  const uids: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    uids.push(match[2]);
  }
  return Array.from(new Set(uids));
};

const formatShortAuthor = (authorName?: string, authorUid?: string) => {
  if (authorName) return authorName;
  if (authorUid) return authorUid;
  return 'Someone';
};

export function NotificationHub() {
  const { profile, isDemoMode } = useAuth();
  const { notify } = useNotification();

  const { data: pendingUsers } = usePendingApprovals();
  const { data: posts } = useBulletinPosts();
  const { data: comments } = useBulletinComments();

  const myUid = profile?.uid ?? '';
  const isAdminOrOrganizer = profile?.role === 'admin' || profile?.role === 'organizer';

  const seenPendingUidsRef = useRef<Set<string>>(new Set());
  const pendingInitializedRef = useRef(false);

  const seenPostIdsRef = useRef<Set<string>>(new Set());
  const postInitializedRef = useRef(false);

  const seenCommentIdsRef = useRef<Set<string>>(new Set());
  const commentInitializedRef = useRef(false);

  const buildId = env.buildId;

  // Build/version notification (in-app + phone if permitted).
  useEffect(() => {
    if (isDemoMode) return;
    if (!profile) return;
    if (!buildId) return;

    const key = 'familyreunion:last_build_id';
    const last = localStorage.getItem(key);

    // Only notify when we have an existing value and the build changed.
    if (last && last !== buildId) {
      const title = 'New version available';
      const body = `Build ${buildId}. Please refresh the page.`;
      notify(body, 'updated');
      maybeSystemNotify(title, body);
    }

    localStorage.setItem(key, buildId);
  }, [buildId, isDemoMode, notify, profile]);

  // Join requests: admins/organizers only (everywhere, not tied to screen).
  useEffect(() => {
    if (isDemoMode) return;
    if (!profile) return;

    const nextPending = new Set(pendingUsers.map((u) => u.uid));

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

  // Bulletin posts: everyone except the author.
  useEffect(() => {
    if (isDemoMode) return;
    if (!profile) return;
    if (!myUid) return;

    const nextPostIds = new Set(posts.map((p) => p.id));

    if (!postInitializedRef.current) {
      postInitializedRef.current = true;
      seenPostIdsRef.current = nextPostIds;
      return;
    }

    for (const post of posts as BulletinPost[]) {
      if (!seenPostIdsRef.current.has(post.id)) {
        if (post.authorUid !== myUid) {
          const author = formatShortAuthor(post.authorName, post.authorUid);
          const title = 'New bulletin post';
          const body = `${author} published a new bulletin post.`;
          notify(body, 'updated');
          maybeSystemNotify(title, body);
        }
      }
    }

    seenPostIdsRef.current = nextPostIds;
  }, [isDemoMode, myUid, notify, posts, profile]);

  // Bulletin replies/comments (@reply): only the mentioned user gets notified.
  useEffect(() => {
    if (isDemoMode) return;
    if (!profile) return;
    if (!myUid) return;

    const nextCommentIds = new Set(comments.map((c) => c.id));

    if (!commentInitializedRef.current) {
      commentInitializedRef.current = true;
      seenCommentIdsRef.current = nextCommentIds;
      return;
    }

    for (const comment of comments as BulletinComment[]) {
      if (!seenCommentIdsRef.current.has(comment.id)) {
        const mentionedUids = extractMentionedUserUids(comment.body);
        if (mentionedUids.includes(myUid)) {
          const author = formatShortAuthor(comment.authorName, comment.authorUid);
          const title = 'You were mentioned';
          const body = `Bulletin reply by ${author} mentions you.`;
          notify(body, 'updated');
          maybeSystemNotify(title, body);
        }
      }
    }

    seenCommentIdsRef.current = nextCommentIds;
  }, [comments, isDemoMode, myUid, notify, profile]);

  // This component is intentionally headless.
  return null;
}

