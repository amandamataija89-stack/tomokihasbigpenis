import { createHash, randomBytes } from "node:crypto";
import { pool } from "./db";
import { passwordReset, sendEmail, staffInvite } from "./email";
import { hashPassword } from "./password";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const MIN_PASSWORD_LENGTH = 12;

async function newToken(staffId: string, hours: number): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await pool.query("DELETE FROM password_tokens WHERE expires_at < now()");
  await pool.query(
    "INSERT INTO password_tokens (token_hash, staff_id, expires_at) VALUES ($1, $2, now() + make_interval(hours => $3))",
    [sha256(token), staffId, hours],
  );
  return token;
}

export async function sendInvite(staffId: string, invitedBy: string): Promise<void> {
  const { rows } = await pool.query<{ email: string; name: string }>("SELECT email, name FROM staff WHERE id = $1", [staffId]);
  if (!rows[0]) return;
  await sendEmail(staffInvite(rows[0].email, rows[0].name, await newToken(staffId, 7 * 24), invitedBy));
}

/** Emails a reset link if the address has a login. Says nothing either way, so addresses can't be probed. */
export async function sendPasswordReset(email: string): Promise<void> {
  const { rows } = await pool.query<{ id: string; name: string }>("SELECT id, name FROM staff WHERE email = $1", [
    email.trim().toLowerCase(),
  ]);
  if (!rows[0]) return;
  await sendEmail(passwordReset(email, rows[0].name, await newToken(rows[0].id, 1)));
}

export async function tokenOwner(token: string): Promise<{ id: string; name: string; email: string } | null> {
  const { rows } = await pool.query<{ id: string; name: string; email: string }>(
    `SELECT s.id, s.name, s.email FROM password_tokens t JOIN staff s ON s.id = t.staff_id
     WHERE t.token_hash = $1 AND t.expires_at > now()`,
    [sha256(token)],
  );
  return rows[0] ?? null;
}

/** Sets the password and uses up every link for that person; signs them out elsewhere. */
export async function setPasswordWithToken(token: string, password: string): Promise<string | null> {
  const owner = await tokenOwner(token);
  if (!owner) return null;
  await pool.query("UPDATE staff SET password_hash = $2 WHERE id = $1", [owner.id, hashPassword(password)]);
  await pool.query("DELETE FROM password_tokens WHERE staff_id = $1", [owner.id]);
  await pool.query("DELETE FROM staff_sessions WHERE staff_id = $1", [owner.id]);
  return owner.id;
}

/** True once someone can sign in as an admin; the first-admin setup page then closes for good. */
export async function adminExists(): Promise<boolean> {
  const { rows } = await pool.query("SELECT 1 FROM staff WHERE role = 'admin' AND password_hash <> '!' LIMIT 1");
  return rows.length > 0;
}

/** Creates the first admin. Returns their id, or null if an admin already exists. */
export async function createFirstAdmin(name: string, email: string, password: string): Promise<string | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('eap-first-admin'))");
    const { rows: existing } = await client.query("SELECT 1 FROM staff WHERE role = 'admin' AND password_hash <> '!' LIMIT 1");
    if (existing.length) {
      await client.query("ROLLBACK");
      return null;
    }
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO staff (email, name, password_hash, role, is_admin, takes_clients)
       VALUES ($1, $2, $3, 'admin', true, false)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash,
         role = 'admin', is_admin = true
       RETURNING id`,
      [email, name, hashPassword(password)],
    );
    await client.query("COMMIT");
    return rows[0].id;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
