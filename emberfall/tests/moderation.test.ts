import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moderateLobby, type Classifier } from '../worker/moderation.ts';

const verdict = (label: 'ok' | 'abuse' | 'spam', score: number): Classifier => async () => ({ label, score });
const failing: Classifier = async () => { throw new Error('model unavailable'); };
const neverCalled: Classifier = async () => { throw new Error('should not be called'); };

test('rules block obvious spam before any model is consulted', async () => {
  assert.equal((await moderateLobby('aaaaaaaaaaaaaaaaaa', neverCalled)).action, 'block');
  assert.equal((await moderateLobby('see http://a.io http://b.io http://c.io', neverCalled)).action, 'block');
  assert.equal((await moderateLobby('THIS IS BEING SHOUTED FOR A LONG TIME', neverCalled)).action, 'block');
});

test('clean messages are allowed when the classifier says ok', async () => {
  assert.deepEqual(await moderateLobby('anyone sailing north?', verdict('ok', 0.99)), { action: 'allow' });
});

test('the classifier score decides between allow, hold and block', async () => {
  assert.equal((await moderateLobby('hello', verdict('abuse', 0.4))).action, 'allow', 'low confidence is not acted on');
  const held = await moderateLobby('hello', verdict('abuse', 0.6));
  assert.equal(held.action, 'hold');
  const blocked = await moderateLobby('hello', verdict('abuse', 0.9));
  assert.equal(blocked.action, 'block');
  assert.equal((blocked as { source: string }).source, 'classifier');
});

test('a classifier outage holds the message rather than posting it unchecked', async () => {
  const d = await moderateLobby('hello there', failing);
  assert.deepEqual(d, { action: 'hold', reason: 'Moderation is unavailable. Try again shortly.', source: 'unavailable' });
});
