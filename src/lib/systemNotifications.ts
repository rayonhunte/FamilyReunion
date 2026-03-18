export async function requestSystemNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') {
    return 'denied';
  }

  return await Notification.requestPermission();
}

export function maybeSystemNotify(title: string, body: string): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  try {
    new Notification(title, { body });
  } catch {
    // Ignore failures (user settings, unsupported environment, etc.)
  }
}

