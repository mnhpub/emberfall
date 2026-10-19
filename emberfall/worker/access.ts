// Room access controlled by the host: kick (temporary, the player may return) and ban (until the host lifts it).
// Rooms are not moderated automatically. Only the host acts, and the host cannot be removed.

export type Removal = { accountId: string; kind: "kick" | "ban"; by: string; reason: string; until: number | null; at: number };
export type RoomAccess = { host: string; removals: Removal[] };

export const KICK_MS = 10 * 60 * 1000;

export const createRoomAccess = (host: string): RoomAccess => ({ host, removals: [] });

// The current removal for a player, if any. A kick ends by time; a ban has no end until lifted.
export function activeRemoval(access: RoomAccess, accountId: string, now: number): Removal | null {
  const found = access.removals.filter((r) => r.accountId === accountId).at(-1);
  if (!found) return null;
  if (found.until !== null && now >= found.until) return null;
  return found;
}

export function removePlayer(
  access: RoomAccess,
  actor: string,
  target: string,
  kind: "kick" | "ban",
  reason: string,
  now: number,
): { ok: true; access: RoomAccess } | { ok: false; error: string } {
  if (actor !== access.host) return { ok: false, error: "Only the room host can remove players." };
  if (target === access.host) return { ok: false, error: "The host cannot be removed from their own room." };
  if (!reason.trim()) return { ok: false, error: "Give a reason so the player knows why." };
  const removal: Removal = {
    accountId: target,
    kind,
    by: actor,
    reason: reason.trim().slice(0, 200),
    until: kind === "kick" ? now + KICK_MS : null,
    at: now,
  };
  return { ok: true, access: { ...access, removals: [...access.removals, removal] } };
}

// Lifts a ban. A kick needs no lifting; it ends on its own.
export function unban(access: RoomAccess, actor: string, target: string): { ok: true; access: RoomAccess } | { ok: false; error: string } {
  if (actor !== access.host) return { ok: false, error: "Only the room host can lift a ban." };
  const current = activeRemoval(access, target, Number.MAX_SAFE_INTEGER);
  if (!current || current.kind !== "ban") return { ok: false, error: "That player is not banned." };
  return { ok: true, access: { ...access, removals: [...access.removals, { ...current, kind: "kick", until: 0, at: current.at }] } };
}

// Room chat guard: a removed player cannot post until the removal ends.
export function canPostInRoom(access: RoomAccess, accountId: string, now: number): { ok: true } | { ok: false; error: string } {
  const removal = activeRemoval(access, accountId, now);
  if (!removal) return { ok: true };
  if (removal.kind === "ban") return { ok: false, error: `You are banned from this room: ${removal.reason}` };
  return { ok: false, error: `You were removed from this room until ${new Date(removal.until!).toISOString()}: ${removal.reason}` };
}
