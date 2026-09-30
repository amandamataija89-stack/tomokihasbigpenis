import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { currentMonth, monthLabel, shiftMonth } from "@/lib/month-end";
import { monthPayouts, type Payout } from "@/lib/payouts";
import { formatDate } from "../../format";

const czk = (n: number) => `${n.toLocaleString("cs-CZ")} CZK`;

// Counsellor payouts. Admins see everyone's; everyone else sees their own statement.
export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requireStaff();
  const admin = me.role === "admin";
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : shiftMonth(currentMonth(), -1);
  const payouts = await monthPayouts(month, admin ? null : me.id);
  const total = payouts.reduce((a, p) => a + p.payout, 0);
  const privateNet = payouts.reduce((a, p) => a + p.private_net, 0);
  const privatePayout = payouts.reduce((a, p) => a + p.lines.filter((l) => l.kind === "private").reduce((b, l) => b + l.payout, 0), 0);
  return (
    <main className="stack" style={{ gap: 20 }}>
      <div className="stack">
        <h1 style={{ fontSize: 32 }}>{admin ? "Counsellor payouts" : "My earnings"}</h1>
        <p className="lede">
          Sessions held in {monthLabel(month)} (late cancellations count; free discovery sessions don&apos;t). Private sessions:
          your share of the fee without VAT. EAP sessions: a fixed fee per session.
        </p>
      </div>
      <nav className="tabs" aria-label="Month">
        <Link href={`/admin/payouts?month=${shiftMonth(month, -1)}`}>← {monthLabel(shiftMonth(month, -1))}</Link>
        <Link href={`/admin/payouts?month=${month}`} aria-current="page">{monthLabel(month)}</Link>
        {month < currentMonth() && <Link href={`/admin/payouts?month=${shiftMonth(month, 1)}`}>{monthLabel(shiftMonth(month, 1))} →</Link>}
        {admin && payouts.length > 0 && (
          <a href={`/admin/payouts/export?month=${month}`} title="Confidential – do not distribute">Export to Excel (confidential)</a>
        )}
      </nav>
      {admin && payouts.length > 0 && (
        <section className="card load-summary">
          <div><span className="big-num">{czk(total)}</span><span className="of"> to pay counsellors</span></div>
          <div><span className="big-num">{czk(privateNet)}</span><span className="of"> private fees without VAT</span></div>
          <div><span className="big-num">{czk(privateNet - privatePayout)}</span><span className="of"> kept by Prague Integration (private)</span></div>
        </section>
      )}
      {payouts.length === 0 ? (
        <p className="card empty">No sessions held in {monthLabel(month)}.</p>
      ) : (
        payouts.map((p) => <Statement key={p.staff_id} p={p} open={!admin || payouts.length === 1} />)
      )}
    </main>
  );
}

function Statement({ p, open }: { p: Payout; open: boolean }) {
  const unpaid = p.private_net - p.private_net_paid;
  return (
    <details className="card stack payout" open={open}>
      <summary className="actions" style={{ justifyContent: "space-between" }}>
        <b>{p.name}</b>
        <span>
          {p.private_sessions} private · {p.eap_sessions} EAP · <b>{czk(p.payout)}</b>
        </span>
      </summary>
      <p className="small">
        Share of private fees: <b>{p.percent} %</b> · EAP fee per session: <b>{czk(p.eap_fee)}</b>
        {unpaid > 0 && <> · <span className="overdue">{czk(unpaid)} of private fees not yet paid by clients</span></>}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th>Client</th><th>Type</th><th>Fee without VAT</th><th>Client paid</th><th>Payout</th></tr>
          </thead>
          <tbody>
            {p.lines.map((l, i) => (
              <tr key={i}>
                <td>{formatDate(l.starts_at)}</td>
                <td>{l.first_name}</td>
                <td>{l.kind === "eap" ? "EAP" : "Private"}{l.late_cancelled ? " · late cancellation" : ""}</td>
                <td>{l.kind === "private" ? czk(l.net) : "—"}</td>
                <td>{l.kind === "private" ? (l.paid ? "Yes" : <span className="overdue">Not yet</span>) : "—"}</td>
                <td><b>{czk(l.payout)}</b></td>
              </tr>
            ))}
            <tr>
              <td colSpan={3}><b>Total</b></td>
              <td>{czk(p.private_net)}</td>
              <td />
              <td><b>{czk(p.payout)}</b></td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  );
}
