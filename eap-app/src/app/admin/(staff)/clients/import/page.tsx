import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { importClientsAction } from "../../../import-actions";

const ERRORS: Record<string, string> = {
  nofile: "Choose the Excel or CSV file first.",
  type: "Upload an Excel file (.xlsx) or a CSV file.",
  size: "The file is too big (up to 5 MB).",
  confirm: "Tick the box to confirm the clients agreed to their details being kept.",
  read: "The file couldn't be read. Save it as .xlsx (Excel Workbook) or .csv and try again.",
  columns: "Couldn't find the columns. The first row should have headings like Name, Surname and Email.",
};

const rowsText = (s?: string) => (s ? s.split(",").slice(0, 30).join(", ") + (s.split(",").length > 30 ? "…" : "") : "");

// Admins import clients from the previous system: first name, surname and email from a sheet.
export default async function ImportClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; existing?: string; invalid?: string; twice?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const { rows: counsellors } = await pool.query<{ id: string; name: string }>(
    "SELECT id, name FROM staff WHERE password_hash <> '!' AND counsels AND removed_at IS NULL ORDER BY name",
  );
  return (
    <main className="stack" style={{ gap: 20 }}>
      <div className="stack">
        <p className="small"><Link href="/admin/overview">← All clients</Link></p>
        <h1 style={{ fontSize: 32 }}>Import clients from Excel</h1>
        <p className="lede">
          For clients from the previous system. The sheet needs a heading row with <b>Name</b> (first name), <b>Surname</b> and{" "}
          <b>Email</b>; Czech headings (Jméno, Příjmení, E-mail) or one &quot;Full name&quot; column work too. Other columns are ignored.
        </p>
      </div>

      {sp.error && <p className="err" role="alert">{ERRORS[sp.error] ?? "Something went wrong."}</p>}
      {sp.added !== undefined && (
        <section className="card stack" role="status">
          <p className="flash"><b>{sp.added}</b> {sp.added === "1" ? "client" : "clients"} imported. Nothing was emailed to them.</p>
          {sp.existing && <p className="small">Already in the app, skipped (rows): {rowsText(sp.existing)}</p>}
          {sp.twice && <p className="small">The same email twice in the sheet, skipped (rows): {rowsText(sp.twice)}</p>}
          {sp.invalid && <p className="small err">No name or no valid email, skipped (rows): {rowsText(sp.invalid)}</p>}
          <p className="small"><Link href="/admin/overview">See them under All clients →</Link></p>
        </section>
      )}

      <form action={importClientsAction} className="card form stack">
        <div className="field">
          <label htmlFor="sheet">Excel or CSV file</label>
          <input id="sheet" type="file" name="sheet" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" />
          <span className="small">The first sheet is read. Up to 5 MB.</span>
        </div>
        <div className="field">
          <label htmlFor="counsellor">Counsellor<span className="opt">optional</span></label>
          <select id="counsellor" name="counsellor" defaultValue="">
            <option value="">Nobody yet (assign each client later)</option>
            {counsellors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span className="small">Gives all the clients in this file to one counsellor. Import one file per counsellor, or assign them later.</span>
        </div>
        <label className="consent">
          <input type="checkbox" name="confirm" value="yes" />
          <span>These are our existing clients, already in progress with us, who signed our consent form in the previous system.</span>
        </label>
        <p className="small">
          They&apos;re added as private clients in progress, with the language English and no type of counselling yet: set these on
          each client&apos;s page. Their consent form is marked as signed (on file), so their sessions can be marked done
          straight away and they aren&apos;t asked to sign again. Clients whose email is already in the app are skipped, so
          importing the same file twice is safe.
        </p>
        <div className="actions"><button type="submit">Import clients</button></div>
      </form>
    </main>
  );
}
