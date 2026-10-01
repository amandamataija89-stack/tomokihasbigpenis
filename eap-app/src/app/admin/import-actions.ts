"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { parseClientRows, readSheet } from "@/lib/client-import";
import { pool } from "@/lib/db";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Admins import clients from the previous system (Excel or CSV: first name, surname, email). They're added as
 * private clients already in progress; nothing is emailed to them. Emails already in the app are skipped.
 */
export async function importClientsAction(formData: FormData) {
  const me = await requireAdmin();
  const back = (q: string) => redirect(`/admin/clients/import?${q}`);
  const file = formData.get("sheet");
  if (!(file instanceof File) || file.size === 0) back("error=nofile");
  const f = file as File;
  if (!/\.(xlsx|csv|txt)$/i.test(f.name)) back("error=type");
  if (f.size > MAX_BYTES) back("error=size");
  if (formData.get("confirm") !== "yes") back("error=confirm");
  let rows: string[][];
  try {
    rows = await readSheet(f.name, await f.arrayBuffer());
  } catch {
    return back("error=read");
  }
  const sheet = parseClientRows(rows!);
  if (sheet.missingColumns) back("error=columns");
  const counsellorId = String(formData.get("counsellor") ?? "");
  const { rows: c } = await pool.query<{ id: string }>("SELECT id FROM staff WHERE id::text = $1 AND counsels AND removed_at IS NULL", [counsellorId]);
  const counsellor = c[0]?.id ?? null;
  let added = 0;
  const existing: number[] = [];
  for (const cl of sheet.clients) {
    const { rows: dup } = await pool.query("SELECT 1 FROM support_requests WHERE lower(email) = $1 AND anonymized_at IS NULL LIMIT 1", [cl.email]);
    if (dup.length) {
      existing.push(cl.row);
      continue;
    }
    const { rows: ins } = await pool.query<{ id: string }>(
      `INSERT INTO support_requests
         (kind, variable_symbol, first_name, full_name, email, phone, contact_method, language, format, topics,
          message, crisis, age_range, gender, location, service, address, consent_at, consent_contact_at, status,
          assigned_to, assigned_at, accepted_at, in_pool, added_by, offer_late_alerted_at, consent_on_file, counselling_agreed_at)
       VALUES ('private', nextval('client_vs_seq')::text, $1, $2, $3, '', 'Email', 'English', 'No preference', '{}',
          '', false, '', '', '', '', '', now(), now(), 'in_progress',
          $4, CASE WHEN $4::uuid IS NOT NULL THEN now() END, CASE WHEN $4::uuid IS NOT NULL THEN now() END, false, $5, now(), true, now())
       RETURNING id`,
      [cl.firstName, `${cl.firstName} ${cl.surname}`.trim(), cl.email, counsellor, me.id],
    );
    await pool.query("INSERT INTO request_notes (request_id, staff_id, body) VALUES ($1, $2, $3)", [
      ins[0].id,
      me.id,
      `Imported from the previous system (${f.name.slice(0, 100)}, row ${cl.row}) by ${me.name}: already a client, consent form signed in the previous system. Nothing was emailed to the client.`,
    ]);
    added++;
  }
  const q = new URLSearchParams({ added: String(added) });
  if (existing.length) q.set("existing", existing.join(","));
  if (sheet.invalid.length) q.set("invalid", sheet.invalid.join(","));
  if (sheet.duplicateInFile.length) q.set("twice", sheet.duplicateInFile.join(","));
  back(q.toString());
}
