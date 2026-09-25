import { createHash, randomBytes } from "node:crypto";
import { pool } from "./db";
import { newMessageForClient, newReplyForStaff, sendEmail } from "./email";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

export const MAX_MESSAGE_LENGTH = 4000;
// A link stops working this long after the case is completed or closed.
const LINK_DAYS_AFTER_CASE_ENDS = 30;

/** A new private link to the client's conversation page, for putting in an email. */
export async function clientMessageLink(requestId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await pool.query("INSERT INTO message_links (token_hash, request_id) VALUES ($1, $2)", [sha256(token), requestId]);
  return `${appUrl()}/messages/${token}`;
}

export type Conversation = {
  requestId: string;
  nickname: string;
  counsellorName: string | null;
};

/** The case a private link belongs to, while the link is still valid. */
export async function conversationFor(token: string): Promise<Conversation | null> {
  const { rows } = await pool.query<{ id: string; first_name: string; counsellor: string | null }>(
    `SELECT r.id, r.first_name, s.name AS counsellor
     FROM message_links l JOIN support_requests r ON r.id = l.request_id LEFT JOIN staff s ON s.id = r.assigned_to
     WHERE l.token_hash = $1
       AND (r.status NOT IN ('completed', 'closed') OR r.updated_at > now() - make_interval(days => $2))`,
    [sha256(token), LINK_DAYS_AFTER_CASE_ENDS],
  );
  return rows[0] ? { requestId: rows[0].id, nickname: rows[0].first_name, counsellorName: rows[0].counsellor } : null;
}

export type Message = {
  id: string;
  sender: "staff" | "client";
  staff_name: string | null;
  body: string;
  created_at: Date;
  read_at: Date | null;
};

export async function listMessages(requestId: string): Promise<Message[]> {
  const { rows } = await pool.query<Message>(
    `SELECT m.id, m.sender, s.name AS staff_name, m.body, m.created_at, m.read_at
     FROM client_messages m LEFT JOIN staff s ON s.id = m.staff_id
     WHERE m.request_id = $1 ORDER BY m.created_at`,
    [requestId],
  );
  return rows;
}

/** Marks the client's messages read (when the counsellor looking after them opens the case). */
export async function markClientMessagesRead(requestId: string) {
  await pool.query(
    "UPDATE client_messages SET read_at = now() WHERE request_id = $1 AND sender = 'client' AND read_at IS NULL",
    [requestId],
  );
}

/** Staff write to the client: stored on the case, and the client is emailed a link (not the text). */
export async function sendStaffMessage(requestId: string, staffId: string, body: string): Promise<void> {
  await pool.query("INSERT INTO client_messages (request_id, sender, staff_id, body) VALUES ($1, 'staff', $2, $3)", [
    requestId,
    staffId,
    body,
  ]);
  const { rows } = await pool.query<{ email: string; first_name: string; counsellor: string | null }>(
    `SELECT r.email, r.first_name, s.name AS counsellor
     FROM support_requests r LEFT JOIN staff s ON s.id = r.assigned_to WHERE r.id = $1`,
    [requestId],
  );
  const r = rows[0];
  await sendEmail(newMessageForClient(r.email, r.first_name, r.counsellor, await clientMessageLink(requestId)));
}

/** The client writes from their private page: stored, and whoever looks after them is emailed. */
export async function sendClientMessage(requestId: string, body: string, fallbackTo: () => Promise<string[]>): Promise<void> {
  await pool.query("INSERT INTO client_messages (request_id, sender, body) VALUES ($1, 'client', $2)", [requestId, body]);
  await pool.query("UPDATE support_requests SET updated_at = now() WHERE id = $1", [requestId]);
  const { rows } = await pool.query<{ first_name: string; name: string | null; email: string | null }>(
    `SELECT r.first_name, s.name, s.email FROM support_requests r LEFT JOIN staff s ON s.id = r.assigned_to WHERE r.id = $1`,
    [requestId],
  );
  const r = rows[0];
  const recipients = r.email ? [{ email: r.email, name: r.name ?? "" }] : (await fallbackTo()).map((email) => ({ email, name: "" }));
  const sent = await Promise.allSettled(
    recipients.map((to) => sendEmail(newReplyForStaff(to.email, to.name || "there", r.first_name, requestId))),
  );
  for (const s of sent) if (s.status === "rejected") console.error("EAP email failed:", s.reason);
}
