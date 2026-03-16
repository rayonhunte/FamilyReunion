import { createContext } from 'react';

export type NotificationVariant = 'saved' | 'updated' | 'deleted' | 'error';

type NotificationState = {
  message: string;
  variant: NotificationVariant;
} | null;

export type NotificationContextValue = {
  notify: (message: string, variant?: NotificationVariant) => void;
  notification: NotificationState;
  clearNotification: () => void;
};

export const NotificationContext = createContext<NotificationContextValue | null>(null);
