"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { endSession, isManager, requireManager, requireStaff, ROLES, startSession, type Role, type Staff } from "@/lib/auth";
import { inviteFeedback } from "@/lib/feedback";
import { assignWaitingAndNotify, DEFAULT_MONTHLY_CAPACITY, offerToNext } from "@/lib/assign";
import { generateCompanyCode } from "@/lib/codes";
import { SESSIONS_PER_CLIENT, STATUSES, STATUS_LABELS, type Status } from "@/lib/data";
import { pool } from "@/lib/db";
import { LATE_CANCEL_HOURS } from "@/lib/deadlines";
import { sendEmail, sessionConfirmation, therapistAlert, type SessionEmail } from "@/lib/email";
import { clientMessageLink, MAX_MESSAGE_LENGTH, sendStaffMessage } from "@/lib/messages";
import { acceptOffer, declineOffer, offerTo, takeFromPool } from "@/lib/offers";
import { verifyPassword } from "@/lib/password";
import { timingSafeEqual } from "node:crypto";
import {
  createFirstAdmin,
  MIN_PASSWORD_LENGTH,
  sendInvite,
  sendPasswordReset,
  setPasswordWithToken,
} from "@/lib/staff-accounts";
import { LANGUAGES } from "@/lib/request-form";

// Every action checks the session itself: server actions are reachable without the page.

/**
 * The signed-in staff member, if they may work on this case: admins and coordinators on any case,
 * counsellors only on their own. Anyone else is sent back to their list.
 */
async function requireCase(requestId: string): Promise<{ staff: Staff; assignedTo: string | null; acceptedAt: Date | null }> {
  const staff = await requireStaff();
  const { rows } = await pool.query<{ assigned_to: string | null; accepted_at: Date | null }>(
    "SELECT assigned_to, accepted_at FROM support_requests WHERE id = $1",
    [requestId],
  );
  if (!rows[0] || (!isManager(staff) && rows[0].assigned_to !== staff.id)) redirect("/admin");
  return { staff, assignedTo: rows[0].assigned_to, acceptedAt: rows[0].accepted_at };
}

// A counsellor who starts working on an offered case (books a session, changes status) has accepted it.
async function acceptIfPending(requestId: string, c: Awaited<ReturnType<typeof requireCase>>) {
  if (c.assignedTo === c.staff.id && !c.acceptedAt) await acceptOffer(requestId, c.staff.id);
}

export async function login(
  _prev: { error?: string; email?: string },
  formData: FormData,
): Promise<{ error?: string; email?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const { rows } = await pool.query<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM staff WHERE email = $1",
    [email],
  );
  if (rows[0]?.password_hash === "!") {
    return {
      error: "You haven't set a password yet. Use the link in your invitation email, or \"Forgot your password?\" below.",
      email,
    };
  }
  const ok = rows[0] ? verifyPassword(password, rows[0].password_hash) : false;
  if (!ok) {
    await new Promise((r) => setTimeout(r, 400));
    return { error: "That email and password don't match a staff login.", email };
  }
  await startSession(rows[0].id);
  redirect("/admin");
}

export async function logout() {
  await endSession();
  redirect("/admin/login");
}

