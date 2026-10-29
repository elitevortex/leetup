// "use a `Map` here" -> [{ text: 'use a ' }, { text: 'Map', code: true }, { text: ' here' }]
export function splitCode(text: string): { text: string; code?: boolean }[] {
  return text
    .split(/`([^`\n]+)`/)
    .map((part, i) => (i % 2 === 1 ? { text: part, code: true } : { text: part }))
    .filter((p) => p.text.length > 0);
}

// Same rule as the database's comment_mentions(): @ not glued to a word, then a valid username
const MENTION = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])/g;

export type CommentPart = { text: string; code?: boolean; mention?: string };

// Code spans first, so `@decorator` inside backticks stays code
export function splitComment(text: string): CommentPart[] {
  const out: CommentPart[] = [];
  for (const part of splitCode(text)) {
    if (part.code) {
      out.push(part);
      continue;
    }
    let last = 0;
    for (const m of part.text.matchAll(MENTION)) {
      const at = m.index! + m[1].length;
      if (at > last) out.push({ text: part.text.slice(last, at) });
      out.push({ text: `@${m[2]}`, mention: m[2].toLowerCase() });
      last = at + m[2].length + 1;
    }
    if (last < part.text.length) out.push({ text: part.text.slice(last) });
  }
  return out;
}

// The "@partial" being typed right before the cursor, if any: "hi @fr|" -> { start: 3, query: 'fr' }
export function activeMention(text: string, cursor: number): { start: number; query: string } | null {
  const m = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{0,20})$/.exec(text.slice(0, cursor));
  return m ? { start: m.index + m[1].length, query: m[2].toLowerCase() } : null;
}
