import Link from "next/link";
import { assignWaitingAndNotify } from "@/lib/assign";
import { isManager, requireStaff } from "@/lib/auth";
import {
  filterCounts,
  FINISHED,
  listRequests,
  SESSIONS_PER_CLIENT,
  STATUSES,
  STATUS_LABELS,
  type Filter,
  type RequestRow,
} from "@/lib/data";
import { takeCase } from "../actions";
import { age, formatDate, isOverdue } from "../format";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; deleted?: string; declined?: string; gone?: string }>;
}) {
  const sp = await searchParams;
  const me = await requireStaff();
  const manager = isManager(me);
  const filters: Filter[] = manager
    ? ["open", "pool", "awaiting", ...STATUSES, "all"]
    : ["open", "awaiting", ...STATUSES.filter((s) => s !== "scheduled"), "all", "pool"];
  const labels: Record<Filter, string> = {
    open: "Open",
    pool: manager ? "Pool: needs assigning" : "Pool: clients anyone can take",
    awaiting: manager ? "Waiting to accept" : "Waiting for my answer",
    ...STATUS_LABELS,
    all: "All",
  };
  const filter: Filter = filters.includes(sp.status as Filter) ? (sp.status as Filter) : "open";

  // Picks up requests that were waiting for a free place (e.g. a new month has started).
  const newlyAssigned = manager
    ? await assignWaitingAndNotify().catch((err) => {
        console.error("EAP assign waiting failed:", err);
        return [];
      })
    : [];
  const onlyFor = manager ? undefined : me.id;
  const [requests, counts] = await Promise.all([listRequests(filter, onlyFor), filterCounts(onlyFor)]);
  const now = Date.now();

  const summary = manager
    ? [
        counts.pool > 0 && `${counts.pool} in the pool waiting to be assigned`,
        counts.awaiting > 0 && `${counts.awaiting} waiting for a counsellor to accept`,
      ].filter(Boolean)
    : [counts.awaiting > 0 && `${counts.awaiting} new ${counts.awaiting === 1 ? "client is" : "clients are"} waiting for you to accept or decline`].filter(Boolean);

  return (
    <main className="stack" style={{ gap: 20 }}>
      <div className="stack">
        <h1 style={{ fontSize: 32 }}>{manager ? "Support requests" : "My clients"}</h1>
        <p className="lede">
          {summary.length ? `${summary.join(" · ")}.` : manager ? "Nothing waiting to be assigned." : "No new clients waiting for your answer."}
          {!manager && " You only see your own clients, and the pool."}
        </p>
      </div>
      {sp.deleted && <p className="flash" role="status">Request deleted.</p>}
      {sp.declined && <p className="flash" role="status">Declined. The client has gone back to the pool.</p>}
      {sp.gone && <p className="flash" role="status">Someone else took that client just before you.</p>}
      {newlyAssigned.length > 0 && (
        <p className="flash" role="status">
          {newlyAssigned.length} waiting {newlyAssigned.length === 1 ? "request was" : "requests were"} just offered to
          counsellors now that places have opened.
        </p>
      )}

      <nav className="tabs" aria-label="Filter">
        {filters.map((f) => (
          <Link key={f} href={f === "open" ? "/admin" : `/admin?status=${f}`} aria-current={f === filter ? "page" : undefined}>
            {labels[f]}
            <span className="count">{counts[f]}</span>
          </Link>
        ))}
      </nav>

      {filter === "pool" && !manager ? (
        <PoolForCounsellors requests={requests.filter((r) => !r.declined_by.includes(me.id))} now={now} />
      ) : (
        <div className="table-wrap">
          {requests.length === 0 ? (
            <p className="empty">Nothing here.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nickname</th>
                  <th>Company</th>
                  <th>Language</th>
                  <th>Status</th>
                  <th>Sessions</th>
                  <th>{manager ? "Counsellor" : "Offer"}</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className={r.crisis && !FINISHED.includes(r.status) ? "crisis-row" : undefined}>
                    <td>
                      <Link className="rowlink" href={`/admin/requests/${r.id}`}>{r.first_name}</Link>
                      {r.crisis && <> <span className="pill pill-crisis">Crisis</span></>}
                    </td>
                    <td>{r.company_name}</td>
                    <td>{r.language}</td>
                    <td><span className={`pill pill-${r.status}`}>{STATUS_LABELS[r.status]}</span></td>
                    <td className="age">
                      {r.sessions_total === 0 ? <span className="small">—</span> : `${r.sessions_done} / ${SESSIONS_PER_CLIENT} done`}
                      {r.next_session &&
                        (r.next_session.getTime() < now ? (
                          <div className="overdue">{formatDate(r.next_session)} not marked done</div>
                        ) : (
                          <div className="small">next {formatDate(r.next_session)}</div>
                        ))}
                    </td>
                    <td><OfferState r={r} manager={manager} now={now} /></td>
                    <td className="age">
                      {formatDate(r.created_at)}
                      {r.status === "new" && (
                        <div className={isOverdue(r.created_at, now, r.crisis) ? "overdue" : "small"}>
                          waiting {age(r.created_at, now)}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </main>
  );
}

// Who has the case, and whether they've accepted it yet.
function OfferState({ r, manager, now }: { r: RequestRow; manager: boolean; now: number }) {
  if (!r.assigned_to)
    return FINISHED.includes(r.status) ? <span className="small">—</span> : <span className="overdue">In the pool</span>;
  const who = manager ? r.assigned_name : "You";
  if (r.accepted_at) return <>{who}{r.status === "new" && <div className="small">accepted</div>}</>;
  const late = r.respond_by && r.respond_by.getTime() < now;
  return (
    <>
      {manager ? `Offered to ${who}` : <b>Please accept or decline</b>}
      {r.respond_by && (
        <div className={late ? "overdue" : "small"}>answer by {formatDate(r.respond_by)}</div>
      )}
    </>
  );
}

// Counsellors see only what they need to decide whether to take someone: no names or contact details.
function PoolForCounsellors({ requests, now }: { requests: RequestRow[]; now: number }) {
  if (requests.length === 0) return <p className="card empty">The pool is empty.</p>;
  return (
    <div className="pool">
      {requests.map((r) => (
        <form key={r.id} action={takeCase.bind(null, r.id)} className={`card pool-card${r.crisis ? " crisis" : ""}`}>
          <div className="actions" style={{ justifyContent: "space-between" }}>
            <span className="small">Waiting {age(r.created_at, now)}</span>
            {r.crisis && <span className="pill pill-crisis">Crisis</span>}
          </div>
          <dl className="facts">
            <dt>Support with</dt><dd>{r.topics.length ? r.topics.join(", ") : "Not said"}</dd>
            <dt>Language</dt><dd>{r.language}</dd>
            <dt>Online / in person</dt><dd>{r.format}</dd>
            <dt>Age</dt><dd>{r.age_range}</dd>
            <dt>Based in</dt><dd>{r.location}</dd>
          </dl>
          <div className="actions"><button type="submit">Take this client</button></div>
        </form>
      ))}
    </div>
  );
}
