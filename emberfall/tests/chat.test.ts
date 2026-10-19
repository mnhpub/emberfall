import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyLog, post, remove, visible, cleanText, RATE_MAX, RATE_WINDOW_MS, HISTORY_LIMIT, MAX_MESSAGE } from '../worker/chat.ts';

let n = 0;
const send = (log: ReturnType<typeof emptyLog>, author: string, text: string, now: number) => {
  const r = post(log, { id: `m${++n}`, authorId: author, name: author, text }, now);
  if (!r.ok) throw new Error(r.error);
  return r.log;
};

test('text is cleaned of control characters and must be non-empty and under the limit', () => {
  assert.deepEqual(cleanText('  hi\u0007 there\n '), { ok: true, text: 'hi there' });
  assert.equal(cleanText(' \n\t ').ok, false);
  assert.equal(cleanText('x'.repeat(MAX_MESSAGE)).ok, true);
  assert.equal(cleanText('x'.repeat(MAX_MESSAGE + 1)).ok, false);
});

test('messages are appended in order and each author is rate limited within the window', () => {
  let log = emptyLog('lobby');
  for (let i = 0; i < RATE_MAX; i++) log = send(log, 'ann', `hello ${i}`, 1000 + i);
  assert.equal(log.messages.length, RATE_MAX);
  const blocked = post(log, { id: 'x', authorId: 'ann', name: 'ann', text: 'one more' }, 1100);
  assert.deepEqual(blocked, { ok: false, error: 'Slow down: too many messages in a few seconds.' });
  const other = send(log, 'bob', 'not limited by ann', 1100);
  assert.equal(other.messages.at(-1)!.authorId, 'bob');
  const later = send(log, 'ann', 'after the window', 1000 + RATE_WINDOW_MS + 10);
  assert.equal(later.messages.at(-1)!.text, 'after the window');
});

test('history is bounded, and idle authors do not accumulate rate entries', () => {
  let log = emptyLog('lobby');
  for (let i = 0; i < HISTORY_LIMIT + 5; i++) log = send(log, `user${i}`, `m${i}`, i);
  assert.equal(log.messages.length, HISTORY_LIMIT);
  assert.equal(log.messages[0].text, 'm5', 'the oldest messages fall off first');
  const quiet = send(log, 'last', 'hello', RATE_WINDOW_MS * 10);
  assert.deepEqual(Object.keys(quiet.recent), ['last'], 'expired entries are dropped');
});

test('moderators can remove anyone’s message, authors only their own, and removed messages stay removed', () => {
  let log = emptyLog('room-7');
  log = send(log, 'ann', 'first', 1);
  log = send(log, 'bob', 'second', 2);
  const annsMessage = log.messages[0].id;
  const bobsMessage = log.messages[1].id;
  assert.deepEqual(remove(log, annsMessage, { id: 'bob', moderator: false }), { ok: false, error: 'You can only remove your own messages.' });
  const byAuthor = remove(log, bobsMessage, { id: 'bob', moderator: false });
  assert.equal(byAuthor.ok, true);
  const removedByAuthor = (byAuthor as { log: typeof log }).log;
  const byModerator = remove(removedByAuthor, annsMessage, { id: 'mod', moderator: true });
  assert.equal(byModerator.ok, true);
  const after = (byModerator as { log: typeof log }).log;
  assert.deepEqual(visible(after), []);
  assert.equal(remove(after, annsMessage, { id: 'mod', moderator: true }).ok, false, 'a removed message cannot be removed twice');
  assert.ok(after.removed.includes(annsMessage), 'removal is remembered');
});
