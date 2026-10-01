import Link from "next/link";
import { isManager, requireStaff } from "@/lib/auth";
import { STATUS_LABELS, type Status } from "@/lib/data";
import { pool } from "@/lib/db";
import { formatDate } from "../../format";

const czk = (n: number) => `${n.toLocaleString("cs-CZ")} CZK`;

type Row = {
  id: string;
  first_name: string;
  full_name: string;
  email: string;
  kind: "eap" | "private";
  company_name: string | null;
  service: string;
  status: Status;
  crisis: boolean;
  counsellor: string | null;
  counsellor_id: string | null;
  variable_symbol: string | null;
  session_price_czk: number | null;
  held: number;
  booked_ahead: number;
  next_session: Date | null;
  last_session: Date | null;
  unpaid_amount: number;
  consent_signed: boolean;
  created_at: Date;
};

// All clients at a glance, with search and filters. Coordinators and admins see everyone; counsellors their own.
export default async function ClientsOverview({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; status?: string; counsellor?: string; crisis?: string }>;
}) {
  const me = await requireStaff();
  const manager = isManager(me);
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const kind = sp.kind === "eap" || sp.kind === "private" ? sp.kind : "";
  const status = sp.status === "finished" || sp.status === "all" ? sp.status : "current";
  const counsellor = manager && /^[0-9a-f-]{36}$/i.test(sp.counsellor ?? "") ? sp.counsellor! : manager ? "" : me.id;
  const crisis = sp.crisis === "1";

  const where: string[] = [];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q.replace(/[%_]/g, "")}%`);
    where.push(`(r.first_name ILIKE $${params.length} OR r.full_name ILIKE $${params.length} OR r.email ILIKE $${params.length} OR r.variable_symbol ILIKE $${params.length})`);
  }
  if (kind) where.push(`r.kind = $${params.push(kind)}`);
  if (status === "current") where.push("r.status NOT IN ('completed', 'closed')");
  if (status === "finished") where.push("r.status IN ('completed', 'closed')");
  if (counsellor) where.push(`r.assigned_to = $${params.push(counsellor)}`);
  if (crisis) where.push("r.crisis");

  const [{ rows }, { rows: staff }] = await Promise.all([
    pool.query<Row>(
      `SELECT r.id, r.first_name, r.full_name, r.email, r.kind, c.name AS company_name, r.service, r.status, r.crisis,
         s.name AS counsellor, r.assigned_to AS counsellor_id, r.variable_symbol, r.session_price_czk, r.created_at,
         (SELECT count(*)::int FROM client_sessions WHERE request_id = r.id AND done_at IS NOT NULL) AS held,
         (SELECT count(*)::int FROM client_sessions WHERE request_id = r.id AND done_at IS NULL AND starts_at > now()) AS booked_ahead,
         (SELECT min(starts_at) FROM client_sessions WHERE request_id = r.id AND done_at IS NULL AND starts_at > now()) AS next_session,
         (SELECT max(starts_at) FROM client_sessions WHERE request_id = r.id AND done_at IS NOT NULL) AS last_session,
         (SELECT COALESCE(sum(price_czk), 0)::int FROM client_sessions WHERE request_id = r.id AND done_at IS NOT NULL AND paid_at IS NULL) AS unpaid_amount,
         EXISTS (SELECT 1 FROM consent_forms WHERE request_id = r.id) AS consent_signed
       FROM support_requests r
       LEFT JOIN companies c ON c.id = r.company_id
       LEFT JOIN staff s ON s.id = r.assigned_to
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY r.crisis AND r.status NOT IN ('completed', 'closed') DESC, s.name NULLS FIRST, r.first_name
       LIMIT 1000`,
      params,
    ),
    manager
      ? pool.query<{ id: string; name: string }>("SELECT id, name FROM staff WHERE password_hash <> '!' AND counsels ORDER BY name")
      : Promise.resolve({ rows: [] as { id: string; name: string }[] }),
  ]);
  const totalHeld = rows.reduce((a, r) => a + r.held, 0);
  const unpaid = rows.reduce((a, r) => a + (r.kind === "private" ? r.unpaid_amount : 0), 0);

  return (
    <main className="stack" style={{ gap: 20 }}>
      <div className="stack">
        <h1 style={{ fontSize: 32 }}>{manager ? "All clients" : "All my clients"}</h1>
        <p className="lede">Search by name, email or variable symbol, and filter. Click a client to open their page.</p>
        <p><Link className="button small-btn" href="/admin/clients/new">+ Add a client</Link></p>
      </div>

      <form className="card filters" method="get">
        <input type="search" name="q" defaultValue={q} placeholder="Search name, email or variable symbol" aria-label="Search" />
        <select name="kind" defaultValue={kind} aria-label="Kind of client">
          <option value="">EAP and private</option>
          <option value="eap">EAP only</option>
          <option value="private">Private only</option>
        </select>
        <select name="status" defaultValue={status} aria-label="Status">
          <option value="current">Current clients</option>
          <option value="finished">Finished</option>
          <option value="all">All</option>
        </select>
        {manager && (
          <select name="counsellor" defaultValue={counsellor} aria-label="Counsellor">
            <option value="">All counsellors</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <label className="consent small-consent">
          <input type="checkbox" name="crisis" value="1" defaultChecked={crisis} />
          <span>Crisis only</span>
        </label>
        <button type="submit" className="small-btn">Show</button>
      </form>

      <section className="card load-summary">
        <div><span className="big-num">{rows.length}</span><span className="of"> clients</span></div>
        <div><span className="big-num">{rows.filter((r) => r.crisis && !["completed", "closed"].includes(r.status)).length}</span><span className="of"> crisis</span></div>
        <div><span className="big-num">{totalHeld}</span><span className="of"> sessions held in total</span></div>
        <div><span className="big-num">{czk(unpaid)}</span><span className="of"> unpaid (private)</span></div>
      </section>

      <div className="table-wrap">
        {rows.length === 0 ? (
          <p className="empty">No clients match.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Client of</th>
                {manager && <th>Counsellor</th>}
                <th>Status</th>
                <th>Sessions</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.crisis && !["completed", "closed"].includes(r.status) ? "crisis-row" : undefined}>
                  <td>
                    <Link className="rowlink" href={`/admin/requests/${r.id}`}>{r.first_name}</Link>
                    {r.crisis && <> <span className="pill pill-crisis">Crisis</span></>}
                    {r.full_name && <div className="small">{r.full_name}</div>}
                    <div className="small">since {formatDate(r.created_at)}</div>
                  </td>
                  <td>
                    {r.company_name ?? <span className="pill pill-private">Private</span>}
                    {r.service && <div className="small">{r.service}</div>}
                    {r.kind === "private" && !r.consent_signed && r.held + r.booked_ahead > 0 && (
                      <div className="overdue">consent not signed</div>
                    )}
                  </td>
                  {manager && (
                    <td>
                      {r.counsellor_id ? <Link href={`/admin/team/${r.counsellor_id}`}>{r.counsellor}</Link> : <span className="overdue">not assigned</span>}
                    </td>
                  )}
                  <td><span className={`pill pill-${r.status}`}>{STATUS_LABELS[r.status]}</span></td>
                  <td className="age">
                    <b>{r.held}</b>{r.kind === "eap" ? " / 5" : ""} held
                    {r.last_session && <div className="small">last {formatDate(r.last_session)}</div>}
                    {r.next_session && <div className="small">next {formatDate(r.next_session)}</div>}
                  </td>
                  <td className="age">
                    {r.kind === "private" ? (
                      <>
                        {r.session_price_czk !== null ? czk(r.session_price_czk) : <span className="overdue">no price</span>}
                        {r.variable_symbol && <div className="small">VS {r.variable_symbol}</div>}
                        {r.unpaid_amount > 0 && <div className="overdue">{czk(r.unpaid_amount)} unpaid</div>}
                      </>
                    ) : (
                      <span className="small">paid by employer</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
