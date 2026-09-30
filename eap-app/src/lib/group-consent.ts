// Group members sign the same informed consent form online, from a private link emailed to them.
import { createHash, randomBytes } from "node:crypto";
import { appUrl } from "./app-url";
import { consentTextHash, renderConsentPdf, signedFromRow, type ConsentInput, type SignedConsent } from "./consent";
import { CONSENT_VERSION } from "./consent-text";
import { pool } from "./db";
import { consentSignedEmail, groupConsentRequestEmail, groupConsentSignedStaffEmail, sendEmail } from "./email";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const LINK_DAYS = 90;

export type GroupMemberForConsent = { memberId: string; groupId: string; groupName: string; firstName: string; surname: string; email: string };

/** The member a private link belongs to, while it's valid. */
export async function memberForToken(token: string): Promise<GroupMemberForConsent | null> {
  const { rows } = await pool.query<GroupMemberForConsent>(
    `SELECT m.id AS "memberId", g.id AS "groupId", g.name AS "groupName", m.first_name AS "firstName", m.surname, m.email
     FROM group_consent_links l JOIN group_members m ON m.id = l.member_id JOIN support_groups g ON g.id = m.group_id
     WHERE l.token_hash = $1 AND l.created_at > now() - make_interval(days => $2)`,
    [sha256(token), LINK_DAYS],
  );
  return rows[0] ?? null;
}

export async function latestGroupConsent(memberId: string): Promise<SignedConsent | null> {
  const { rows } = await pool.query("SELECT * FROM group_consent_forms WHERE member_id = $1 ORDER BY signed_at DESC LIMIT 1", [memberId]);
  return rows[0] ? signedFromRow(rows[0]) : null;
}

/** Emails a member the link to sign (and records when). */
export async function sendGroupConsentRequest(memberId: string): Promise<boolean> {
  const { rows } = await pool.query<{ email: string; first_name: string; group_name: string }>(
    `SELECT m.email, m.first_name, g.name AS group_name FROM group_members m JOIN support_groups g ON g.id = m.group_id
     WHERE m.id = $1 AND NOT EXISTS (SELECT 1 FROM group_consent_forms WHERE member_id = m.id)`,
    [memberId],
  );
  if (!rows[0]) return false;
  const token = randomBytes(24).toString("base64url");
  await pool.query("INSERT INTO group_consent_links (token_hash, member_id) VALUES ($1, $2)", [sha256(token), memberId]);
  await sendEmail(groupConsentRequestEmail(rows[0].email, rows[0].first_name, rows[0].group_name, `${appUrl()}/group-consent/${token}`));
  await pool.query("UPDATE group_members SET consent_sent_at = now() WHERE id = $1", [memberId]);
  return true;
}

/** Saves the signed form, ticks "consent signed" on the member, emails them a copy and tells the group's leader. */
export async function saveGroupConsent(m: GroupMemberForConsent, c: ConsentInput, ip: string, ua: string): Promise<void> {
  await pool.query(
    `INSERT INTO group_consent_forms (member_id, version, text_sha256, full_name, home_address, local_address, phone, email,
       emergency_name, emergency_contact, other_info, for_minor, guardian_name, signed_name, signature_png, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      m.memberId, CONSENT_VERSION, consentTextHash(), c.fullName, c.homeAddress, c.localAddress, c.phone, c.email,
      c.emergencyName, c.emergencyContact, c.otherInfo, c.forMinor, c.guardianName, c.signedName, c.signaturePng,
      ip.slice(0, 100), ua.slice(0, 300),
    ],
  );
  await pool.query("UPDATE group_members SET consent_signed_on = (now() AT TIME ZONE 'Europe/Prague')::date WHERE id = $1", [m.memberId]);
  const signed = await latestGroupConsent(m.memberId);
  if (signed)
    await sendEmail(consentSignedEmail(signed.email, m.firstName, Buffer.from(await renderConsentPdf(signed)).toString("base64"))).catch((err) =>
      console.error("EAP group consent copy failed:", err),
    );
  const { rows } = await pool.query<{ email: string }>(
    "SELECT s.email FROM support_groups g JOIN staff s ON s.id = g.counsellor_id WHERE g.id = $1",
    [m.groupId],
  );
  if (rows[0])
    await sendEmail(groupConsentSignedStaffEmail(rows[0].email, `${m.firstName} ${m.surname}`, m.groupName, m.groupId)).catch(() => undefined);
}