export async function updateRequest(requestId: string, formData: FormData) {
  const c = await requireCase(requestId);
  const staff = c.staff;
  const status = String(formData.get("status") ?? "") as Status;
  const assignedRaw = String(formData.get("assignedTo") ?? "");
  // Only admins and coordinators assign; a counsellor's form has no assignment field.
  const assignedTo = !isManager(staff) ? c.assignedTo : /^[0-9a-f-]{36}$/i.test(assignedRaw) ? assignedRaw : null;
  if (!STATUSES.includes(status)) throw new Error("Unknown status");
  await acceptIfPending(requestId, c);

  const crisis = formData.get("crisis") === "yes";
  const { rows } = await pool.query<{ status: Status; assigned_to: string | null; crisis: boolean }>(
    "SELECT status, assigned_to, crisis FROM support_requests WHERE id = $1",
    [requestId],
  );
  if (!rows[0]) redirect("/admin");
  await pool.query("UPDATE support_requests SET status = $2, crisis = $3, updated_at = now() WHERE id = $1", [
    requestId,
    status,
    crisis,
  ]);
  if (rows[0].crisis !== crisis) {
    await pool.query("INSERT INTO request_notes (request_id, staff_id, body) VALUES ($1, $2, $3)", [
      requestId,
      staff.id,
      crisis ? "Marked as a crisis case." : "No longer marked as a crisis case.",
    ]);
  }
  if (rows[0].assigned_to !== assignedTo) {
    // A reassignment counts towards the new counsellor's monthly total from today.
    if (assignedTo) await offerTo(requestId, assignedTo, staff.id, formData.get("agreed") === "yes");
    else {
      // Taken off this counsellor: offer to the next available one (not them again).
      await pool.query(
        `UPDATE support_requests SET assigned_to = NULL, assigned_at = NULL, accepted_at = NULL, respond_by = NULL,
           declined_by = CASE WHEN assigned_to IS NULL THEN declined_by ELSE array_append(declined_by, assigned_to) END,
           updated_at = now() WHERE id = $1`,
        [requestId],
      );
      await note(requestId, staff.id, "Taken off the counsellor.");
      const next = await offerToNext(requestId);
      if (next)
        await sendEmail(therapistAlert(next.therapist.email, next.therapist.name, requestId, next.crisis, next.respondBy)).catch(
          (err) => console.error("EAP email failed:", err),
        );
    }
  }
  if (rows[0].status !== status) {
    await pool.query("INSERT INTO request_notes (request_id, staff_id, body) VALUES ($1, $2, $3)", [
      requestId,
      staff.id,
      `Status changed from ${STATUS_LABELS[rows[0].status]} to ${STATUS_LABELS[status]}.`,
    ]);
  }
  revalidatePath(`/admin/requests/${requestId}`);
  redirect(`/admin/requests/${requestId}?saved=1`);
}

export async function addNote(requestId: string, formData: FormData) {
  const { staff } = await requireCase(requestId);
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (body) {
    await pool.query("INSERT INTO request_notes (request_id, staff_id, body) VALUES ($1, $2, $3)", [
      requestId,
      staff.id,
      body,
    ]);
    await pool.query("UPDATE support_requests SET updated_at = now() WHERE id = $1", [requestId]);
  }
  redirect(`/admin/requests/${requestId}`);
}

export async function deleteRequest(requestId: string, formData: FormData) {
  await requireManager();
  if (formData.get("confirm") !== "yes") redirect(`/admin/requests/${requestId}?confirmDelete=1`);
  await pool.query("DELETE FROM support_requests WHERE id = $1", [requestId]);
  redirect("/admin?deleted=1");
}

export async function createCompany(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  await requireManager();
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  const hrContact = String(formData.get("hrContact") ?? "").trim().slice(0, 300);
  if (!name) return { error: "Enter the company's name." };
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await pool.query("INSERT INTO companies (name, code, hr_contact) VALUES ($1, $2, $3)", [
        name,
        generateCompanyCode(),
        hrContact,
      ]);
      revalidatePath("/admin/companies");
      return {};
    } catch (err) {
      if ((err as { code?: string }).code !== "23505") throw err; // retry only on a duplicate code
    }
  }
  return { error: "Couldn't create a unique code. Try again." };
}

export async function setCompanyActive(companyId: string, active: boolean) {
  await requireManager();
  await pool.query("UPDATE companies SET active = $2 WHERE id = $1", [companyId, active]);
  revalidatePath("/admin/companies");
}

function availabilityFields(formData: FormData, maxCapacity: number) {
  const languages = formData
    .getAll("languages")
    .filter((l): l is string => typeof l === "string" && (LANGUAGES as readonly string[]).includes(l) && l !== "Other");
  const capacity = Number(formData.get("capacity"));
  const away = String(formData.get("awayUntil") ?? "");
  return {
    languages,
    capacity: Number.isInteger(capacity) && capacity >= 0 && capacity <= maxCapacity ? capacity : null,
    takesClients: formData.get("takesClients") === "yes",
    awayUntil: /^\d{4}-\d{2}-\d{2}$/.test(away) ? away : null,
  };
}

// ---- Team (admins and coordinators) -------------------------------------------

