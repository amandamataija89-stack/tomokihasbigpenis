"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { discoveryOffer } from "@/lib/discovery-offer";
import { DISCOVERY_MINUTES, SESSION_MINUTES, sessionIcs } from "@/lib/ics";
import { endSession, isManager, isOwner, requireAdmin, requireManager, requireOwner, requireStaff, ROLES, startSession, type Role, type Staff } from "@/lib/auth";
import { inviteFeedback } from "@/lib/feedback";
import { assignWaitingAndNotify, CLIENT_TYPES, DEFAULT_MONTHLY_CAPACITY, offerToNext } from "@/lib/assign";
import { generateCompanyCode } from "@/lib/codes";
import { sessionLimit, STATUSES, STATUS_LABELS, type ClientKind, type Status } from "@/lib/data";
import { pool } from "@/lib/db";
import { LATE_CANCEL_HOURS } from "@/lib/deadlines";
import { emailProblem, OFFICE_ADDRESS, sendEmail, sessionConfirmation, therapistAlert, type SessionEmail } from "@/lib/email";
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
import {
  addToMonthlyInvoice,
  defaultSessionPrice,
  parsePrice,
  recomputeInvoice,
  recordPayment,
  removeFromInvoice,
  unpaySession,
  useFromPackage,
} from "@/lib/billing";

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

export type LoginState = { error?: string; email?: string; step?: "code"; restart?: boolean; at?: number };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const { rows } = await pool.query<{ id: string; password_hash: string; name: string; email: string; removed: boolean }>(
    "SELECT id, password_hash, name, email, removed_at IS NOT NULL AS removed FROM staff WHERE email = $1",
    [email],
  );
  if (rows[0]?.removed) {
    await new Promise((r) => setTimeout(r, 400));
    return { error: "That email and password don't match a staff login.", email };
  }
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
  // Second step: a code by email, unless this device was remembered.
  const { sendLoginCode, trustedDevice } = await import("@/lib/two-step");
  if (!(await trustedDevice(rows[0].id))) {
    try {
      await sendLoginCode(rows[0]);
    } catch (err) {
      console.error("EAP sign-in code email failed:", err);
      return { error: "We couldn't email your sign-in code. Please try again in a minute.", email };
    }
    return { step: "code", email, at: Date.now() };
  }
  await startSession(rows[0].id);
  redirect("/admin");
}

export async function verifyLoginCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const { checkLoginCode } = await import("@/lib/two-step");
  const r = await checkLoginCode(String(formData.get("code") ?? ""), formData.get("remember") === "yes");
  if (!r.ok) return r.restart ? { error: r.error, restart: true, at: Date.now() } : { error: r.error, step: "code" };
  await startSession(r.staffId);
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

  const { rows } = await pool.query<{ status: Status; assigned_to: string | null; crisis: boolean; kind: ClientKind }>(
    "SELECT status, assigned_to, crisis, kind FROM support_requests WHERE id = $1",
    [requestId],
  );
  if (!rows[0]) redirect("/admin");
  await pool.query("UPDATE support_requests SET status = $2, updated_at = now() WHERE id = $1", [requestId, status]);
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
    // Completing a case by hand (any client) emails the anonymous feedback link, once per case.
    if (status === "completed") await sendFeedbackOnce(requestId, staff.id);
  }
  revalidatePath(`/admin/requests/${requestId}`);
  redirect(`/admin/requests/${requestId}?saved=1`);
}

/** The crisis tick box at the top of the case. */
export async function setCrisisAction(requestId: string, formData: FormData) {
  const { staff } = await requireCase(requestId);
  const crisis = formData.get("crisis") === "yes";
  const { rowCount } = await pool.query(
    "UPDATE support_requests SET crisis = $2, updated_at = now() WHERE id = $1 AND crisis <> $2",
    [requestId, crisis],
  );
  if (rowCount)
    await pool.query("INSERT INTO request_notes (request_id, staff_id, body) VALUES ($1, $2, $3)", [
      requestId,
      staff.id,
      crisis ? "Marked as a crisis case." : "No longer marked as a crisis case.",
    ]);
  redirect(`/admin/requests/${requestId}?crisis=${crisis ? "on" : "off"}`);
}

