import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { invoiceSettings } from "@/lib/billing";
import { pool } from "@/lib/db";
import { currentMonth, monthLabel, shiftMonth } from "@/lib/month-end";
import { monthPayouts } from "@/lib/payouts";

const czk = (n: number) => `${n.toLocaleString("cs-CZ")} CZK`;
const inMonth = (col: string) => `to_char(${col} AT TIME ZONE 'Europe/Prague', 'YYYY-MM') = $1`;

type Stats = {
  eap_held: number;
  private_held: number;
  discovery_held: number;
  gross: number;
  new_eap: number;
  new_private: number;
  received: number;
  group_sessions: number;
  group_present: number;
  group_possible: number;
};

async function monthStats(ym: string): Promise<Stats> {
  const { rows } = await pool.query<Stats>(
    `SELECT
       (SELECT count(*) FROM client_sessions cs JOIN support_requests r ON r.id = cs.request_id
         WHERE cs.done_at IS NOT NULL AND NOT cs.is_discovery AND r.kind = 'eap' AND ${inMonth("cs.starts_at")})::int AS eap_held,
       (SELECT count(*) FROM client_sessions cs JOIN support_requests r ON r.id = cs.request_id
         WHERE cs.done_at IS NOT NULL AND NOT cs.is_discovery AND r.kind = 'private' AND ${inMonth("cs.starts_at")})::int AS private_held,
       (SELECT count(*) FROM client_sessions cs WHERE cs.done_at IS NOT NULL AND cs.is_discovery AND ${inMonth("cs.starts_at")})::int AS discovery_held,
       (SELECT COALESCE(sum(cs.price_czk), 0) FROM client_sessions cs JOIN support_requests r ON r.id = cs.request_id
         WHERE cs.done_at IS NOT NULL AND NOT cs.is_discovery AND r.kind = 'private' AND ${inMonth("cs.starts_at")})::int AS gross,
       (SELECT count(*) FROM support_requests WHERE kind = 'eap' AND ${inMonth("created_at")})::int AS new_eap,
       (SELECT count(*) FROM support_requests WHERE kind = 'private' AND ${inMonth("created_at")})::int AS new_private,
       (SELECT COALESCE(sum(amount_czk), 0) FROM payments WHERE paid_on IS NOT NULL AND to_char(paid_on, 'YYYY-MM') = $1)::int AS received,
       (SELECT count(*) FROM group_sessions gs WHERE ${inMonth("gs.starts_at")} AND gs.starts_at < now())::int AS group_sessions,
       (SELECT count(*) FROM group_attendance a JOIN group_sessions gs ON gs.id = a.session_id WHERE ${inMonth("gs.starts_at")})::int AS group_present,
       (SELECT COALESCE(sum((SELECT count(*) FROM group_members m WHERE m.group_id = gs.group_id)), 0)
         FROM group_sessions gs WHERE ${inMonth("gs.starts_at")} AND gs.starts_at < now())::int AS group_possible`,
    [ym],
  );
  return rows[0];
}

