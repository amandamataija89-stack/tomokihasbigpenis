import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { pool } from "./db";

const COOKIE = "pi_staff";
const SESSION_HOURS = 12;

export type Staff = { id: string; email: string; name: string; is_admin: boolean };

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function startSession(staffId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await pool.query("DELETE FROM staff_sessions WHERE expires_at < now()");
  await pool.query("INSERT INTO staff_sessions (token_hash, staff_id, expires_at) VALUES ($1, $2, $3)", [
    sha256(token),
    staffId,
    expires,
  ]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await pool.query("DELETE FROM staff_sessions WHERE token_hash = $1", [sha256(token)]);
  jar.delete(COOKIE);
}

export async function currentStaff(): Promise<Staff | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const { rows } = await pool.query<Staff>(
    `SELECT s.id, s.email, s.name, s.is_admin FROM staff_sessions ss JOIN staff s ON s.id = ss.staff_id
     WHERE ss.token_hash = $1 AND ss.expires_at > now()`,
    [sha256(token)],
  );
  return rows[0] ?? null;
}

export async function requireStaff(): Promise<Staff> {
  const staff = await currentStaff();
  if (!staff) redirect("/admin/login");
  return staff;
}

// Admin-only pages: anyone else is sent back to the requests list.
export async function requireAdmin(): Promise<Staff> {
  const staff = await requireStaff();
  if (!staff.is_admin) redirect("/admin");
  return staff;
}
