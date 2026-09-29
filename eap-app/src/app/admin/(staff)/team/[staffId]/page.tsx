import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManager, ROLE_LABELS, type Role } from "@/lib/auth";
import { FINISHED, listRequests, sessionLimit, STATUS_LABELS, type Filter } from "@/lib/data";
import { pool } from "@/lib/db";
import { adminDeadline, counsellorMonth, currentMonth, monthLabel, openAdmin } from "@/lib/month-end";
import { formatDate } from "../../../format";

const czk = (n: number) => `${n.toLocaleString("cs-CZ")} CZK`;

// A counsellor's profile for coordinators and admins: every client they have, their month, and admin left to do.
export default async function CounsellorProfile({
  params,
  searchParams,
}: {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<{ show?: string; month?: string }>;
}) {
  const me = await requireManager();
  const { staffId } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(staffId)) notFound();
  const { rows } = await pool.query<{
    name: string;
    email: string;
    role: Role;
    availability_note: string;
    takes_clients: boolean;
    monthly_capacity: number;
    languages: string[];
    away_until: string | null;
  }>(
    `SELECT name, email, role, takes_clients, availability_note, monthly_capacity, languages, to_char(away_until, 'YYYY-MM-DD') AS away_until
     FROM staff WHERE id = $1`,
    [staffId],
  );
  const s = rows[0];
  if (!s) notFound();
  const filter: Filter = sp.show === "all" ? "all" : "open";
  const sessionMonth = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth();
  const [clients, month, open, { rows: sessions }] = await Promise.all([
    listRequests(filter, staffId),
    counsellorMonth(staffId, sessionMonth),
    openAdmin(staffId),
    pool.query<{
      id: string;
      request_id: string;
      first_name: string;
      full_name: string;
      kind: "eap" | "private";
      company_name: string | null;
      starts_at: Date;
      done_at: Date | null;
      late_cancelled: boolean;
      price_czk: number | null;
      paid_at: Date | null;
    }>(
      `SELECT cs.id, r.id AS request_id, r.first_name, r.full_name, r.kind, c.name AS company_name, cs.starts_at, cs.done_at,
         cs.late_cancelled, cs.price_czk, cs.paid_at
       FROM client_sessions cs JOIN support_requests r ON r.id = cs.request_id LEFT JOIN companies c ON c.id = r.company_id
       WHERE r.assigned_to = $1 AND to_char(cs.starts_at AT TIME ZONE 'Europe/Prague', 'YYYY-MM') = $2
       ORDER BY cs.starts_at`,
      [staffId, sessionMonth],
    ),
  ]);
  const shiftMonth = (m: string, by: number) => {
    const d = new Date(`${m}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + by);
    return d.toISOString().slice(0, 7);
  };
  const now = Date.now();
  const todo = open.pastUnmarked.length + open.noType.length + open.noPrice.length + open.noConsent.length;

  return (
    <main className="stack" style={{ gap: 20 }}>
      <p className="small"><Link href="/admin/team">← Team</Link></p>
      <div className="stack">
        <h1 style={{ fontSize: 32 }}>{s.name}</h1>
        <p className="lede">
          {ROLE_LABELS[s.role]} · {s.email} · {s.takes_clients ? `up to ${s.monthly_capacity} new EAP clients a month` : "not taking new clients"}
          {s.away_until ? ` · away until ${s.away_until}` : ""}
          {s.languages.length ? ` · ${s.languages.join(", ")}` : ""}
        </p>
        {s.availability_note && <p className="small" style={{ whiteSpace: "pre-wrap" }}><b>Available:</b> {s.availability_note}</p>}
      </div>

      <section className="card stack">
        <h2>{monthLabel(sessionMonth)}</h2>
        <dl className="totals">
          <div><dt>EAP sessions held</dt><dd><b>{month.eapSessions}</b></dd></div>
          <div><dt>Private sessions held</dt><dd><b>{month.privateSessions}</b> · {czk(month.privateAmount)}</dd></div>
          <div><dt>Of which paid</dt><dd>{czk(month.paidAmount)}</dd></div>
        </dl>
        {todo === 0 ? (
          <p className="small">No admin left to do.</p>
        ) : (
          <div className="notice stack" style={{ gap: 6 }}>
            <b>Still to do by {adminDeadline()}:</b>
            <ul className="small" style={{ margin: 0 }}>
              {open.pastUnmarked.map((p) => (
                <li key={`${p.requestId}-${p.startsAt.toISOString()}`}>
                  <Link href={`/admin/requests/${p.requestId}#sessions`}>{p.firstName}</Link>: session on {formatDate(p.startsAt)} not marked
                </li>
              ))}
              {open.noType.map((c) => (
                <li key={`t-${c.requestId}`}><Link href={`/admin/requests/${c.requestId}#price`}>{c.firstName}</Link>: no type of counselling</li>
              ))}
              {open.noPrice.map((c) => (
                <li key={`p-${c.requestId}`}><Link href={`/admin/requests/${c.requestId}#price`}>{c.firstName}</Link>: no price</li>
              ))}
            {open.noConsent.map((c) => (
              <li key={`c-${c.requestId}`}>
                <Link href={`/admin/requests/${c.requestId}#consent`}>{c.firstName}</Link>: consent form not signed yet
              </li>
            ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card stack" id="sessions">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <h2>Sessions in {monthLabel(sessionMonth)}</h2>
          <nav className="tabs" aria-label="Month">
            <Link href={`/admin/team/${staffId}?month=${shiftMonth(sessionMonth, -1)}#sessions`}>← {monthLabel(shiftMonth(sessionMonth, -1))}</Link>
            {sessionMonth < currentMonth() && (
              <Link href={`/admin/team/${staffId}?month=${shiftMonth(sessionMonth, 1)}#sessions`}>{monthLabel(shiftMonth(sessionMonth, 1))} →</Link>
            )}
            {me.role === "admin" && (
              <a href={`/admin/sessions/export?month=${sessionMonth}&counsellor=${staffId}`} title="Confidential – do not distribute">
                Export to Excel (confidential)
              </a>
            )}
          </nav>
        </div>
        {sessions.length === 0 ? (
          <p className="small">No sessions this month.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Client</th><th>Client of</th><th>Session</th><th>Price</th></tr>
              </thead>
              <tbody>
                {sessions.map((x) => (
                  <tr key={x.id}>
                    <td className="age">{formatDate(x.starts_at)}</td>
                    <td>
                      <Link className="rowlink" href={`/admin/requests/${x.request_id}#sessions`}>{x.first_name}</Link>
                      {x.full_name && <div className="small">{x.full_name}</div>}
                    </td>
                    <td>{x.company_name ?? <span className="pill pill-private">Private</span>}</td>
                    <td>
                      {x.done_at ? (
                        x.late_cancelled ? <span className="pill pill-contacted">Late cancellation</span> : <span className="pill pill-completed">✓ Held</span>
                      ) : x.starts_at.getTime() < now ? (
                        <span className="overdue">Not marked yet</span>
                      ) : (
                        <span className="pill pill-scheduled">Booked</span>
                      )}
                    </td>
                    <td className="age">
                      {x.kind === "private" ? (
                        <>
                          {x.price_czk !== null ? czk(x.price_czk) : <span className="overdue">no price</span>}
                          {x.paid_at ? <div className="small">paid</div> : x.done_at ? <div className="overdue">unpaid</div> : null}
                        </>
                      ) : (
                        <span className="small">EAP</span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3}><b>Total</b></td>
                  <td><b>{sessions.filter((x) => x.done_at).length}</b> held of {sessions.length}</td>
                  <td><b>{czk(sessions.filter((x) => x.done_at && x.kind === "private").reduce((a, x) => a + (x.price_czk ?? 0), 0))}</b></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <nav className="tabs" aria-label="Clients">
        <Link href={`/admin/team/${staffId}`} aria-current={filter === "open" ? "page" : undefined}>Current clients</Link>
        <Link href={`/admin/team/${staffId}?show=all`} aria-current={filter === "all" ? "page" : undefined}>All clients, including finished</Link>
      </nav>
      <div className="table-wrap">
        {clients.length === 0 ? (
          <p className="empty">No clients here.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Client of</th>
                <th>Status</th>
                <th>Sessions</th>
                <th>Price</th>
                <th>Since</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((r) => (
                <tr key={r.id} className={r.crisis && !FINISHED.includes(r.status) ? "crisis-row" : undefined}>
                  <td>
                    <Link className="rowlink" href={`/admin/requests/${r.id}`}>{r.first_name}</Link>
                    {r.full_name && <div className="small">{r.full_name}</div>}
                    {r.crisis && <span className="pill pill-crisis">Crisis</span>}
                  </td>
                  <td>
                    {r.company_name ?? <span className="pill pill-private">Private</span>}
                    {r.service && <div className="small">{r.service}</div>}
                  </td>
                  <td>
                    <span className={`pill pill-${r.status}`}>{STATUS_LABELS[r.status]}</span>
                    {!r.accepted_at && r.status === "new" && <div className="small">offered, not accepted yet</div>}
                  </td>
                  <td className="age">
                    {r.sessions_done}{sessionLimit(r.kind) ? ` / ${sessionLimit(r.kind)}` : ""} done
                    {r.next_session && <div className="small">next {formatDate(r.next_session)}</div>}
                    {r.unpaid > 0 && <div className="overdue">{r.unpaid} unpaid</div>}
                  </td>
                  <td>{r.kind === "private" ? (r.session_price_czk !== null ? czk(r.session_price_czk) : <span className="overdue">not set</span>) : "—"}</td>
                  <td className="age">{formatDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
