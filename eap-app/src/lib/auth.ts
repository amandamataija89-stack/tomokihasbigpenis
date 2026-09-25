import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { pool } from "./db";

const COOKIE = "pi_staff";
const SESSION_HOURS = 12;

export const ROLES = ["admin", "coordinator", "counsellor"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = { admin: "Admin", coordinator: "Coordinator", counsellor: "Counsellor" };

export type Staff = { id: string; email: string; name: string; role: Role };

// Admins and coordinators see and assign every case; counsellors only their own.
export const isManager = (s: Pick<Staff, "role">) => s.role === "admin" || s.role === "coordinator";

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
    `SELECT s.id, s.email, s.name, s.role FROM staff_sessions ss JOIN staff s ON s.id = ss.staff_id
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

// Admin-only pages (client feedback): anyone else is sent back to the requests list.
export async function requireAdmin(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.role !== "admin") redirect("/admin");
  return staff;
}

// Pages and actions for admins and coordinators only.
export async function requireManager(): Promise<Staff> {
  const staff = await requireStaff();
  if (!isManager(staff)) redirect("/admin");
  return staff;
}
