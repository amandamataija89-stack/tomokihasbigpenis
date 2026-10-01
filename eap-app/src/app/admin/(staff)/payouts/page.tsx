import Link from "next/link";
import { isOwner, requireStaff } from "@/lib/auth";
import { invoiceDueDate, invoicesFor, type InvoiceInfo } from "@/lib/counsellor-invoices";
import { uploadMyInvoiceAction } from "../../actions";
import { currentMonth, monthLabel, shiftMonth } from "@/lib/month-end";
import { monthPayouts, type Payout } from "@/lib/payouts";
import { formatDate, formatDay } from "../../format";

const czk = (n: number) => `${n.toLocaleString("cs-CZ")} CZK`;

// Counsellor payouts. Admins see everyone's; everyone else sees their own statement.
export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ month?: string; invoice?: string }> }) {
  const me = await requireStaff();
  const admin = me.role === "admin";
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : shiftMonth(currentMonth(), -1);
  const [payouts, invoices] = await Promise.all([monthPayouts(month, admin ? null : me.id), invoicesFor(month)]);
  const due = invoiceDueDate(month);
  const today = new Date().toISOString().slice(0, 10);
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
        {isOwner(me) && payouts.length > 0 && (
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
      {sp.invoice === "uploaded" && <p className="flash" role="status">Your invoice is uploaded. Thank you!</p>}
      {sp.invoice === "missing" && <p className="err" role="alert">Choose your invoice file first.</p>}
      {sp.invoice === "type" && <p className="err" role="alert">Upload a PDF, or a photo (JPG or PNG).</p>}
      {sp.invoice === "size" && <p className="err" role="alert">The file is too big (up to 5 MB).</p>}
      {payouts.length > 0 && (
        <p className="small">
          Each counsellor uploads their invoice to Prague Integration for {monthLabel(month)} by <b>{formatDay(new Date(`${due}T12:00:00`))}</b>.
          Only you{admin ? ", and admins," : " and admins"} can see your invoice.
        </p>
      )}
      {payouts.length === 0 ? (
        <p className="card empty">No sessions held in {monthLabel(month)}.</p>
      ) : (
        payouts.map((p) => (
          <Statement key={p.staff_id} p={p} open={!admin || payouts.length === 1 || p.staff_id === me.id} mine={p.staff_id === me.id} month={month} invoice={invoices.get(p.staff_id)} late={today > due} />
        ))
      )}
    </main>
  );
}

function Statement({ p, open, mine, month, invoice, late }: { p: Payout; open: boolean; mine: boolean; month: string; invoice?: InvoiceInfo; late: boolean }) {
  const unpaid = p.private_net - p.private_net_paid;
  return (
    <details className="card stack payout" open={open} id={mine ? "mine" : undefined}>
      <summary className="actions" style={{ justifyContent: "space-between" }}>
        <b>{p.name}</b>
        <span>
          {p.private_sessions} private · {p.eap_sessions} EAP · <b>{czk(p.payout)}</b>
          {" · "}
          {invoice ? <span className="pill pill-paid">Invoice uploaded</span> : late ? <span className="pill pill-unpaid">Invoice missing</span> : <span className="pill pill-closed">No invoice yet</span>}
        </span>
      </summary>
      <div className="actions" style={{ gap: 8 }}>
        {invoice && (
          <a href={`/admin/payouts/invoice?staff=${p.staff_id}&month=${month}`} target="_blank" rel="noopener" className="small">
            {mine ? "My invoice" : "Invoice"}: {invoice.filename} (uploaded {formatDate(invoice.uploaded_at)})
          </a>
        )}
        {mine && (
          <form action={uploadMyInvoiceAction.bind(null, month)} className="actions" style={{ gap: 8 }}>
            <input type="file" name="invoice" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" aria-label="My invoice (PDF or photo)" />
            <button type="submit" className="small-btn">{invoice ? "Replace my invoice" : "Upload my invoice"}</button>
          </form>
        )}
      </div>
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
