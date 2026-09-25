"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { endSession, requireStaff, startSession } from "@/lib/auth";
import { assignWaitingAndNotify, DEFAULT_MONTHLY_CAPACITY } from "@/lib/assign";
import { generateCompanyCode } from "@/lib/codes";
import { SESSIONS_PER_CLIENT, STATUSES, STATUS_LABELS, type Status } from "@/lib/data";
import { pool } from "@/lib/db";
import { sendEmail, sessionConfirmation, type SessionEmail } from "@/lib/email";
import { verifyPassword } from "@/lib/password";
import { LANGUAGES } from "@/lib/request-form";

// Every action checks the session itself: server actions are reachable without the page.

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
  const staff = await requireStaff();
  const status = String(formData.get("status") ?? "") as Status;
  const assignedRaw = String(formData.get("assignedTo") ?? "");
  const assignedTo = /^[0-9a-f-]{36}$/i.test(assignedRaw) ? assignedRaw : null;
  if (!STATUSES.includes(status)) throw new Error("Unknown status");

  const crisis = formData.get("crisis") === "yes";
  const { rows } = await pool.query<{ status: Status; assigned_to: string | null; crisis: boolean }>(
    "SELECT status, assigned_to, crisis FROM support_requests WHERE id = $1",
    [requestId],
  );
  if (!rows[0]) redirect("/admin");
  // A reassignment counts towards the new therapist's monthly total from today.
  await pool.query(
    `UPDATE support_requests SET status = $2, assigned_to = $3, crisis = $4, updated_at = now(),
       overdue_warned_at = CASE WHEN assigned_to IS DISTINCT FROM $3::uuid THEN NULL ELSE overdue_warned_at END,
       assigned_at = CASE WHEN $3::uuid IS NULL THEN NULL
                          WHEN assigned_to IS DISTINCT FROM $3::uuid THEN now()
                          ELSE assigned_at END
     WHERE id = $1`,
    [requestId, status, assignedTo, crisis],
  );
  if (rows[0].crisis !== crisis) {
    await pool.query("INSERT INTO request_notes (request_id, staff_id, body) VALUES ($1, $2, $3)", [
      requestId,
      staff.id,
      crisis ? "Marked as a crisis case." : "No longer marked as a crisis case.",
    ]);
  }
  if (rows[0].assigned_to !== assignedTo) {
    const { rows: names } = await pool.query<{ name: string }>("SELECT name FROM staff WHERE id = $1", [assignedTo]);
    await pool.query("INSERT INTO request_notes (request_id, staff_id, body) VALUES ($1, $2, $3)", [
      requestId,
      staff.id,
      names[0] ? `Assigned to ${names[0].name}.` : "Unassigned.",
    ]);
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
  const staff = await requireStaff();
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
  await requireStaff();
  if (formData.get("confirm") !== "yes") redirect(`/admin/requests/${requestId}?confirmDelete=1`);
  await pool.query("DELETE FROM support_requests WHERE id = $1", [requestId]);
  redirect("/admin?deleted=1");
}

export async function createCompany(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  await requireStaff();
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
  await requireStaff();
  await pool.query("UPDATE companies SET active = $2 WHERE id = $1", [companyId, active]);
  revalidatePath("/admin/companies");
}

function therapistFields(formData: FormData) {
  const languages = formData
    .getAll("languages")
    .filter((l): l is string => typeof l === "string" && (LANGUAGES as readonly string[]).includes(l) && l !== "Other");
  const capacity = Number(formData.get("capacity"));
  return {
    languages,
    capacity: Number.isInteger(capacity) && capacity >= 0 && capacity <= 100 ? capacity : null,
    takesClients: formData.get("takesClients") === "yes",
  };
}