export async function addStaff(_prev: { error?: string; done?: string }, formData: FormData): Promise<{ error?: string; done?: string }> {
  const me = await requireManager();
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const role = String(formData.get("role") ?? "counsellor") as Role;
  const f = availabilityFields(formData, 100);
  if (!name) return { error: "Enter their name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter their email address: the invitation goes there." };
  if (!ROLES.includes(role) || (role === "admin" && me.role !== "admin"))
    return { error: "Only an admin can add another admin." };
  // "!" is not a valid password hash: they can't sign in until they set a password from the invitation.
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO staff (email, name, password_hash, role, takes_clients, monthly_capacity, languages)
     VALUES ($1, $2, '!', $3, $4, $5, $6) ON CONFLICT (email) DO NOTHING RETURNING id`,
    [email, name, role, role === "counsellor" || f.takesClients, f.capacity ?? DEFAULT_MONTHLY_CAPACITY, f.languages],
  );
  if (!rows[0]) return { error: `${email} already has a login. Use "Resend invitation" on their card instead.` };
  await sendInvite(rows[0].id, me.name);
  await assignWaitingAndNotify();
  revalidatePath("/admin/team");
  return { done: `Invitation emailed to ${email}.` };
}

export async function resendInvite(staffId: string) {
  const me = await requireManager();
  await sendInvite(staffId, me.name);
  redirect("/admin/team?invited=1");
}

export async function updateStaff(staffId: string, formData: FormData) {
  const me = await requireManager();
  const f = availabilityFields(formData, 100);
  const role = String(formData.get("role") ?? "") as Role;
  const { rows } = await pool.query<{ role: Role }>("SELECT role FROM staff WHERE id = $1", [staffId]);
  if (!rows[0]) redirect("/admin/team");
  // Only admins change roles, and nobody removes their own admin role by accident.
  const newRole = me.role === "admin" && ROLES.includes(role) && !(staffId === me.id && role !== "admin") ? role : rows[0].role;
  await pool.query(
    `UPDATE staff SET takes_clients = $2, monthly_capacity = COALESCE($3, monthly_capacity), languages = $4,
       away_until = $5, role = $6, is_admin = ($6 = 'admin') WHERE id = $1`,
    [staffId, f.takesClients, f.capacity, f.languages, f.awayUntil, newRole],
  );
  await assignWaitingAndNotify();
  revalidatePath("/admin/team");
  redirect("/admin/team?saved=1");
}

// ---- Everyone: their own availability ----------------------------------------------

export async function updateMyAvailability(formData: FormData) {
  const me = await requireStaff();
  const { rows } = await pool.query<{ monthly_capacity: number }>("SELECT monthly_capacity FROM staff WHERE id = $1", [me.id]);
  // Counsellors can go down, or up to the usual 5; a higher limit is for a coordinator to set.
  const f = availabilityFields(formData, Math.max(DEFAULT_MONTHLY_CAPACITY, rows[0]?.monthly_capacity ?? 0));
  await pool.query(
    `UPDATE staff SET takes_clients = $2, monthly_capacity = COALESCE($3, monthly_capacity), languages = $4, away_until = $5
     WHERE id = $1`,
    [me.id, f.takesClients, f.capacity, f.languages, f.awayUntil],
  );
  await assignWaitingAndNotify();
  redirect("/admin/availability?saved=1");
}

// ---- Offers ----------------------------------------------------------------------

export async function acceptCase(requestId: string) {
  const { staff } = await requireCase(requestId);
  await acceptOffer(requestId, staff.id);
  redirect(`/admin/requests/${requestId}?accepted=1`);
}

export async function declineCase(requestId: string, formData: FormData) {
  const { staff } = await requireCase(requestId);
  await declineOffer(requestId, staff.id, String(formData.get("reason") ?? ""));
  redirect("/admin?declined=1");
}

export async function takeCase(requestId: string) {
  const staff = await requireStaff();
  const ok = await takeFromPool(requestId, staff.id);
  redirect(ok ? `/admin/requests/${requestId}?taken=1` : "/admin?status=pool&gone=1");
}

// ---- Passwords (no sign-in needed) ---------------------------------------------------

export async function forgotPassword(_prev: { sent?: boolean }, formData: FormData): Promise<{ sent?: boolean }> {
  const email = String(formData.get("email") ?? "");
  try {
    await sendPasswordReset(email);
  } catch (err) {
    console.error("EAP password reset email failed:", err);
  }
  return { sent: true };
}

export async function setPassword(token: string, _prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH)
    return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters. A few words together is easy to remember.` };
  if (password !== formData.get("confirm")) return { error: "The two passwords don't match." };
  const staffId = await setPasswordWithToken(token, password);
  if (!staffId) return { error: "This link has expired or was already used. Ask for a new one." };
  await startSession(staffId);
  redirect("/admin");
}

