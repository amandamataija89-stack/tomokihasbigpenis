import Link from "next/link";
import { listRequests, statusCounts, STATUSES, STATUS_LABELS, type Status } from "@/lib/data";
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
  const [requests, counts] = await Promise.all([listRequests(filter), statusCounts()]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const countFor = (f: Filter) => (f === "all" ? total : f === "open" ? total - counts.closed : counts[f]);
  const now = Date.now();

  return (
    <main className="stack" style={{ gap: 20 }}>
      <div className="stack">
        <h1 style={{ fontSize: 32 }}>Support requests</h1>
        <p className="lede">
          {counts.new === 0
            ? "No new requests waiting."
            : `${counts.new} new ${counts.new === 1 ? "request is" : "requests are"} waiting for first contact. Aim to reach each person within 24 hours.`}
        </p>
      </div>
      {sp.deleted && <p className="flash" role="status">Request deleted.</p>}

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
                <th>Contact by</th>
                <th>Language</th>
                <th>Status</th>
                <th>Assigned</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link className="rowlink" href={`/admin/requests/${r.id}`}>{r.first_name}</Link>
                  </td>
                  <td>{r.company_name}</td>
                  <td>{r.contact_method}</td>
                  <td>{r.language}</td>
                  <td><span className={`pill pill-${r.status}`}>{STATUS_LABELS[r.status]}</span></td>
                  <td>{r.assigned_name ?? <span className="small">Unassigned</span>}</td>
                  <td className="age">
                    {formatDate(r.created_at)}
                    {r.status === "new" && (
                      <div className={isOverdue(r.created_at, now) ? "overdue" : "small"}>
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
