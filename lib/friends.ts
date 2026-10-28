// Helpers for the friends + QR screens

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function profileUrl(username: string): string {
  return `https://leetup.app/u/${username}`;
}

// Accepts https://leetup.app/u/<username> or leetup://u/<username>, returns the username or null
export function parseLeetUpCode(data: string): string | null {
  const m = data.trim().match(/^(?:https:\/\/leetup\.app\/u\/|leetup:\/\/u\/)([a-z0-9_]{3,20})\/?$/i);
  return m ? m[1].toLowerCase() : null;
}

// Whole days since an ISO timestamp: "today", "1d", "12d"
export function daysAgo(iso: string, now = Date.now()): string {
  const days = Math.max(0, Math.floor((now - Date.parse(iso)) / 86400000));
  return days === 0 ? 'today' : `${days}d`;
}