// ---- Sessions ----------------------------------------------------------------

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const sessionDate = (formData: FormData) => {
  const v = String(formData.get("startsAt") ?? "");
  return LOCAL_DATETIME.test(v) ? v : null;
};
const note = (requestId: string, staffId: string, body: string) =>
  pool.query("INSERT INTO request_notes (request_id, staff_id, body) VALUES ($1, $2, $3)", [requestId, staffId, body]);
const pragueLabel = (local: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${local.slice(0, 10)}T00:00:00Z`),
  ) +
  `, ${local.slice(11)}`;

// Keeps the case status in step with its sessions: Contacted once a session is booked,
// In progress once one is done, Completed once all are done. A Closed case is left alone.
async function syncStatusWithSessions(requestId: string, staffId: string) {
  const { rows } = await pool.query<{ status: Status; total: number; done: number }>(
    `SELECT r.status,
       (SELECT count(*)::int FROM client_sessions WHERE request_id = r.id) AS total,
       (SELECT count(*)::int FROM client_sessions WHERE request_id = r.id AND done_at IS NOT NULL) AS done
     FROM support_requests r WHERE r.id = $1`,
    [requestId],
  );
  const r = rows[0];
  if (!r) return;
  let next: Status = r.status;
  if (r.status === "closed") return;
  if (r.done >= SESSIONS_PER_CLIENT) next = "completed";
  else if (r.done > 0) next = "in_progress";
  else if (r.status === "completed" || r.status === "in_progress") next = "contacted";
  else if (r.total > 0 && r.status === "new") next = "contacted";
  if (next === r.status) return;
  await pool.query("UPDATE support_requests SET status = $2, updated_at = now() WHERE id = $1", [requestId, next]);
  await note(
    requestId,
    staffId,
    next === "completed"
      ? `All ${SESSIONS_PER_CLIENT} sessions done. Case marked Completed.`
      : `Status changed from ${STATUS_LABELS[r.status]} to ${STATUS_LABELS[next]}.`,
  );
  // Only once per case, even if a session is undone and redone.
  if (next === "completed") {
    const { rows: sent } = await pool.query(
      "SELECT 1 FROM request_notes WHERE request_id = $1 AND body LIKE 'Anonymous feedback link emailed%'",
      [requestId],
    );
    if (!sent.length) await sendFeedbackLink(requestId, staffId);
  }
}

const whenFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Prague",
});

// Emails the client about a session when staff ticked "Email the client". Returns the note to add.
async function emailClient(
  formData: FormData,
  sessionId: string,
  kind: SessionEmail["kind"],
): Promise<string> {
  if (formData.get("notifyClient") !== "yes") return "";
  const { rows } = await pool.query<{
    request_id: string;
    email: string;
    first_name: string;
    format: string;
    therapist: string | null;
    starts_at: Date;
    number: number;
  }>(
    `SELECT r.id AS request_id, r.email, r.first_name, r.format, s.name AS therapist, cs.starts_at,
       (SELECT count(*)::int FROM client_sessions o WHERE o.request_id = r.id AND o.starts_at <= cs.starts_at) AS number
     FROM client_sessions cs
     JOIN support_requests r ON r.id = cs.request_id
     LEFT JOIN staff s ON s.id = r.assigned_to
     WHERE cs.id = $1`,
    [sessionId],
  );
  const r = rows[0];
  if (!r) return "";
  try {
    await sendEmail(
      sessionConfirmation({
        to: r.email,
        firstName: r.first_name,
        kind,
        when: whenFmt.format(r.starts_at),
        number: r.number,
        total: SESSIONS_PER_CLIENT,
        format: r.format,
        therapistName: r.therapist,
        messageLink: await clientMessageLink(r.request_id),
        // The first booking explains the cancellation policy.
        lateCancelHours: kind === "booked" && r.number === 1 ? LATE_CANCEL_HOURS : undefined,
      }),
    );
    return " Confirmation emailed to the client.";
  } catch (err) {
    console.error("EAP session email failed:", err);
    return " The confirmation email to the client could not be sent.";
  }
}

async function sessionRequest(sessionId: string): Promise<string> {
  const { rows } = await pool.query<{ request_id: string }>("SELECT request_id FROM client_sessions WHERE id = $1", [sessionId]);
  if (!rows[0]) redirect("/admin");
  return rows[0].request_id;
}

export async function addSession(requestId: string, formData: FormData) {
  const c = await requireCase(requestId);
  const staff = c.staff;
  await acceptIfPending(requestId, c);
  const startsAt = sessionDate(formData);
  if (!startsAt) redirect(`/admin/requests/${requestId}?session=date#sessions`);
  const { rows } = await pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM client_sessions WHERE request_id = $1",
    [requestId],
  );
  if (rows[0].n >= SESSIONS_PER_CLIENT) redirect(`/admin/requests/${requestId}?session=full#sessions`);
  const { rows: created } = await pool.query<{ id: string }>(
    "INSERT INTO client_sessions (request_id, starts_at) VALUES ($1, $2::timestamp AT TIME ZONE 'Europe/Prague') RETURNING id",
    [requestId, startsAt],
  );
  const emailed = await emailClient(formData, created[0].id, "booked");
  await note(requestId, staff.id, `Session booked for ${pragueLabel(startsAt)}.${emailed}`);
  await syncStatusWithSessions(requestId, staff.id);
  redirect(`/admin/requests/${requestId}#sessions`);
}

