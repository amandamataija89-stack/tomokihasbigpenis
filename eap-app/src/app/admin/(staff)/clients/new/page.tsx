import { isManager, requireStaff } from "@/lib/auth";
import { pool } from "@/lib/db";
import { AddClientForm } from "./AddClientForm";

// Add a client who didn't register through the website.
export default async function AddClientPage() {
  const me = await requireStaff();
  const manager = isManager(me);
  const [{ rows: companies }, { rows: counsellors }] = await Promise.all([
    pool.query<{ id: string; name: string }>("SELECT id, name FROM companies WHERE active ORDER BY name"),
    pool.query<{ id: string; name: string }>(
      `SELECT id, name || CASE WHEN suspended_at IS NOT NULL THEN ' (suspended)' WHEN takes_clients AND (away_until IS NULL OR away_until < (now() AT TIME ZONE 'Europe/Prague')::date)
         THEN '' ELSE ' (not taking new clients)' END AS name
       FROM staff WHERE password_hash <> '!' ORDER BY staff.name`,
    ),
  ]);
  return (
    <main className="stack" style={{ gap: 20 }}>
      <div className="stack">
        <h1 style={{ fontSize: 32 }}>Add a client</h1>
        <p className="lede">
          For clients who contacted you by phone, email or in person instead of registering on the website.
          {manager ? "" : " They'll be your client."}
        </p>
      </div>
      <AddClientForm manager={manager} companies={companies} counsellors={counsellors} />
    </main>
  );
}