// The owner's overview of a month: sessions, clients, money, counsellors. Admins only.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requireStaff();
  if (me.role !== "admin") redirect("/admin");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth();
  const prev = shiftMonth(month, -1);
  const [now, before, payouts, settings, { rows: live }, { rows: team }] = await Promise.all([
    monthStats(month),
    monthStats(prev),
    monthPayouts(month),
    invoiceSettings(),
    pool.query<{ open: number; crisis: number; waiting: number; pool: number; unpaid: number; overdue: number; overdue_count: number }>(
      `SELECT
         (SELECT count(*) FROM support_requests WHERE status NOT IN ('completed', 'closed'))::int AS open,
         (SELECT count(*) FROM support_requests WHERE crisis AND status NOT IN ('completed', 'closed'))::int AS crisis,
         (SELECT count(*) FROM support_requests WHERE waitlisted_at IS NOT NULL AND assigned_to IS NULL AND status NOT IN ('completed', 'closed'))::int AS waiting,
         (SELECT count(*) FROM support_requests WHERE assigned_to IS NULL AND status = 'new')::int AS pool,
         (SELECT COALESCE(sum(amount_czk), 0) FROM payments WHERE paid_on IS NULL AND invoice_number IS NOT NULL)::int AS unpaid,
         (SELECT COALESCE(sum(amount_czk), 0) FROM payments WHERE paid_on IS NULL AND invoice_number IS NOT NULL AND due_on < current_date)::int AS overdue,
         (SELECT count(*) FROM payments WHERE paid_on IS NULL AND invoice_number IS NOT NULL AND due_on < current_date)::int AS overdue_count`,
    ),
    pool.query<{ id: string; name: string; clients: number; held: number; new_clients: number; takes_clients: boolean }>(
      `SELECT s.id, s.name, s.takes_clients,
         (SELECT count(*) FROM support_requests r WHERE r.assigned_to = s.id AND r.status NOT IN ('completed', 'closed'))::int AS clients,
         (SELECT count(*) FROM client_sessions cs JOIN support_requests r ON r.id = cs.request_id
           WHERE r.assigned_to = s.id AND cs.done_at IS NOT NULL AND NOT cs.is_discovery AND ${inMonth("cs.starts_at")})::int AS held,
         (SELECT count(*) FROM support_requests r WHERE r.assigned_to = s.id AND ${inMonth("r.assigned_at")})::int AS new_clients
       FROM staff s WHERE s.password_hash <> '!' ORDER BY s.name`,
      [month],
    ),
  ]);
  const toNet = (g: number) => (settings.vatPayer ? Math.round((g * 100) / (100 + settings.vatRate)) : g);
  const payoutTotal = payouts.reduce((a, p) => a + p.payout, 0);
  const payoutOf = new Map(payouts.map((p) => [p.staff_id, p.payout]));
  const diff = (a: number, b: number) => {
    if (a === b) return <span className="small">same as {monthLabel(prev)}</span>;
    const up = a > b;
    return <span className={`small ${up ? "trend-up" : "trend-down"}`}>{up ? "▲" : "▼"} {Math.abs(a - b).toLocaleString("cs-CZ")} vs {monthLabel(prev)}</span>;
  };
  const tile = (label: string, value: string | number, a?: number, b?: number) => (
    <div className="tile">
      <span className="small">{label}</span>
      <span className="big-num">{value}</span>
      {a !== undefined && b !== undefined && diff(a, b)}
    </div>
  );
  const attendance = now.group_possible ? Math.round((now.group_present / now.group_possible) * 100) : null;
  return (
    <main className="stack" style={{ gap: 20 }}>
      <div className="stack">
        <h1 style={{ fontSize: 32 }}>Dashboard</h1>
        <p className="lede">{monthLabel(month)} at a glance, compared with {monthLabel(prev)}.</p>
      </div>
      <nav className="tabs" aria-label="Month">
        <Link href={`/admin/dashboard?month=${prev}`}>← {monthLabel(prev)}</Link>
        <Link href={`/admin/dashboard?month=${month}`} aria-current="page">{monthLabel(month)}</Link>
        {month < currentMonth() && <Link href={`/admin/dashboard?month=${shiftMonth(month, 1)}`}>{monthLabel(shiftMonth(month, 1))} →</Link>}
      </nav>

      <h2 style={{ fontSize: 20 }}>Sessions and clients</h2>
      <section className="tiles">
        {tile("Private sessions held", now.private_held, now.private_held, before.private_held)}
        {tile("EAP sessions held", now.eap_held, now.eap_held, before.eap_held)}
        {tile("Free discovery sessions", now.discovery_held, now.discovery_held, before.discovery_held)}
        {tile("New private clients", now.new_private, now.new_private, before.new_private)}
        {tile("New EAP clients", now.new_eap, now.new_eap, before.new_eap)}
        {tile("Group sessions", now.group_sessions, now.group_sessions, before.group_sessions)}
        {attendance !== null && tile("Group attendance", `${attendance} %`)}
      </section>

      <h2 style={{ fontSize: 20 }}>Money (private clients)</h2>
      <section className="tiles">
        {tile("Sessions held, with VAT", czk(now.gross), now.gross, before.gross)}
        {tile("Without VAT", czk(toNet(now.gross)), toNet(now.gross), toNet(before.gross))}
        {tile("Payments received", czk(now.received), now.received, before.received)}
        {tile("Counsellor payouts", czk(payoutTotal))}
        {tile("Kept after payouts (without VAT)", czk(toNet(now.gross) - payouts.reduce((a, p) => a + p.lines.filter((l) => l.kind === "private").reduce((b, l) => b + l.payout, 0), 0)))}
      </section>

      <h2 style={{ fontSize: 20 }}>Right now</h2>
      <section className="tiles">
        {tile("Open clients", live[0].open)}
        <Link href="/admin?status=crisis" className="tile">{<><span className="small">Crisis cases</span><span className={`big-num${live[0].crisis ? " overdue" : ""}`}>{live[0].crisis}</span></>}</Link>
        <Link href="/admin?status=pool" className="tile"><span className="small">To assign</span><span className="big-num">{live[0].pool}</span></Link>
        <Link href="/admin?status=waiting" className="tile"><span className="small">Waiting list</span><span className="big-num">{live[0].waiting}</span></Link>
        <Link href="/admin/billing" className="tile"><span className="small">Unpaid invoices</span><span className="big-num">{czk(live[0].unpaid)}</span></Link>
        <Link href="/admin/billing" className="tile">
          <span className="small">Overdue</span>
          <span className={`big-num${live[0].overdue ? " overdue" : ""}`}>{czk(live[0].overdue)}</span>
          <span className="small">{live[0].overdue_count} invoice{live[0].overdue_count === 1 ? "" : "s"}</span>
        </Link>
      </section>

      <h2 style={{ fontSize: 20 }}>Counsellors in {monthLabel(month)}</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Counsellor</th><th>Current clients</th><th>New clients</th><th>Sessions held</th><th>Payout</th><th>Taking new clients</th></tr>
          </thead>
          <tbody>
            {team.map((t) => (
              <tr key={t.id}>
                <td><Link href={`/admin/team/${t.id}`}>{t.name}</Link></td>
                <td>{t.clients}</td>
                <td>{t.new_clients}</td>
                <td>{t.held}</td>
                <td>{czk(payoutOf.get(t.id) ?? 0)}</td>
                <td>{t.takes_clients ? "Yes" : <span className="small">No</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
