const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const rem10 = n % 10;
  return `${n}${rem10 === 1 ? 'st' : rem10 === 2 ? 'nd' : rem10 === 3 ? 'rd' : 'th'}`;
}

function clock(d: Date): string {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m}${h < 12 ? 'am' : 'pm'}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// "Today at 7:41am", "Yesterday at 8:53pm", otherwise "Oct 23rd, 2026 at 1:34pm"
export function formatTimestamp(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return `Today at ${clock(d)}`;
  if (sameDay(d, yesterday)) return `Yesterday at ${clock(d)}`;
  return `${MONTHS[d.getMonth()]} ${ordinal(d.getDate())}, ${d.getFullYear()} at ${clock(d)}`;
}

// 754 -> "12:34", 3754 -> "1:02:34"
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// LeetCode language ids -> short labels for stats rows
const LANGS: Record<string, string> = {
  python3: 'py3', python: 'py', cpp: 'cpp', java: 'java', javascript: 'js', typescript: 'ts',
  golang: 'go', rust: 'rust', c: 'c', csharp: 'c#', kotlin: 'kt', swift: 'swift', ruby: 'rb', scala: 'scala', php: 'php',
};
export function shortLang(lang: string | null): string {
  if (!lang) return '—';
  return LANGS[lang] ?? lang.slice(0, 5);
}

// Pace compares a solve to typical times for its difficulty
export function pace(seconds: number | null, difficulty: 'Easy' | 'Medium' | 'Hard'): string {
  if (seconds == null) return '—';
  const [fast, slow] = { Easy: [8 * 60, 20 * 60], Medium: [20 * 60, 45 * 60], Hard: [35 * 60, 75 * 60] }[difficulty];
  return seconds <= fast ? 'fast' : seconds <= slow ? 'avg' : 'slow';
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// Time left until the user's local midnight, e.g. "14h 19m"
export function untilMidnight(now = new Date()): string {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const mins = Math.max(0, Math.round((midnight.getTime() - now.getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
