import Link from "next/link";
import { isManager, requireStaff } from "@/lib/auth";
import { STATUS_LABELS, type Status } from "@/lib/data";
import { pool } from "@/lib/db";

const monthName = (m: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
const shift = (m: string, by: number) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};

type Row = {
  id: string;
  first_name: string;
  full_name: string;
  kind: "eap" | "private";
  company_name: string | null;
  service: string;
  status: Status;
  counsellor: string | null;
  signed_up_this_month: boolean;
  month_held: number;
  month_late: number;
  month_booked: number;
  total_held: number;
  total_booked: number;
  first_session: Date | null;
};

// Clients by month: everyone who signed up or had sessions in a month, with that month's and all-time sessions.
// Counsellors see only their own clients.
export default async function ClientsByMonth({ searchParams }: { searchParams: Promise<{ month?: string; kind?: string }> }) {
  const me = await requireStaff();
  const manager = isManager(me);
  const sp = await searchParams;
  const thisMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit" }).format(new Date());
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth;
  const kind = sp.kind === "eap" || sp.kind === "private" ? sp.kind : "all";
  const inMonth = "to_char(cs.starts_at AT TIME ZONE 'Europe/Prague', 'YYYY-MM') = $1";
  const { rows } = await pool.query<Row>(
    `SELECT r.id, r.first_name, r.full_name, r.kind, c.name AS company_name, r.service, r.status, s.name AS counsellor,
       to_char(r.created_at AT TIME ZONE 'Europe/Prague', 'YYYY-MM') = $1 AS signed_up_this_month,
       count(cs.id) FILTER (WHERE ${inMonth} AND cs.done_at IS NOT NULL)::int AS month_held,
       count(cs.id) FILTER (WHERE ${inMonth} AND cs.late_cancelled)::int AS month_late,
       count(cs.id) FILTER (WHERE ${inMonth} AND cs.done_at IS NULL)::int AS month_booked,
       count(cs.id) FILTER (WHERE cs.done_at IS NOT NULL)::int AS total_held,
       count(cs.id)::int AS total_booked,
       min(cs.starts_at) AS first_session
     FROM support_requests r
     LEFT JOIN companies c ON c.id = r.company_id
     LEFT JOIN staff s ON s.id = r.assigned_to
     LEFT JOIN client_sessions cs ON cs.request_id = r.id
     WHERE ($2::uuid IS NULL OR r.assigned_to = $2) AND ($3 = 'all' OR r.kind = $3)
     GROUP BY r.id, c.name, s.name
     HAVING to_char(r.created_at AT TIME ZONE 'Europe/Prague', 'YYYY-MM') = $1
         OR count(cs.id) FILTER (WHERE ${inMonth}) > 0
     ORDER BY s.name NULLS LAST, r.first_name`,
    [month, manager ? null : me.id, kind],
  );
  const held = rows.reduce((a, r) => a + r.month_held, 0);
  const booked = rows.reduce((a, r) => a + r.month_booked, 0);
  const newClients = rows.filter((r) => r.signed_up_this_month).length;
  const withSessions = rows.filter((r) => r.month_held > 0).length;
  const link = (m: string, k = kind) => `/admin/clients?month=${m}${k !== "all" ? `&kind=${k}` : ""}`;

  return (
    <main className="stack" style={{ gap: 20 }}>
      <div className="stack">
        <h1 style={{ fontSize: 32 }}>Clients by month</h1>
        <p className="lede">
          {manager ? "Everyone" : "Your clients"} who signed up or had sessions in the month, with the month&apos;s and
          all-time sessions. Late cancellations count as sessions held.
        </p>
      </div>
      <nav className="tabs" aria-label="Month">
        <Link href={link(shift(month, -1))}>← {monthName(shift(month, -1))}</Link>
        <Link href={link(month)} aria-current="page">{monthName(month)}</Link>
        {month < thisMonth && <Link href={link(shift(month, 1))}>{monthName(shift(month, 1))} →</Link>}
        {month !== thisMonth && <Link href={link(thisMonth)}>This month</Link>}
      </nav>
      <nav className="tabs" aria-label="Kind of client">
        <Link href={link(month, "all")} aria-current={kind === "all" ? "page" : undefined}>All clients</Link>
        <Link href={link(month, "eap")} aria-current={kind === "eap" ? "page" : undefined}>EAP</Link>
        <Link href={link(month, "private")} aria-current={kind === "private" ? "page" : undefined}>Private</Link>
      </nav>

      <section className="card load-summary">
        <div><span className="big-num">{rows.length}</span><span className="of"> clients</span></div>
        <div><span className="big-num">{newClients}</span><span className="of"> new this month</span></div>
        <div><span className="big-num">{held}</span><span className="of"> sessions held ({withSessions} clients)</span></div>
        <div><span className="big-num">{booked}</span><span className="of"> still booked</span></div>
      </section>

      <div className="table-wrap">
        {rows.length === 0 ? (
          <p className="empty">No clients in {monthName(month)}.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Client of</th>
                {manager && <th>Counsellor</th>}
                <th>{monthName(month)}</th>
                <th>All time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link className="rowlink" href={`/admin/requests/${r.id}`}>{r.first_name}</Link>
                    {r.full_name && <div className="small">{r.full_name}</div>}
                    {r.signed_up_this_month && <span className="pill pill-new">New</span>}
                  </td>
                  <td>
                    {r.company_name ?? <span className="pill pill-private">Private</span>}
                    {r.service && <div className="small">{r.service}</div>}
                  </td>
                  {manager && <td>{r.counsellor ?? <span className="small">—</span>}</td>}
                  <td>
                    <b>{r.month_held}</b> held
                    {r.month_late > 0 && <div className="small">incl. {r.month_late} late cancelled</div>}
                    {r.month_booked > 0 && <div className="small">{r.month_booked} booked</div>}
                  </td>
                  <td>
                    <b>{r.total_held}</b>
                    {r.kind === "eap" ? " / 5" : ""} held
                    {r.total_booked > r.total_held && <div className="small">{r.total_booked - r.total_held} booked ahead</div>}
                  </td>
                  <td><span className={`pill pill-${r.status}`}>{STATUS_LABELS[r.status]}</span></td>
                </tr>
              ))}
              <tr>
                <td><b>Total</b></td>
                <td />
                {manager && <td />}
                <td><b>{held}</b> held</td>
                <td><b>{rows.reduce((a, r) => a + r.total_held, 0)}</b> held</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