export async function moveSession(sessionId: string, formData: FormData) {
  const requestId = await sessionRequest(sessionId);
  const { staff } = await requireCase(requestId);
  const startsAt = sessionDate(formData);
  if (!startsAt) redirect(`/admin/requests/${requestId}?session=date#sessions`);
  await pool.query("UPDATE client_sessions SET starts_at = $2::timestamp AT TIME ZONE 'Europe/Prague', reminder_sent_at = NULL WHERE id = $1", [
    sessionId,
    startsAt,
  ]);
  const emailed = await emailClient(formData, sessionId, "moved");
  await note(requestId, staff.id, `Session moved to ${pragueLabel(startsAt)}.${emailed}`);
  redirect(`/admin/requests/${requestId}#sessions`);
}

/** "done": the session happened. "late": the client cancelled late, which counts the same. "undo": neither. */
export async function setSessionOutcome(sessionId: string, outcome: "done" | "late" | "undo") {
  const requestId = await sessionRequest(sessionId);
  const { staff } = await requireCase(requestId);
  // Only acts on a real change, so a double click can't count a session twice.
  const { rowCount } = await pool.query(
    outcome === "undo"
      ? "UPDATE client_sessions SET done_at = NULL, late_cancelled = false WHERE id = $1 AND done_at IS NOT NULL"
      : "UPDATE client_sessions SET done_at = now(), late_cancelled = $2 WHERE id = $1 AND done_at IS NULL",
    outcome === "undo" ? [sessionId] : [sessionId, outcome === "late"],
  );
  if (!rowCount) redirect(`/admin/requests/${requestId}#sessions`);
  const { rows } = await pool.query<{ done: number }>(
    "SELECT count(*)::int AS done FROM client_sessions WHERE request_id = $1 AND done_at IS NOT NULL",
    [requestId],
  );
  const counted = `${rows[0].done} of ${SESSIONS_PER_CLIENT}`;
  await note(
    requestId,
    staff.id,
    outcome === "done"
      ? `Session marked done (${counted}).`
      : outcome === "late"
        ? `Late cancellation by the client: counts as a session (${counted}).`
        : "Session no longer marked done or late-cancelled.",
  );
  await syncStatusWithSessions(requestId, staff.id);
  redirect(`/admin/requests/${requestId}#sessions`);
}

