import { createHash, randomBytes } from "node:crypto";
import { pool } from "./db";
import { feedbackInvitation, sendEmail } from "./email";
import { HELPED, RECOMMEND } from "./feedback-options";
const INVITE_DAYS = 60;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Emails the client a one-use anonymous feedback link. Nothing about the client is stored with it. */
export async function inviteFeedback(requestId: string): Promise<boolean> {
  const { rows } = await pool.query<{ email: string; first_name: string; assigned_to: string | null }>(
    "SELECT email, first_name, assigned_to FROM support_requests WHERE id = $1",
    [requestId],
  );
  const r = rows[0];
  if (!r) return false;
  const token = randomBytes(24).toString("base64url");
  await pool.query(
    `INSERT INTO feedback_invites (token_hash, counsellor_id, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3))`,
    [sha256(token), r.assigned_to, INVITE_DAYS],
  );
  await pool.query("DELETE FROM feedback_invites WHERE expires_at < now()");
  await sendEmail(feedbackInvitation(r.email, r.first_name, token));
  return true;
}

export async function findInvite(token: string): Promise<{ counsellorName: string | null } | null> {
  const { rows } = await pool.query<{ name: string | null }>(
    `SELECT s.name FROM feedback_invites i LEFT JOIN staff s ON s.id = i.counsellor_id
     WHERE i.token_hash = $1 AND i.expires_at > now()`,
    [sha256(token)],
  );
  return rows[0] ? { counsellorName: rows[0].name } : null;
}

export type FeedbackInput = {
  overall: number;
  counsellorRating: number | null;
  helped: string;
  recommend: string;
  comments: string;
};

export function parseFeedback(form: FormData): { ok: true; data: FeedbackInput } | { ok: false; error: string } {
  const rating = (k: string) => {
    const n = Number(form.get(k));
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
  };
  const overall = rating("overall");
  const helped = String(form.get("helped") ?? "");
  const recommend = String(form.get("recommend") ?? "");
  if (!overall || !(HELPED as readonly string[]).includes(helped) || !(RECOMMEND as readonly string[]).includes(recommend))
    return { ok: false, error: "Please answer the three questions marked with a star." };
  return {
    ok: true,
    data: {
      overall,
      counsellorRating: rating("counsellorRating"),
      helped,
      recommend,
      comments: String(form.get("comments") ?? "").trim().slice(0, 3000),
    },
  };
}

/** Uses up the link and stores the answers. Returns false if the link was already used or expired. */
export async function submitFeedback(token: string, f: FeedbackInput): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ counsellor_id: string | null }>(
      "DELETE FROM feedback_invites WHERE token_hash = $1 AND expires_at > now() RETURNING counsellor_id",
      [sha256(token)],
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(
      `INSERT INTO feedback (counsellor_id, submitted_month, overall, counsellor_rating, helped, recommend, comments)
       VALUES ($1, date_trunc('month', now() AT TIME ZONE 'Europe/Prague')::date, $2, $3, $4, $5, $6)`,
      [rows[0].counsellor_id, f.overall, f.counsellorRating, f.helped, f.recommend, f.comments],
    );
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
