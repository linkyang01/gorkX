/** Letter fallback always; real photo when URL is valid and loads. */
import { useEffect, useState } from 'react';

interface Props {
  /** data: or https avatar when available */
  src?: string | null;
  /** Used for letter fallback */
  label?: string | null;
  guest?: boolean;
  className?: string;
}

function letterOf(label?: string | null): string {
  const s = (label || '?').trim();
  if (!s) return '?';
  return s.slice(0, 1).toUpperCase();
}

export function AccountAvatar({ src, label, guest, className }: Props) {
  const letter = letterOf(label);
  const url = (src || '').trim();
  const hasSrc =
    url.startsWith('data:image/') || url.startsWith('https://') || url.startsWith('http://');
  // Hide broken/empty photo and keep letter underneath
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  const showImg = hasSrc && !failed;

  return (
    <span
      className={[guest ? 'account-avatar guest' : 'account-avatar', className || '']
        .filter(Boolean)
        .join(' ')}
      aria-hidden
    >
      <span className="account-avatar-letter">{letter}</span>
      {showImg ? (
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}