"use server";

import { redirect } from "next/navigation";
import { isManager, requireStaff, type Staff } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getGroup, GROUP_KINDS } from "@/lib/groups";

const text = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);
const back = (groupId: string, flash: string, anchor = "") => redirect(`/admin/groups/${groupId}?done=${flash}${anchor}`);

/** The group, if this staff member may work on it (its counsellor, or a coordinator or admin). */
async function requireGroup(groupId: string): Promise<Staff> {
  const staff = await requireStaff();
  if (!(await getGroup(groupId, staff))) redirect("/admin/groups");
  return staff;
}

export async function createGroupAction(formData: FormData) {
  const staff = await requireStaff();
  const name = text(formData, "name", 120);
  const kind = text(formData, "kind", 80);
  if (!name || !(GROUP_KINDS as readonly string[]).includes(kind)) redirect("/admin/groups?error=1");
  // Counsellors lead the groups they create; coordinators and admins choose who leads.
  const asked = text(formData, "counsellor", 40);
  const counsellor = isManager(staff) ? (/^[0-9a-f-]{36}$/i.test(asked) ? asked : null) : staff.id;
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO support_groups (name, kind, counsellor_id, details) VALUES ($1, $2, $3, $4) RETURNING id",
    [name, kind, counsellor, text(formData, "details", 500)],
  );
  redirect(`/admin/groups/${rows[0].id}?done=created`);
}

export async function updateGroupAction(groupId: string, formData: FormData) {
  const staff = await requireGroup(groupId);
  const name = text(formData, "name", 120);
  const kind = text(formData, "kind", 80);
  if (!name || !(GROUP_KINDS as readonly string[]).includes(kind)) back(groupId, "error");
  const asked = text(formData, "counsellor", 40);
  await pool.query(
    `UPDATE support_groups SET name = $2, kind = $3, details = $4, active = $5,
       counsellor_id = CASE WHEN $6 THEN $7::uuid ELSE counsellor_id END
     WHERE id = $1`,
    [groupId, name, kind, text(formData, "details", 500), formData.get("active") === "yes", isManager(staff), /^[0-9a-f-]{36}$/i.test(asked) ? asked : null],
  );
  back(groupId, "saved");
}

export async function deleteGroupAction(groupId: string, formData: FormData) {
  const staff = await requireGroup(groupId);
  if (!isManager(staff)) back(groupId, "error");
  if (formData.get("confirm") !== "yes") back(groupId, "confirm", "#delete");
  await pool.query("DELETE FROM support_groups WHERE id = $1", [groupId]);
  redirect("/admin/groups?deleted=1");
}

export async function addMemberAction(groupId: string, formData: FormData) {
  await requireGroup(groupId);
  const firstName = text(formData, "firstName", 80);
  const surname = text(formData, "surname", 80);
  const email = text(formData, "email", 200).toLowerCase();
  const signed = text(formData, "consentSignedOn", 10);
  if (!firstName || !surname || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back(groupId, "member", "#members");
  await pool.query(
    "INSERT INTO group_members (group_id, first_name, surname, email, consent_signed_on) VALUES ($1, $2, $3, $4, $5)",
    [groupId, firstName, surname, email, /^\d{4}-\d{2}-\d{2}$/.test(signed) ? signed : null],
  );
  back(groupId, "added", "#members");
}

export async function setConsentAction(groupId: string, memberId: string, formData: FormData) {
  await requireGroup(groupId);
  const signed = text(formData, "consentSignedOn", 10);
  await pool.query("UPDATE group_members SET consent_signed_on = $3 WHERE id = $2 AND group_id = $1", [
    groupId,
    memberId,
    formData.get("signed") === "yes" ? (/^\d{4}-\d{2}-\d{2}$/.test(signed) ? signed : new Date().toISOString().slice(0, 10)) : null,
  ]);
  back(groupId, "consent", "#members");
}

export async function removeMemberAction(groupId: string, memberId: string) {
  await requireGroup(groupId);
  await pool.query("DELETE FROM group_members WHERE id = $2 AND group_id = $1", [groupId, memberId]);
  back(groupId, "removed", "#members");
}

export async function addGroupSessionAction(groupId: string, formData: FormData) {
  await requireGroup(groupId);
  const at = text(formData, "startsAt", 20);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at)) back(groupId, "date", "#attendance");
  await pool.query("INSERT INTO group_sessions (group_id, starts_at) VALUES ($1, $2::timestamp AT TIME ZONE 'Europe/Prague')", [groupId, at]);
  back(groupId, "session", "#attendance");
}

export async function removeGroupSessionAction(groupId: string, sessionId: string) {
  await requireGroup(groupId);
  await pool.query("DELETE FROM group_sessions WHERE id = $2 AND group_id = $1", [groupId, sessionId]);
  back(groupId, "sessionremoved", "#attendance");
}

/** Saves who attended one session: every ticked member was there. */
export async function saveAttendanceAction(groupId: string, sessionId: string, formData: FormData) {
  await requireGroup(groupId);
  const present = formData.getAll("present").map(String);
  const { rows } = await pool.query("SELECT 1 FROM group_sessions WHERE id = $2 AND group_id = $1", [groupId, sessionId]);
  if (!rows.length) back(groupId, "error");
  await pool.query("DELETE FROM group_attendance WHERE session_id = $1", [sessionId]);
  await pool.query(
    `INSERT INTO group_attendance (session_id, member_id)
     SELECT $1, id FROM group_members WHERE group_id = $2 AND id::text = ANY($3::text[])`,
    [sessionId, groupId, present],
  );
  back(groupId, "attendance", "#attendance");
}
