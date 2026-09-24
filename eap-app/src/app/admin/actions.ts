"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { endSession, requireStaff, startSession } from "@/lib/auth";
import { assignWaitingAndNotify, DEFAULT_MONTHLY_CAPACITY } from "@/lib/assign";
import { generateCompanyCode } from "@/lib/codes";
import { STATUSES, STATUS_LABELS, type Status } from "@/lib/data";
import { pool } from "@/lib/db";
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
