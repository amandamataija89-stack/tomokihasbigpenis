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
  searchParams: Promise<{ show?: string }>;
}) {
  await requireManager();
  const { staffId } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(staffId)) notFound();
  const { rows } = await pool.query<{
    name: string;
    email: string;
    role: Role;
    takes_clients: boolean;
    monthly_capacity: number;
    languages: string[];
    away_until: string | null;
  }>(
    `SELECT name, email, role, takes_clients, monthly_capacity, languages, to_char(away_until, 'YYYY-MM-DD') AS away_until
     FROM staff WHERE id = $1`,
    [staffId],
  );
  const s = rows[0];
  if (!s) notFound();
  const filter: Filter = sp.show === "all" ? "all" : "open";
  const [clients, month, open] = await Promise.all([
    listRequests(filter, staffId),
    counsellorMonth(staffId, currentMonth()),
    openAdmin(staffId),
  ]);
  const todo = open.pastUnmarked.length + open.noType.length + open.noPrice.length;

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
      </div>

      <section className="card stack">
        <h2>{monthLabel(currentMonth())}</h2>
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
            </ul>
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