/** A note only the client's counsellor can read. */
export async function addCounsellorNote(requestId: string, formData: FormData) {
  const c = await requireCase(requestId);
  if (c.assignedTo !== c.staff.id) redirect(`/admin/requests/${requestId}`);
  const body = String(formData.get("body") ?? "").trim().slice(0, 8000);
  if (body)
    await pool.query("INSERT INTO counsellor_notes (request_id, staff_id, body) VALUES ($1, $2, $3)", [requestId, c.staff.id, body]);
  redirect(`/admin/requests/${requestId}#counsellor-notes`);
}

/** The owner opens a counsellor's private notes in an emergency. It's recorded in the team notes. */
export async function openCounsellorNotesAction(requestId: string) {
  const staff = await requireOwner();
  await pool.query("INSERT INTO request_notes (request_id, staff_id, body) VALUES ($1, $2, $3)", [
    requestId,
    staff.id,
    `${staff.name} opened the counsellor's private notes (emergency access).`,
  ]);
  redirect(`/admin/requests/${requestId}?notes=emergency#counsellor-notes`);
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
  const me = await requireAdmin(); // only admins delete client profiles
  if (formData.get("confirm") !== "yes") redirect(`/admin/requests/${requestId}?confirmDelete=1`);
  const { eraseClient } = await import("@/lib/retention");
  const result = await eraseClient(requestId, { test: isOwner(me) && formData.get("test") === "yes" });
  redirect(result === "deleted" ? "/admin?deleted=1" : "/admin?deleted=kept");
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
  const accepts = formData.getAll("accepts").filter((c): c is string => typeof c === "string" && (CLIENT_TYPES as readonly string[]).includes(c));
  return {
    languages,
    accepts,
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
  if (!rows[0]) return { error: `${email} already has a login. Use "Resend invitation" (or "Restore access" if it was removed) on the Team page instead.` };
  const problem = await inviteProblem(rows[0].id, me.name);
  await assignWaitingAndNotify();
  revalidatePath("/admin/team");
  if (problem) return { error: `${name} is added, but no invitation was sent. ${problem} Then press "Resend invitation" on their card.` };
  if (!process.env.RESEND_API_KEY)
    return {
      error: `${name} is added, but email isn't connected yet (RESEND_API_KEY is missing in Vercel), so no invitation was sent. Once it's connected, press "Resend invitation" on their card.`,
    };
  return { done: `Invitation emailed to ${email}.` };
}

// Sends an invitation; returns why it couldn't be sent instead of crashing the page.
async function inviteProblem(staffId: string, invitedBy: string): Promise<string | null> {
  try {
    await sendInvite(staffId, invitedBy);
    return null;
  } catch (err) {
    console.error("EAP invite email failed:", err);
    return emailProblem(err);
  }
}

export async function resendInvite(staffId: string) {
  const me = await requireManager();
  if (!process.env.RESEND_API_KEY) redirect("/admin/team?noemail=1");
  const problem = await inviteProblem(staffId, me.name);
  redirect(problem ? `/admin/team?emailerror=${encodeURIComponent(problem)}` : "/admin/team?invited=1");
}

// Admins remove a team member's access: signed out everywhere, no sign-in or password reset, no new
// clients; their open clients go back to the coordinator to reassign. Their history stays.
export async function removeAccessAction(staffId: string, formData: FormData) {
  const me = await requireAdmin();
  if (formData.get("confirm") !== "yes") redirect(`/admin/team?confirmRemove=${staffId}#staff-${staffId}`);
  const { rows } = await pool.query<{ name: string; owner: boolean }>("SELECT name, is_owner AS owner FROM staff WHERE id = $1", [staffId]);
  if (!rows[0] || rows[0].owner || staffId === me.id) redirect("/admin/team?removeerror=1");
  await pool.query(
    "UPDATE staff SET removed_at = now(), password_hash = '!', takes_clients = false WHERE id = $1 AND removed_at IS NULL",
    [staffId],
  );
  for (const t of ["staff_sessions", "password_tokens", "trusted_devices", "login_challenges"])
    await pool.query(`DELETE FROM ${t} WHERE staff_id = $1`, [staffId]);
  const { rows: open } = await pool.query<{ id: string }>(
    `UPDATE support_requests SET assigned_to = NULL, updated_at = now()
     WHERE assigned_to = $1 AND status NOT IN ('completed', 'closed') RETURNING id`,
    [staffId],
  );
  for (const r of open) await note(r.id, me.id, `${rows[0].name}'s access was removed. Please assign another counsellor.`);
  redirect(`/admin/team?removed=${open.length}`);
}

// Gives access back: they're emailed a link to set a new password.
export async function restoreAccessAction(staffId: string) {
  const me = await requireAdmin();
  const { rowCount } = await pool.query("UPDATE staff SET removed_at = NULL WHERE id = $1 AND removed_at IS NOT NULL", [staffId]);
  if (!rowCount) redirect("/admin/team");
  if (!process.env.RESEND_API_KEY) redirect("/admin/team?noemail=1");
  const problem = await inviteProblem(staffId, me.name);
  redirect(problem ? `/admin/team?emailerror=${encodeURIComponent(problem)}` : "/admin/team?restored=1");
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
       away_until = $5, role = $6, is_admin = ($6 = 'admin'), accepts = $7 WHERE id = $1`,
    [staffId, f.takesClients, f.capacity, f.languages, f.awayUntil, newRole, f.accepts],
  );
  // Payout terms are for admins only.
  if (me.role === "admin") {
    const pct = Number(formData.get("payoutPercent"));
    const fee = Number(formData.get("eapFee"));
    if (Number.isInteger(pct) && pct >= 0 && pct <= 100 && Number.isInteger(fee) && fee >= 0)
      await pool.query("UPDATE staff SET payout_percent = $2, eap_session_fee = $3 WHERE id = $1", [staffId, pct, fee]);
  }
  await assignWaitingAndNotify();
  revalidatePath("/admin/team");
  redirect("/admin/team?saved=1");
}

// ---- Everyone: their own availability ----------------------------------------------

export async function updateMyAvailability(formData: FormData) {
  const me = await requireStaff();
  const { rows: was } = await pool.query<{ takes_clients: boolean; suspended: boolean }>(
    "SELECT takes_clients, suspended_at IS NOT NULL AS suspended FROM staff WHERE id = $1",
    [me.id],
  );
  const { rows } = await pool.query<{ monthly_capacity: number }>("SELECT monthly_capacity FROM staff WHERE id = $1", [me.id]);
  // Counsellors can go down, or up to the usual 5; a higher limit is for a coordinator to set.
  const f = availabilityFields(formData, Math.max(DEFAULT_MONTHLY_CAPACITY, rows[0]?.monthly_capacity ?? 0));
  if (was[0]?.suspended) f.takesClients = false; // suspended: no new clients until an admin lifts it
  await pool.query(
    `UPDATE staff SET takes_clients = $2, monthly_capacity = COALESCE($3, monthly_capacity), languages = $4, away_until = $5,
       availability_note = $6, accepts = $7, meeting_link = $8, office_address = $9
     WHERE id = $1`,
    [
      me.id,
      f.takesClients,
      f.capacity,
      f.languages,
      f.awayUntil,
      String(formData.get("availabilityNote") ?? "").trim().slice(0, 500),
      f.accepts,
      /^https:\/\/\S+$/.test(String(formData.get("meetingLink") ?? "").trim()) ? String(formData.get("meetingLink")).trim().slice(0, 300) : "",
      String(formData.get("officeAddress") ?? "").trim().replace(/\s+/g, " ").slice(0, 200),
    ],
  );
  await assignWaitingAndNotify();
  if (f.takesClients && !was[0]?.takes_clients) {
    const { notifyWaitingMatches } = await import("@/lib/waiting-list");
    await notifyWaitingMatches(me.id).catch((err) => console.error("EAP waiting list alert failed:", err));
  }
  redirect("/admin/availability?saved=1");
}

/** The big button on My availability: pause new clients, or start taking them again (clears "away until"). */
export async function setTakingClientsAction(taking: boolean) {
  const me = await requireStaff();
  const { rows: susp } = await pool.query("SELECT 1 FROM staff WHERE id = $1 AND suspended_at IS NOT NULL", [me.id]);
  if (taking && susp.length) redirect("/admin/availability?saved=suspended");
  await pool.query(
    `UPDATE staff SET takes_clients = $2, away_until = CASE WHEN $2 THEN NULL ELSE away_until END WHERE id = $1`,
    [me.id, taking],
  );
  if (taking) {
    await assignWaitingAndNotify();
    const { notifyWaitingMatches } = await import("@/lib/waiting-list");
    await notifyWaitingMatches(me.id).catch((err) => console.error("EAP waiting list alert failed:", err));
  }
  redirect(`/admin/availability?saved=${taking ? "on" : "paused"}`);
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
  if (!isManager(staff)) redirect("/admin"); // the pool is for coordinators and admins only
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
// In progress once one is done, Completed once all are done (EAP only: private clients have no
// limit, so staff complete their case by hand). A Closed case is left alone.
async function syncStatusWithSessions(requestId: string, staffId: string) {
  const { rows } = await pool.query<{ status: Status; kind: ClientKind; total: number; done: number }>(
    `SELECT r.status, r.kind,
       (SELECT count(*)::int FROM client_sessions WHERE request_id = r.id) AS total,
       (SELECT count(*)::int FROM client_sessions WHERE request_id = r.id AND done_at IS NOT NULL) AS done
     FROM support_requests r WHERE r.id = $1`,
    [requestId],
  );
  const r = rows[0];
  if (!r) return;
  let next: Status = r.status;
  if (r.status === "closed") return;
  const limit = sessionLimit(r.kind);
  if (limit && r.done >= limit) next = "completed";
  else if (limit === null && r.status === "completed") return;
  else if (r.done > 0) next = "in_progress";
  else if (r.status === "completed" || r.status === "in_progress") next = "contacted";
  else if (r.total > 0 && r.status === "new") next = "contacted";
  if (next === r.status) return;
  await pool.query("UPDATE support_requests SET status = $2, updated_at = now() WHERE id = $1", [requestId, next]);
  await note(
    requestId,
    staffId,
    next === "completed"
      ? `All ${limit} sessions done. Case marked Completed.`
      : `Status changed from ${STATUS_LABELS[r.status]} to ${STATUS_LABELS[next]}.`,
  );
  if (next === "completed") await sendFeedbackOnce(requestId, staffId);
}

// The automatic feedback email goes once per case, even if it's completed, reopened and completed again.
async function sendFeedbackOnce(requestId: string, staffId: string) {
  const { rows: sent } = await pool.query(
    "SELECT 1 FROM request_notes WHERE request_id = $1 AND body LIKE 'Anonymous feedback link emailed%'",
    [requestId],
  );
  if (!sent.length) await sendFeedbackLink(requestId, staffId);
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
  formData: FormData | null,
  sessionId: string,
  kind: SessionEmail["kind"],
  extra: { intakeLink?: string } = {},
): Promise<string> {
  if (formData && formData.get("notifyClient") !== "yes") return "";
  const { rows } = await pool.query<{
    request_id: string;
    email: string;
    first_name: string;
    format: string;
    therapist: string | null;
    starts_at: Date;
    number: number;
    kind: ClientKind;
    is_discovery: boolean;
    meeting_link: string | null;
    office_address: string | null;
  }>(
    `SELECT r.id AS request_id, r.email, r.first_name, r.format, r.kind, s.name AS therapist, s.meeting_link, s.office_address, cs.starts_at, cs.is_discovery,
       (SELECT count(*)::int FROM client_sessions o
        WHERE o.request_id = r.id AND o.starts_at <= cs.starts_at AND NOT o.is_discovery) AS number
     FROM client_sessions cs
     JOIN support_requests r ON r.id = cs.request_id
     LEFT JOIN staff s ON s.id = r.assigned_to
     WHERE cs.id = $1`,
    [sessionId],
  );
  const r = rows[0];
  if (!r) return "";
  const online = r.is_discovery || r.format === "Online";
  const calendar = sessionIcs({
    id: sessionId,
    start: r.starts_at,
    minutes: r.is_discovery ? DISCOVERY_MINUTES : SESSION_MINUTES,
    summary: `${r.is_discovery ? "Free discovery session" : "Counselling session"}${r.therapist ? ` with ${r.therapist}` : ""} – Prague Integration`,
    location: online ? r.meeting_link || "Online" : r.format === "In person in Prague" ? r.office_address || OFFICE_ADDRESS : "",
    description: `${online && r.meeting_link ? `Join online: ${r.meeting_link}\n` : ""}To change the time, reply to our email or call +420 608 573 256.`,
    url: online && r.meeting_link ? r.meeting_link : undefined,
    cancelled: kind === "cancelled",
  });
  try {
    await sendEmail(
      sessionConfirmation({
        to: r.email,
        firstName: r.first_name,
        kind,
        when: whenFmt.format(r.starts_at),
        number: r.number,
        total: sessionLimit(r.kind),
        format: r.format,
        therapistName: r.therapist,
        messageLink: await clientMessageLink(r.request_id),
        // The first booking explains the cancellation policy.
        lateCancelHours: kind === "booked" && r.number === 1 && !r.is_discovery ? LATE_CANCEL_HOURS : undefined,
        discovery: r.is_discovery,
        intakeLink: extra.intakeLink,
        meetingLink: r.meeting_link || undefined,
        office: r.office_address || undefined,
        calendar: Buffer.from(calendar).toString("base64"),
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
  const { rows } = await pool.query<{ n: number; kind: ClientKind }>(
    `SELECT (SELECT count(*)::int FROM client_sessions WHERE request_id = r.id) AS n, r.kind
     FROM support_requests r WHERE r.id = $1`,
    [requestId],
  );
  const limit = sessionLimit(rows[0].kind);
  if (limit && rows[0].n >= limit) redirect(`/admin/requests/${requestId}?session=full#sessions`);
  // Only coordinators type a session price; otherwise it's the client's chosen price.
  const typed = rows[0].kind === "private" && isManager(staff) ? priceFrom(formData) : null;
  if (typed === undefined) redirect(`/admin/requests/${requestId}?session=price#sessions`);
  // Left empty: the client's price, else the price list for their kind of support.
  const price = rows[0].kind === "private" ? (typed ?? (await defaultSessionPrice(requestId))) : null;
  const { rows: created } = await pool.query<{ id: string }>(
    `INSERT INTO client_sessions (request_id, starts_at, price_czk)
     VALUES ($1, $2::timestamp AT TIME ZONE 'Europe/Prague', $3) RETURNING id`,
    [requestId, startsAt, price],
  );
  const fromPackage = rows[0].kind === "private" && (await useFromPackage(requestId, created[0].id));
  const emailed = await emailClient(formData, created[0].id, "booked");
  await note(
    requestId,
    staff.id,
    `Session booked for ${pragueLabel(startsAt)}.${fromPackage ? " Paid from the client's package." : ""}${emailed}`,
  );
  await syncStatusWithSessions(requestId, staff.id);
  redirect(`/admin/requests/${requestId}#sessions`);
}

/** Step 2: offers the client a free discovery session, by message on their private page. */
export async function offerDiscoveryAction(requestId: string) {
  const c = await requireCase(requestId);
  await acceptIfPending(requestId, c);
  // Signed with the client's counsellor's name, even when the coordinator sends it for them.
  const { rows } = await pool.query<{ id: string; name: string }>(
    "SELECT s.id, s.name FROM support_requests r JOIN staff s ON s.id = r.assigned_to WHERE r.id = $1",
    [requestId],
  );
  const from = rows[0] ?? c.staff;
  await sendStaffMessage(requestId, from.id, discoveryOffer(from.name));
  await pool.query(
    "UPDATE support_requests SET discovery_offered_at = now(), status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END, updated_at = now() WHERE id = $1",
    [requestId],
  );
  await note(requestId, c.staff.id, "Free discovery session offered to the client (message sent).");
  redirect(`/admin/requests/${requestId}#steps`);
}

/** Step 3: books the free discovery session and sends the invitation with the intake form. */
export async function bookDiscoveryAction(requestId: string, formData: FormData) {
  const c = await requireCase(requestId);
  await acceptIfPending(requestId, c);
  const startsAt = sessionDate(formData);
  if (!startsAt) redirect(`/admin/requests/${requestId}?session=date#steps`);
  // Free: marked paid at once, so it's never charged or invoiced.
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO client_sessions (request_id, starts_at, price_czk, paid_at, is_discovery)
     VALUES ($1, $2::timestamp AT TIME ZONE 'Europe/Prague', 0, now(), true) RETURNING id`,
    [requestId, startsAt],
  );
  const { intakeLink } = await import("@/lib/intake");
  const emailed = await emailClient(null, rows[0].id, "booked", { intakeLink: await intakeLink(requestId) });
  await pool.query("UPDATE support_requests SET intake_sent_at = now(), updated_at = now() WHERE id = $1", [requestId]);
  await note(requestId, c.staff.id, `Free discovery session booked for ${pragueLabel(startsAt!)}, with the intake form.${emailed}`);
  await syncStatusWithSessions(requestId, c.staff.id);
  redirect(`/admin/requests/${requestId}#steps`);
}

/** Emails the intake form (again). */
export async function sendIntakeAction(requestId: string) {
  const { staff } = await requireCase(requestId);
  const { sendIntakeRequest } = await import("@/lib/intake");
  await sendIntakeRequest(requestId, staff.id).catch((err) => console.error("EAP intake email failed:", err));
  redirect(`/admin/requests/${requestId}#steps`);
}

/** Emails the client the link to sign the informed consent form (again). */
export async function sendConsentAction(requestId: string) {
  const staff = await requireManager(); // the coordinator sends the consent form
  const { sendConsentRequest } = await import("@/lib/consent");
  try {
    await sendConsentRequest(requestId, staff.id);
  } catch (err) {
    console.error("EAP consent email failed:", err);
  }
  redirect(`/admin/requests/${requestId}?consent=sent#consent`);
}

export async function moveSession(sessionId: string, formData: FormData) {
  const requestId = await sessionRequest(sessionId);
  const { staff } = await requireCase(requestId);
  const startsAt = sessionDate(formData);
  if (!startsAt) redirect(`/admin/requests/${requestId}?session=date#sessions`);
  await pool.query("UPDATE client_sessions SET starts_at = $2::timestamp AT TIME ZONE 'Europe/Prague', reminder_sent_at = NULL, reminder24_sent_at = NULL WHERE id = $1", [
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
  // A private client's counselling sessions can't start before the consent form is signed.
  if (outcome !== "undo") {
    const { rows: gate } = await pool.query<{ blocked: boolean }>(
      `SELECT r.kind = 'private' AND NOT cs.is_discovery
         AND NOT EXISTS (SELECT 1 FROM consent_forms WHERE request_id = r.id) AS blocked
       FROM client_sessions cs JOIN support_requests r ON r.id = cs.request_id WHERE cs.id = $1`,
      [sessionId],
    );
    if (gate[0]?.blocked) redirect(`/admin/requests/${requestId}?session=noconsent#sessions`);
  }
  // Only acts on a real change, so a double click can't count a session twice.
  const { rowCount } = await pool.query(
    outcome === "undo"
      ? "UPDATE client_sessions SET done_at = NULL, late_cancelled = false WHERE id = $1 AND done_at IS NOT NULL"
      : "UPDATE client_sessions SET done_at = now(), late_cancelled = $2 WHERE id = $1 AND done_at IS NULL",
    outcome === "undo" ? [sessionId] : [sessionId, outcome === "late"],
  );
  if (!rowCount) redirect(`/admin/requests/${requestId}#sessions`);
  // A completed (or late-cancelled) private session goes straight onto the client's invoice for the month;
  // one no longer held comes off it.
  if (outcome === "undo") await removeFromInvoice(sessionId);
  else await addToMonthlyInvoice(sessionId);
  const { rows } = await pool.query<{ done: number; kind: ClientKind }>(
    `SELECT (SELECT count(*)::int FROM client_sessions WHERE request_id = r.id AND done_at IS NOT NULL) AS done, r.kind
     FROM support_requests r WHERE r.id = $1`,
    [requestId],
  );
  const limit = sessionLimit(rows[0].kind);
  const counted = limit ? `${rows[0].done} of ${limit}` : `${rows[0].done} so far`;
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

// ---- Payment (private clients) ------------------------------------------------------

/** The price typed in the form: a whole number of CZK, null when left empty, undefined when invalid. */
const priceFrom = (formData: FormData) => parsePrice(formData.get("price"));

export async function setSessionPrice(sessionId: string, formData: FormData) {
  const requestId = await sessionRequest(sessionId);
  const { staff } = await requireCase(requestId);
  if (!isManager(staff)) redirect(`/admin/requests/${requestId}#sessions`); // payments are for coordinators
  const price = priceFrom(formData);
  if (price === undefined) redirect(`/admin/requests/${requestId}?session=price#sessions`);
  const { rows } = await pool.query<{ payment_id: string | null }>(
    "UPDATE client_sessions SET price_czk = $2 WHERE id = $1 RETURNING payment_id",
    [sessionId, price],
  );
  await note(requestId, staff.id, price === null ? "Session price removed." : `Session price set to ${price} CZK.`);
  if (rows[0]?.payment_id) await recomputeInvoice(rows[0].payment_id); // its unpaid invoice follows
  redirect(`/admin/requests/${requestId}#sessions`);
}

/** Quick "Mark paid" on one session: records a payment for it today. "Not paid" undoes that. */
export async function setSessionPaid(sessionId: string, paid: boolean) {
  const requestId = await sessionRequest(sessionId);
  const { staff } = await requireCase(requestId);
  if (!isManager(staff)) redirect(`/admin/requests/${requestId}#sessions`); // payments are for coordinators
  if (paid) {
    const amount = await recordPayment({
      requestId,
      sessionIds: [sessionId],
      amount: null,
      paidOn: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date()),
      method: "Bank transfer",
      invoiceNumber: null,
      staffId: staff.id,
    });
    if (amount !== null) await note(requestId, staff.id, `Session marked paid (${amount} CZK).`);
  } else {
    await unpaySession(sessionId);
    await note(requestId, staff.id, "Session no longer marked paid.");
  }
  redirect(`/admin/requests/${requestId}#sessions`);
}

export async function removeSession(sessionId: string, formData: FormData) {
  const requestId = await sessionRequest(sessionId);
  const { staff } = await requireCase(requestId);
  // Email before deleting, while the session's details still exist.
  const emailed = await emailClient(formData, sessionId, "cancelled");
  const { rows: removed } = await pool.query<{ payment_id: string | null }>(
    "DELETE FROM client_sessions WHERE id = $1 RETURNING payment_id",
    [sessionId],
  );
  if (removed[0]?.payment_id) await recomputeInvoice(removed[0].payment_id); // taken off its unpaid invoice
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

/** Saves the crisis protocol checklist. What changed is written in the team notes, with who and when. */
export async function saveCrisisChecklistAction(requestId: string, formData: FormData) {
  const { staff } = await requireCase(requestId);
  const { CRISIS_KEYS, crisisChecklist, labelOf } = await import("@/lib/crisis");
  const before = await crisisChecklist(requestId);
  const checked = formData.getAll("checked").map(String).filter((k) => CRISIS_KEYS.includes(k));
  const riskRaw = String(formData.get("risk") ?? "");
  const risk = riskRaw === "low" || riskRaw === "high" ? riskRaw : "";
  const emergencyCall = String(formData.get("emergencyCall") ?? "").trim().slice(0, 1000);
  const report = String(formData.get("report") ?? "").trim().slice(0, 8000);
  await pool.query(
    `INSERT INTO crisis_checklists (request_id, checked, risk, emergency_call, report, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5, now(), $6)
     ON CONFLICT (request_id) DO UPDATE SET checked = EXCLUDED.checked, risk = EXCLUDED.risk,
       emergency_call = EXCLUDED.emergency_call, report = EXCLUDED.report, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [requestId, checked, risk, emergencyCall, report, staff.id],
  );
  const added = checked.filter((k) => !before.checked.includes(k)).map(labelOf);
  const removed = before.checked.filter((k) => !checked.includes(k)).map(labelOf);
  const changes = [
    added.length && `ticked: ${added.join("; ")}`,
    removed.length && `unticked: ${removed.join("; ")}`,
    risk !== before.risk && `risk level: ${risk === "high" ? "HIGH" : risk === "low" ? "low to moderate" : "not set"}`,
    emergencyCall !== before.emergency_call && "emergency call details updated",
    report !== before.report && "crisis report updated",
  ].filter(Boolean);
  if (changes.length) await note(requestId, staff.id, `Crisis protocol – ${changes.join(". ")}.`);
  redirect(`/admin/requests/${requestId}?crisisSaved=1#crisis-protocol`);
}

/** Puts an unassigned client on the waiting list (optionally telling them), or takes them off it. */
export async function setWaitingListAction(requestId: string, on: boolean, formData: FormData) {
  const staff = await requireManager();
  const { rows } = await pool.query<{ email: string; first_name: string }>(
    `UPDATE support_requests SET waitlisted_at = CASE WHEN $2 THEN now() END, updated_at = now()
     WHERE id = $1 AND ($2 = false OR assigned_to IS NULL) RETURNING email, first_name`,
    [requestId, on],
  );
  if (!rows[0]) redirect(`/admin/requests/${requestId}`);
  let told = false;
  if (on && formData.get("tellClient") === "yes" && rows[0].email) {
    const { waitingListEmail } = await import("@/lib/email");
    told = await sendEmail(waitingListEmail(rows[0].email, rows[0].first_name)).then(
      () => true,
      (err) => (console.error("EAP waiting list email failed:", err), false),
    );
  }
  await note(requestId, staff.id, on ? `Put on the waiting list.${told ? " The client was told by email." : ""}` : "Taken off the waiting list.");
  redirect(`/admin/requests/${requestId}?waiting=${on ? "on" : "off"}`);
}

/** A coordinator or admin sends a counsellor a formal warning; the third suspends them from new clients. */
export async function sendWarningAction(staffId: string, formData: FormData) {
  const me = await requireManager();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 2000);
  if (!reason) redirect(`/admin/team/${staffId}?warning=empty#warnings`);
  const { issueWarning } = await import("@/lib/warnings");
  const r = await issueWarning(staffId, me.id, reason);
  redirect(`/admin/team/${staffId}?warning=${r.suspended ? "suspended" : r.count}#warnings`);
}

/** Admins lift a suspension (earlier warnings stop counting). */
export async function liftSuspensionAction(staffId: string) {
  const me = await requireManager();
  if (me.role !== "admin") redirect(`/admin/team/${staffId}`);
  const { liftSuspension } = await import("@/lib/warnings");
  await liftSuspension(staffId);
  redirect(`/admin/team/${staffId}?warning=lifted#warnings`);
}

/** The counsellor asks the coordinator to send the consent form and payment details. */
export async function requestConsentFromCoordinatorAction(requestId: string) {
  const { staff } = await requireCase(requestId);
  const { rows } = await pool.query<{ first_name: string }>(
    "UPDATE support_requests SET consent_requested_at = now(), updated_at = now() WHERE id = $1 RETURNING first_name",
    [requestId],
  );
  const { coordinatorEmails } = await import("@/lib/offers");
  const { consentToSendAlert } = await import("@/lib/email");
  await Promise.allSettled((await coordinatorEmails()).map((to) => sendEmail(consentToSendAlert(to, rows[0].first_name, staff.name, requestId))));
  await note(requestId, staff.id, "Informed the coordinator to send the onboarding details (consent form + payment details).");
  redirect(`/admin/requests/${requestId}?consent=requested#steps`);
}

/** The coordinator (or an admin) sends the consent form and the payment details. */
export async function sendConsentAndPaymentAction(requestId: string) {
  const staff = await requireManager();
  const { startCounselling, sendConsentRequest } = await import("@/lib/consent");
  try {
    // The first time: consent form + payment details; afterwards the consent form link again.
    if (!(await startCounselling(requestId, staff.id))) await sendConsentRequest(requestId, staff.id);
    await pool.query("UPDATE support_requests SET consent_reminded_at = NULL WHERE id = $1", [requestId]);
  } catch (err) {
    console.error("EAP consent email failed:", err);
  }
  redirect(`/admin/requests/${requestId}?consent=sent#steps`);
}

// Payment details for one session (amount, account, variable symbol, QR code), emailed only when the
// client asks for them: nothing about payment is sent automatically after a session.
export async function emailSessionPaymentAction(sessionId: string) {
  const requestId = await sessionRequest(sessionId);
  const { staff } = await requireCase(requestId);
  const { sessionPayment } = await import("@/lib/session-qr");
  const pay = await sessionPayment(sessionId);
  const { rows: c } = await pool.query<{ email: string; first_name: string; discovery: boolean; late: boolean }>(
    `SELECT r.email, r.first_name, cs.is_discovery AS discovery, cs.late_cancelled AS late
     FROM client_sessions cs JOIN support_requests r ON r.id = cs.request_id WHERE cs.id = $1`,
    [sessionId],
  );
  if (!pay || !c[0] || c[0].discovery || pay.amount <= 0) redirect(`/admin/requests/${requestId}?session=nopay#sessions`);
  const { qrPng } = await import("@/lib/invoice-pdf");
  const { paymentAfterSession } = await import("@/lib/email");
  try {
    await sendEmail(
      paymentAfterSession(c[0].email, c[0].first_name, {
        when: new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Prague" }).format(pay.startsAt),
        amount: pay.amount,
        account: pay.account,
        iban: pay.iban,
        variableSymbol: pay.variableSymbol,
        qrPngBase64: (await qrPng(pay.qr)).toString("base64"),
        late: c[0].late,
        messageLink: await clientMessageLink(requestId),
      }),
    );
    await note(requestId, staff.id, `Payment details (amount, account, variable symbol ${pay.variableSymbol}, QR code) emailed to the client at their request.`);
  } catch (err) {
    console.error("EAP payment details email failed:", err);
    redirect(`/admin/requests/${requestId}?session=payfail#sessions`);
  }
  redirect(`/admin/requests/${requestId}?session=paysent#sessions`);
}
