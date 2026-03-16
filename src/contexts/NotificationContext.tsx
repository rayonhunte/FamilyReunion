import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { NotificationContext } from './notification-context';

const AUTO_DISMISS_MS = 3200;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<{
    message: string;
    variant: 'saved' | 'updated' | 'deleted' | 'error';
  } | null>(null);

  const clearNotification = useCallback(() => setNotification(null), []);

  const notify = useCallback(
    (message: string, variant: 'saved' | 'updated' | 'deleted' | 'error' = 'saved') => {
      setNotification({ message, variant });
    },
    [],
  );

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(clearNotification, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [notification, clearNotification]);

  return (
    <NotificationContext.Provider value={{ notify, notification, clearNotification }}>
      {children}
      {notification ? (
        <div
          className="notification-modal-backdrop"
          onClick={clearNotification}
          role="presentation"
          aria-hidden="false"
        >
          <div
            className={`notification-modal notification-modal--${notification.variant}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-title"
            aria-describedby="notification-message"
          >
            <div className="notification-modal-inner">
              <p id="notification-title" className="notification-modal-title">
                {notification.variant === 'saved' && 'Saved'}
                {notification.variant === 'updated' && 'Updated'}
                {notification.variant === 'deleted' && 'Removed'}
                {notification.variant === 'error' && 'Notice'}
              </p>
              <p id="notification-message" className="notification-modal-message">
                {notification.message}
              </p>
              <button
                type="button"
                className="ghost-button notification-modal-dismiss"
                onClick={clearNotification}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </NotificationContext.Provider>
  );
}
