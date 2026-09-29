import { pool } from "@/lib/db";

/** Staff who can have clients, for the counsellor filters. */
export async function counsellorOptions() {
  const { rows } = await pool.query<{ id: string; name: string }>("SELECT id, name FROM staff WHERE password_hash <> '!' ORDER BY name");
  return rows;
}

export const isStaffId = (v: string | undefined): v is string => /^[0-9a-f-]{36}$/i.test(v ?? "");

// Filters a list by counsellor (coordinators and admins). A plain form, so it works without JavaScript.
export function CounsellorFilter({
  action,
  keep,
  value,
  staff,
}: {
  action: string;
  keep: Record<string, string>; // the list's other filters, kept when choosing a counsellor
  value: string;
  staff: { id: string; name: string }[];
}) {
  return (
    <form method="get" action={action} className="filters counsellor-filter">
      <label htmlFor="counsellor-filter" className="small"><b>Counsellor</b></label>
      {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <select id="counsellor-filter" name="counsellor" defaultValue={value}>
        <option value="">All counsellors</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <button type="submit" className="small-btn">Show</button>
    </form>
  );
}