export async function removeSession(sessionId: string, formData: FormData) {
  const requestId = await sessionRequest(sessionId);
  const { staff } = await requireCase(requestId);
  // Email before deleting, while the session's details still exist.
  const emailed = await emailClient(formData, sessionId, "cancelled");
  await pool.query("DELETE FROM client_sessions WHERE id = $1", [sessionId]);
  await note(requestId, staff.id, `Session removed.${emailed}`);
  await syncStatusWithSessions(requestId, staff.id);
  redirect(`/admin/requests/${requestId}#sessions`);
}

export async function updateClientEmail(requestId: string, formData: FormData) {
  const { staff } = await requireCase(requestId);
  const email = String(formData.get("clientEmail") ?? "").trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(`/admin/requests/${requestId}?session=email#sessions`);
  const { rows } = await pool.query<{ email: string }>("SELECT email FROM support_requests WHERE id = $1", [requestId]);
  if (!rows[0]) redirect("/admin");
  if (rows[0].email !== email) {
    await pool.query("UPDATE support_requests SET email = $2, updated_at = now() WHERE id = $1", [requestId, email]);
    await note(requestId, staff.id, `Client email changed from ${rows[0].email} to ${email}.`);
  }
  redirect(`/admin/requests/${requestId}?session=emailsaved#sessions`);
}

async function sendFeedbackLink(requestId: string, staffId: string) {
  let ok = false;
  try {
    ok = await inviteFeedback(requestId);
  } catch (err) {
    console.error("EAP feedback invite failed:", err);
  }
  await note(
    requestId,
    staffId,
    ok ? "Anonymous feedback link emailed to the client." : "The feedback link could not be emailed to the client.",
  );
}

export async function emailFeedbackLink(requestId: string) {
  const { staff } = await requireCase(requestId);
  await sendFeedbackLink(requestId, staff.id);
  redirect(`/admin/requests/${requestId}?feedback=sent`);
}

// ---- Messages with the client ---------------------------------------------------------

export async function messageClient(requestId: string, formData: FormData) {
  const c = await requireCase(requestId);
  const body = String(formData.get("message") ?? "").trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!body) redirect(`/admin/requests/${requestId}?msg=empty#messages`);
  await acceptIfPending(requestId, c);
  try {
    await sendStaffMessage(requestId, c.staff.id, body);
  } catch (err) {
    console.error("EAP message email failed:", err);
    redirect(`/admin/requests/${requestId}?msg=emailfailed#messages`);
  }
  // Writing to the client is first contact.
  const { rowCount } = await pool.query(
    "UPDATE support_requests SET status = 'contacted', updated_at = now() WHERE id = $1 AND status = 'new'",
    [requestId],
  );
  await note(requestId, c.staff.id, `Sent the client a message.${rowCount ? " Status changed from New to Contacted." : ""}`);
  redirect(`/admin/requests/${requestId}?msg=sent#messages`);
}

// ---- First admin (one time, no sign-in needed) --------------------------------------------

type SetupState = { error?: string; name?: string; email?: string };

export async function setupFirstAdmin(_prev: SetupState, formData: FormData): Promise<SetupState> {
  // Echoed back with any error, so the form keeps what was typed.
  const keep = { name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? "") };
  // Stray spaces around a pasted code shouldn't lock anyone out.
  const expected = (process.env.SETUP_CODE ?? "").trim();
  const given = String(formData.get("setupCode") ?? "").trim();
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (!expected) return { error: "Add a SETUP_CODE setting in Vercel first (any code you make up), then redeploy.", ...keep };
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await new Promise((r) => setTimeout(r, 400));
    return { error: "That setup code doesn't match the SETUP_CODE setting in Vercel.", ...keep };
  }
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(formData.get("password") ?? "");
  if (!name) return { error: "Enter your name.", ...keep };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter your email address.", ...keep };
  if (password.length < MIN_PASSWORD_LENGTH) return { error: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`, ...keep };
  if (password !== formData.get("confirm")) return { error: "The two passwords don't match.", ...keep };
  const id = await createFirstAdmin(name, email, password);
  if (!id) return { error: "Setup is already done. Sign in instead.", ...keep };
  await startSession(id);
  redirect("/admin/team?welcome=1");
}
