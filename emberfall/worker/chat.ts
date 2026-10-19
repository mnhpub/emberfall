// Chat logs for a room or the global lobby. Pure: each change returns a new log.
// A room owns its log; the lobby is one shared log. Only the log's rules live here, not transport or storage.

export const MAX_MESSAGE = 300;
export const HISTORY_LIMIT = 200;
export const RATE_WINDOW_MS = 10_000;
export const RATE_MAX = 5;
export const REMOVED_LIMIT = 1000;

export type ChatMessage = { id: string; authorId: string; name: string; text: string; at: number };
export type ChatLog = {
  scope: string; // "lobby" or a room id
  messages: ChatMessage[]; // oldest first, at most HISTORY_LIMIT
  recent: Record<string, number[]>; // author id -> send times inside the rate window
  removed: string[]; // ids removed by a moderator, so a replay cannot restore them
};

export const emptyLog = (scope: string): ChatLog => ({ scope, messages: [], recent: {}, removed: [] });

// Strips control characters and surrounding space. Rejects anything empty or too long after that.
export function cleanText(input: string): { ok: true; text: string } | { ok: false; error: string } {
  // Control characters (including newlines and tabs) carry no chat content and are removed.
  const text = input.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (text.length === 0) return { ok: false, error: "Type a message first." };
  if (text.length > MAX_MESSAGE) return { ok: false, error: `Keep messages under ${MAX_MESSAGE} characters.` };
  return { ok: true, text };
}

export type PostResult = { ok: true; log: ChatLog; message: ChatMessage } | { ok: false; error: string };

export function post(
  log: ChatLog,
  input: { id: string; authorId: string; name: string; text: string },
  now: number,
): PostResult {
  const cleaned = cleanText(input.text);
  if (!cleaned.ok) return cleaned;
  const windowStart = now - RATE_WINDOW_MS;
  const sent = (log.recent[input.authorId] ?? []).filter((t) => t > windowStart);
  if (sent.length >= RATE_MAX) return { ok: false, error: "Slow down: too many messages in a few seconds." };
  const message: ChatMessage = { id: input.id, authorId: input.authorId, name: input.name, text: cleaned.text, at: now };
  const messages = [...log.messages, message].slice(-HISTORY_LIMIT);
  // Forget rate entries that have left the window, so idle authors do not accumulate.
  const recent: Record<string, number[]> = {};
  for (const [author, times] of Object.entries(log.recent)) {
    const live = times.filter((t) => t > windowStart);
    if (live.length) recent[author] = live;
  }
  recent[input.authorId] = [...sent, now];
  return { ok: true, message, log: { ...log, messages, recent } };
}

// Moderators may remove any message in their scope. Everyone else may only remove their own.
export function remove(
  log: ChatLog,
  messageId: string,
  actor: { id: string; moderator: boolean },
): { ok: true; log: ChatLog } | { ok: false; error: string } {
  const target = log.messages.find((m) => m.id === messageId);
  if (!target) return { ok: false, error: "That message is no longer in the log." };
  if (!actor.moderator && target.authorId !== actor.id) return { ok: false, error: "You can only remove your own messages." };
  return {
    ok: true,
    log: {
      ...log,
      messages: log.messages.filter((m) => m.id !== messageId),
      removed: [...log.removed, messageId].slice(-REMOVED_LIMIT),
    },
  };
}

// Messages a newly joined client should see: the log as it is now, minus anything removed.
export function visible(log: ChatLog): ChatMessage[] {
  return log.messages.filter((m) => !log.removed.includes(m.id));
}
