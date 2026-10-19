// Player accounts: registration and sign-in with salted, iterated password hashes.
// Pure logic over a store interface, so the same code runs in tests and against D1. Web Crypto only.

export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSWORD = 12;
export const MAX_PASSWORD = 256;
const LOCK_AFTER_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

export type Account = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: number;
  failedLogins: number;
  lockedUntil: number | null;
};

export interface AccountStore {
  findByEmail(email: string): Promise<Account | null>;
  // Returns false when the email is already taken, so two registrations cannot both succeed.
  insert(account: Account): Promise<boolean>;
  update(account: Account): Promise<void>;
}

const enc = new TextEncoder();

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits) as Uint8Array<ArrayBuffer>;
}

// Stored form: pbkdf2-sha256$iterations$salt$hash, all salts and hashes base64.
export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16) as Uint8Array<ArrayBuffer>);
  const hash = await derive(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2-sha256" || !iterations || !salt || !hash) return false;
  const expected = fromBase64(hash);
  const actual = await derive(password, fromBase64(salt), Number(iterations));
  // Compare every byte so the time taken does not reveal where two hashes differ.
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < Math.min(actual.length, expected.length); i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  const e = normalizeEmail(email);
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Enter a valid email address.";
  return null;
}

export function validatePassword(password: string): string | null {
  const bytes = enc.encode(password).length;
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (bytes > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} bytes.`;
  return null;
}

export function validateDisplayName(name: string): string | null {
  if (!/^[A-Za-z0-9_-]{3,24}$/.test(name)) return "Display names are 3 to 24 letters, digits, _ or -.";
  return null;
}

export type RegisterResult = { ok: true; account: Omit<Account, "passwordHash"> } | { ok: false; error: string };

export async function register(
  store: AccountStore,
  input: { email: string; password: string; displayName: string },
  now: number,
  newId: () => string,
): Promise<RegisterResult> {
  const problem = validateEmail(input.email) ?? validatePassword(input.password) ?? validateDisplayName(input.displayName);
  if (problem) return { ok: false, error: problem };
  const email = normalizeEmail(input.email);
  const account: Account = {
    id: newId(),
    email,
    displayName: input.displayName,
    passwordHash: await hashPassword(input.password),
    createdAt: now,
    failedLogins: 0,
    lockedUntil: null,
  };
  if (!(await store.insert(account))) return { ok: false, error: "An account already uses that email." };
  const { passwordHash: _hash, ...safe } = account;
  return { ok: true, account: safe };
}

// Every failure returns the same message, so the response does not reveal whether an email has an account.
const BAD_LOGIN = "Email or password is incorrect.";

export type SignInResult = { ok: true; accountId: string } | { ok: false; error: string };

export async function signIn(
  store: AccountStore,
  input: { email: string; password: string },
  now: number,
): Promise<SignInResult> {
  const account = await store.findByEmail(normalizeEmail(input.email));
  if (!account) {
    // Spend the same time as a real check so an unknown email is not faster to reject.
    await hashPassword(input.password);
    return { ok: false, error: BAD_LOGIN };
  }
  if (account.lockedUntil !== null && now < account.lockedUntil)
    return { ok: false, error: "Too many failed attempts. Try again in a few minutes." };
  if (!(await verifyPassword(input.password, account.passwordHash))) {
    const failed = account.failedLogins + 1;
    await store.update({
      ...account,
      failedLogins: failed >= LOCK_AFTER_FAILURES ? 0 : failed,
      lockedUntil: failed >= LOCK_AFTER_FAILURES ? now + LOCK_MS : null,
    });
    return { ok: false, error: BAD_LOGIN };
  }
  await store.update({ ...account, failedLogins: 0, lockedUntil: null });
  return { ok: true, accountId: account.id };
}
