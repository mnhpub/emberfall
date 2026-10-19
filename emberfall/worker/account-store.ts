// D1 implementation of the AccountStore used by accounts.ts. Email uniqueness is enforced by the table, not by a read first.
import type { Account, AccountStore } from "./accounts.ts";

type Row = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  created_at: number;
  failed_logins: number;
  locked_until: number | null;
};

const fromRow = (r: Row): Account => ({
  id: r.id,
  email: r.email,
  displayName: r.display_name,
  passwordHash: r.password_hash,
  createdAt: r.created_at,
  failedLogins: r.failed_logins,
  lockedUntil: r.locked_until,
});

export function d1AccountStore(db: D1Database): AccountStore {
  return {
    async findByEmail(email) {
      const row = await db.prepare("SELECT * FROM accounts WHERE email = ?").bind(email).first<Row>();
      return row ? fromRow(row) : null;
    },
    async insert(a) {
      try {
        await db
          .prepare(
            "INSERT INTO accounts (id, email, display_name, password_hash, created_at, failed_logins, locked_until) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(a.id, a.email, a.displayName, a.passwordHash, a.createdAt, a.failedLogins, a.lockedUntil)
          .run();
        return true;
      } catch (error) {
        // A UNIQUE violation on email means someone registered first. Anything else is a real failure.
        if (error instanceof Error && /UNIQUE/i.test(error.message)) return false;
        throw error;
      }
    },
    async update(a) {
      await db
        .prepare("UPDATE accounts SET failed_logins = ?, locked_until = ? WHERE id = ?")
        .bind(a.failedLogins, a.lockedUntil, a.id)
        .run();
    },
  };
}
