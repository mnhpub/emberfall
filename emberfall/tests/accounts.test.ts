import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register, signIn, hashPassword, verifyPassword, validatePassword, validateDisplayName, validateEmail, type Account, type AccountStore } from '../worker/accounts.ts';

function memoryStore(): AccountStore & { all: Account[] } {
  const all: Account[] = [];
  return {
    all,
    async findByEmail(email) { return all.find((a) => a.email === email) ?? null; },
    async insert(a) { if (all.some((x) => x.email === a.email)) return false; all.push(a); return true; },
    async update(a) { const i = all.findIndex((x) => x.id === a.id); all[i] = a; },
  };
}
const GOOD = 'correct horse battery';
let n = 0;
const id = () => `acct-${++n}`;

test('passwords are stored as salted, iterated hashes and verify only with the right password', async () => {
  const stored = await hashPassword(GOOD, 1000);
  assert.match(stored, /^pbkdf2-sha256\$1000\$/);
  assert.notEqual(await hashPassword(GOOD, 1000), stored, 'salts differ per hash');
  assert.equal(await verifyPassword(GOOD, stored), true);
  assert.equal(await verifyPassword('wrong password here', stored), false);
  assert.equal(await verifyPassword(GOOD, 'not-a-hash'), false);
});

test('registration validates input and never stores the plain password', async () => {
  const store = memoryStore();
  const short = await register(store, { email: 'a@b.co', password: 'short', displayName: 'player_one' }, 0, id);
  assert.equal(short.ok, false);
  assert.match((short as { error: string }).error, /at least 12/);
  const ok = await register(store, { email: ' Crew@Example.com ', password: GOOD, displayName: 'crew_1' }, 5, id);
  assert.equal(ok.ok, true);
  assert.equal(store.all[0].email, 'crew@example.com', 'emails are normalised');
  assert.notEqual(store.all[0].passwordHash, GOOD);
  assert.ok(!JSON.stringify(ok).includes('passwordHash'), 'the response omits the hash');
});

test('a second registration with the same email is refused', async () => {
  const store = memoryStore();
  await register(store, { email: 'x@y.io', password: GOOD, displayName: 'first' }, 0, id);
  const again = await register(store, { email: 'X@y.io', password: GOOD, displayName: 'second' }, 0, id);
  assert.deepEqual(again, { ok: false, error: 'An account already uses that email.' });
});

test('sign-in succeeds with the right password and fails the same way for every wrong input', async () => {
  const store = memoryStore();
  const made = await register(store, { email: 'p@q.io', password: GOOD, displayName: 'pilot' }, 0, id);
  assert.equal(made.ok, true);
  assert.deepEqual(await signIn(store, { email: 'p@q.io', password: GOOD }, 1), { ok: true, accountId: (made as { account: { id: string } }).account.id });
  const wrongPassword = await signIn(store, { email: 'p@q.io', password: 'nope nope nope' }, 1);
  const unknownEmail = await signIn(store, { email: 'nobody@q.io', password: GOOD }, 1);
  assert.deepEqual(wrongPassword, unknownEmail, 'the response does not reveal whether the email exists');
});

test('repeated failures lock the account for a while, and a correct password after the lock works', async () => {
  const store = memoryStore();
  await register(store, { email: 'l@q.io', password: GOOD, displayName: 'locky' }, 0, id);
  for (let i = 0; i < 5; i++) await signIn(store, { email: 'l@q.io', password: 'wrong wrong wrong' }, 100);
  const locked = await signIn(store, { email: 'l@q.io', password: GOOD }, 200);
  assert.equal(locked.ok, false);
  assert.match((locked as { error: string }).error, /Too many failed attempts/);
  const later = await signIn(store, { email: 'l@q.io', password: GOOD }, 100 + 15 * 60 * 1000 + 1);
  assert.equal(later.ok, true);
});

test('validation rules for passwords and display names', () => {
  assert.equal(validatePassword('x'.repeat(12)), null);
  assert.match(validatePassword('x'.repeat(300)) ?? '', /at most/);
  assert.equal(validateDisplayName('ok_name-1'), null);
  assert.match(validateDisplayName('no spaces') ?? '', /Display names/);
  assert.match(validateEmail('not-an-email') ?? '', /valid email/);
});
