import type { FormEvent } from 'react';

import type { DirectoryMember } from '../types/models';

export function QuickMessageModal({
  member,
  text,
  sending,
  onTextChange,
  onSubmit,
  onClose,
}: {
  member: DirectoryMember | null;
  text: string;
  sending: boolean;
  onTextChange: (next: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onClose: () => void;
}) {
  if (!member) {
    return null;
  }

  return (
    <div className="notification-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="notification-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="notification-modal-inner">
          <h2 className="notification-modal-title">Quick message</h2>
          <p className="notification-modal-message">To {member.displayName}</p>
          <form onSubmit={(event) => void onSubmit(event)}>
            <label className="full-span">
              Message
              <textarea
                value={text}
                onChange={(event) => onTextChange(event.target.value)}
                rows={4}
                placeholder="Type your message"
              />
            </label>
            <div className="stack-row full-span">
              <button className="cta-button" type="submit" disabled={sending || !text.trim()}>
                Send
              </button>
              <button className="ghost-button" type="button" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

