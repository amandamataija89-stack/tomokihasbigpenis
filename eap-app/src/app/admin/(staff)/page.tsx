import Link from "next/link";
import { assignWaitingAndNotify } from "@/lib/assign";
import { FINISHED, listRequests, SESSIONS_PER_CLIENT, statusCounts, STATUSES, STATUS_LABELS, type Status } from "@/lib/data";
import { age, formatDate, isOverdue } from "../format";

type Filter = Status | "open" | "all";
const FILTERS: Filter[] = ["open", ...STATUSES, "all"];
const FILTER_LABELS: Record<Filter, string> = { open: "Open", ...STATUS_LABELS, all: "All" };

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; deleted?: string }>;
}) {
  const sp = await searchParams;
  const filter: Filter = FILTERS.includes(sp.status as Filter) ? (sp.status as Filter) : "open";
  // Picks up requests that were waiting for a free place (e.g. a new month has started).
  const newlyAssigned = await assignWaitingAndNotify().catch((err) => {
    console.error("EAP assign waiting failed:", err);
    return [];
  });
  const [requests, counts] = await Promise.all([listRequests(filter), statusCounts()]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const countFor = (f: Filter) => (f === "all" ? total : f === "open" ? total - counts.closed - counts.completed : counts[f]);
  const now = Date.now();

  return (
    <main className="stack" style={{ gap: 20 }}>
      <div className="stack">
        <h1 style={{ fontSize: 32 }}>Support requests</h1>
        <p className="lede">
          {counts.new === 0
            ? "No new requests waiting."
            : `${counts.new} new ${counts.new === 1 ? "request is" : "requests are"} waiting for first contact. Aim to reach each person within 24 hours, and crisis cases within 2.`}
        </p>
      </div>
      {sp.deleted && <p className="flash" role="status">Request deleted.</p>}
      {newlyAssigned.length > 0 && (
        <p className="flash" role="status">
          {newlyAssigned.length} waiting {newlyAssigned.length === 1 ? "request was" : "requests were"} just assigned now
          that places have opened.
        </p>
      )}

      <nav className="tabs" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <Link key={f} href={f === "open" ? "/admin" : `/admin?status=${f}`} aria-current={f === filter ? "page" : undefined}>
            {FILTER_LABELS[f]}
            <span className="count">{countFor(f)}</span>
          </Link>
        ))}
      </nav>

      <div className="table-wrap">
        {requests.length === 0 ? (
          <p className="empty">Nothing here.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Language</th>
                <th>Status</th>
                <th>Sessions</th>
                <th>Assigned</th>
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
                  <td>{r.assigned_name ?? <span className={FINISHED.includes(r.status) ? "small" : "overdue"}>Needs assigning</span>}</td>
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
    </main>
  );
}
