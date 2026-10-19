import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoomAccess, removePlayer, unban, canPostInRoom, activeRemoval, KICK_MS } from '../worker/access.ts';

const host = 'host-1';
const guest = 'guest-2';
const T = 1_000_000;

test('only the host can kick or ban, and the host cannot be removed', () => {
  const room = createRoomAccess(host);
  assert.equal(removePlayer(room, guest, guest, 'kick', 'spam', T).ok, false);
  assert.equal(removePlayer(room, host, host, 'ban', 'oops', T).ok, false);
  assert.equal(removePlayer(room, host, guest, 'kick', '   ', T).ok, false, 'a reason is required');
});

test('a kick ends by itself, so the player can return', () => {
  let room = (removePlayer(createRoomAccess(host), host, guest, 'kick', 'too loud', T) as { access: ReturnType<typeof createRoomAccess> }).access;
  assert.equal(canPostInRoom(room, guest, T + 1).ok, false);
  assert.match((canPostInRoom(room, guest, T + 1) as { error: string }).error, /removed from this room until/);
  assert.equal(canPostInRoom(room, guest, T + KICK_MS).ok, true, 'the kick is over');
  assert.equal(activeRemoval(room, guest, T + KICK_MS), null);
});

test('a ban holds until the host lifts it, and lifting a kick is refused', () => {
  let room = (removePlayer(createRoomAccess(host), host, guest, 'ban', 'harassment', T) as { access: ReturnType<typeof createRoomAccess> }).access;
  assert.equal(canPostInRoom(room, guest, T + 10 * KICK_MS).ok, false, 'a ban outlasts a kick duration');
  assert.match((canPostInRoom(room, guest, T) as { error: string }).error, /banned from this room: harassment/);
  assert.equal(unban(room, guest, guest).ok, false, 'only the host lifts bans');
  room = (unban(room, host, guest) as { access: typeof room }).access;
  assert.equal(canPostInRoom(room, guest, T + 1).ok, true);
  assert.equal(unban(room, host, guest).ok, false, 'nothing to lift now');
});

test('a player can be kicked again after returning, and the latest removal governs', () => {
  let room = createRoomAccess(host);
  room = (removePlayer(room, host, guest, 'kick', 'first', T) as { access: typeof room }).access;
  room = (removePlayer(room, host, guest, 'ban', 'second', T + KICK_MS + 5) as { access: typeof room }).access;
  assert.equal(activeRemoval(room, guest, T + KICK_MS + 6)!.kind, 'ban');
});
