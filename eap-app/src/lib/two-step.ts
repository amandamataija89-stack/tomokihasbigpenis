// Two-step sign-in for staff: password, then a 6-digit code sent by email. A device can be remembered
// for 30 days so the code isn't asked for every time there.
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { pool } from "./db";
import { loginCodeEmail, sendEmail } from "./email";

const CHALLENGE_COOKIE = "pi_login";
const DEVICE_COOKIE = "pi_device";
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const DEVICE_DAYS = 30;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const secure = process.env.NODE_ENV === "production";

/** True if this browser was remembered by this staff member within the last 30 days. */
export async function trustedDevice(staffId: string): Promise<boolean> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!token) return false;
  const { rows } = await pool.query("SELECT 1 FROM trusted_devices WHERE token_hash = $1 AND staff_id = $2 AND expires_at > now()", [
    sha256(token),
    staffId,
  ]);
  return rows.length > 0;
}

/** Emails a new code and remembers (in a short-lived cookie) whose sign-in it is. */
export async function sendLoginCode(staff: { id: string; email: string; name: string }): Promise<void> {
  const token = randomBytes(24).toString("base64url");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expires = new Date(Date.now() + CODE_MINUTES * 60_000);
  await pool.query("DELETE FROM login_challenges WHERE expires_at < now() OR staff_id = $1", [staff.id]);
  await pool.query("INSERT INTO login_challenges (token_hash, staff_id, code_hash, expires_at) VALUES ($1, $2, $3, $4)", [
    sha256(token),
    staff.id,
    sha256(`${token}:${code}`),
    expires,
  ]);
  (await cookies()).set(CHALLENGE_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/admin", expires });
  await sendEmail(loginCodeEmail(staff.email, staff.name, code, CODE_MINUTES));
}

export type CodeCheck = { ok: true; staffId: string } | { ok: false; error: string; restart?: boolean };

/** Checks the code typed in. On success the challenge is used up (and the device remembered if asked). */
export async function checkLoginCode(code: string, remember: boolean): Promise<CodeCheck> {
  const jar = await cookies();
  const token = jar.get(CHALLENGE_COOKIE)?.value;
  if (!token) return { ok: false, error: "Your sign-in timed out. Please enter your email and password again.", restart: true };
  const { rows } = await pool.query<{ staff_id: string; code_hash: string; attempts: number; expired: boolean }>(
    "SELECT staff_id, code_hash, attempts, expires_at < now() AS expired FROM login_challenges WHERE token_hash = $1",
    [sha256(token)],
  );
  const c = rows[0];
  if (!c || c.expired || c.attempts >= MAX_ATTEMPTS) {
    if (c) await pool.query("DELETE FROM login_challenges WHERE token_hash = $1", [sha256(token)]);
    return { ok: false, error: "That code has expired or had too many tries. Please sign in again for a new one.", restart: true };
  }
  const given = Buffer.from(sha256(`${token}:${code.replace(/\s/g, "")}`));
  if (given.length !== c.code_hash.length || !timingSafeEqual(given, Buffer.from(c.code_hash))) {
    await pool.query("UPDATE login_challenges SET attempts = attempts + 1 WHERE token_hash = $1", [sha256(token)]);
    return { ok: false, error: `That code isn't right. ${MAX_ATTEMPTS - c.attempts - 1} tries left.` };
  }
  await pool.query("DELETE FROM login_challenges WHERE token_hash = $1", [sha256(token)]);
  jar.delete({ name: CHALLENGE_COOKIE, path: "/admin" });
  if (remember) {
    const device = randomBytes(32).toString("base64url");
    const expires = new Date(Date.now() + DEVICE_DAYS * 86_400_000);
    await pool.query("DELETE FROM trusted_devices WHERE expires_at < now()");
    await pool.query("INSERT INTO trusted_devices (token_hash, staff_id, expires_at) VALUES ($1, $2, $3)", [sha256(device), c.staff_id, expires]);
    jar.set(DEVICE_COOKIE, device, { httpOnly: true, secure, sameSite: "lax", path: "/", expires });
  }
  return { ok: true, staffId: c.staff_id };
}