export async function addTherapist(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  await requireStaff();
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const f = therapistFields(formData);
  if (!name) return { error: "Enter the therapist's name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter an email address so they can be told about new clients." };
  // "!" is not a valid password hash, so the person can't sign in until given a password with staff:create.
  const { rowCount } = await pool.query(
    `INSERT INTO staff (email, name, password_hash, takes_clients, monthly_capacity, languages)
     VALUES ($1, $2, '!', true, $3, $4)
     ON CONFLICT (email) DO UPDATE SET takes_clients = true, monthly_capacity = EXCLUDED.monthly_capacity,
       languages = EXCLUDED.languages`,
    [email, name, f.capacity ?? DEFAULT_MONTHLY_CAPACITY, f.languages],
  );
  if (!rowCount) return { error: "Couldn't add that therapist. Try again." };
  await assignWaitingAndNotify();
  revalidatePath("/admin/team");
  return {};
}

export async function updateTherapist(staffId: string, formData: FormData) {
  await requireStaff();
  const f = therapistFields(formData);
  await pool.query(
    `UPDATE staff SET takes_clients = $2, monthly_capacity = COALESCE($3, monthly_capacity), languages = $4 WHERE id = $1`,
    [staffId, f.takesClients, f.capacity, f.languages],
  );
  await assignWaitingAndNotify();
  revalidatePath("/admin/team");
  redirect("/admin/team?saved=1");
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
    email: string;
    first_name: string;
    format: string;
    therapist: string | null;
    starts_at: Date;
    number: number;
  }>(
    `SELECT r.email, r.first_name, r.format, s.name AS therapist, cs.starts_at,
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
  const staff = await requireStaff();
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
  const staff = await requireStaff();
  const requestId = await sessionRequest(sessionId);
  const startsAt = sessionDate(formData);
  if (!startsAt) redirect(`/admin/requests/${requestId}?session=date#sessions`);
  await pool.query("UPDATE client_sessions SET starts_at = $2::timestamp AT TIME ZONE 'Europe/Prague' WHERE id = $1", [
    sessionId,
    startsAt,
  ]);
  const emailed = await emailClient(formData, sessionId, "moved");
  await note(requestId, staff.id, `Session moved to ${pragueLabel(startsAt)}.${emailed}`);
  redirect(`/admin/requests/${requestId}#sessions`);
}

export async function setSessionDone(sessionId: string, done: boolean) {
  const staff = await requireStaff();
  const requestId = await sessionRequest(sessionId);
  // Only acts on a real change, so a double click can't count a session twice.
  const { rowCount } = await pool.query(
    done
      ? "UPDATE client_sessions SET done_at = now() WHERE id = $1 AND done_at IS NULL"
      : "UPDATE client_sessions SET done_at = NULL WHERE id = $1 AND done_at IS NOT NULL",
    [sessionId],
  );
  if (!rowCount) redirect(`/admin/requests/${requestId}#sessions`);
  const { rows } = await pool.query<{ done: number }>(
    "SELECT count(*)::int AS done FROM client_sessions WHERE request_id = $1 AND done_at IS NOT NULL",
    [requestId],
  );
  await note(
    requestId,
    staff.id,
    done ? `Session marked done (${rows[0].done} of ${SESSIONS_PER_CLIENT}).` : "Session no longer marked done.",
  );
  await syncStatusWithSessions(requestId, staff.id);
  redirect(`/admin/requests/${requestId}#sessions`);
}

export async function removeSession(sessionId: string, formData: FormData) {
  const staff = await requireStaff();
  const requestId = await sessionRequest(sessionId);
  // Email before deleting, while the session's details still exist.
  const emailed = await emailClient(formData, sessionId, "cancelled");
  await pool.query("DELETE FROM client_sessions WHERE id = $1", [sessionId]);
  await note(requestId, staff.id, `Session removed.${emailed}`);
  await syncStatusWithSessions(requestId, staff.id);
  redirect(`/admin/requests/${requestId}#sessions`);
}

export async function updateClientEmail(requestId: string, formData: FormData) {
  const staff = await requireStaff();
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
