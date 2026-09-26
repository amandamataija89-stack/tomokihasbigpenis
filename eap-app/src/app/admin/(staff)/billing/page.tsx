import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { invoiceSettings, openInvoices, vatSplit } from "@/lib/billing";
import { createMonthlyInvoicesAction, emailMonthlyInvoicesAction, importStatementAction } from "../../billing-actions";
import type { ImportResult } from "@/lib/bank-statement";
import { pool } from "@/lib/db";

const czk = (n: number) => `${n.toLocaleString("cs-CZ")} CZK`;
const hal = (h: number) => `${(h / 100).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CZK`;
const monthName = (m: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
const shift = (m: string, by: number) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};

type Row = {
  request_id: string;
  first_name: string;
  counsellor: string | null;
  service: string;
  sessions: number;
  late: number;
  gross: number;
  paid: number;
  no_price: number;
  prices: number[];
};

// Private clients' sessions held in a month (late cancellations included), per client and per counsellor.
export default async function MonthlyBilling({ searchParams }: { searchParams: Promise<{
    month?: string;
    created?: string;
    noprice?: string;
    emailed?: string;
    failed?: string;
    bank?: string;
    why?: string;
  }> }) {
  await requireManager();
  const sp = await searchParams;
  const thisMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit" }).format(new Date());
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth;
  const lastImport = await pool
    .query<{ value: string }>("SELECT value FROM app_state WHERE key = 'last_bank_import'")
    .then((r) => (r.rows[0] ? (JSON.parse(r.rows[0].value) as ImportResult & { at: string }) : null));
  const [settings, open, { rows: toEmail }, { rows }] = await Promise.all([
    invoiceSettings(),
    openInvoices(),
    pool.query<{ n: number; to_invoice: number }>(
      `SELECT
         (SELECT count(*)::int FROM payments WHERE period = $1 AND paid_on IS NULL AND emailed_at IS NULL AND invoice_number IS NOT NULL) AS n,
         (SELECT count(DISTINCT cs.request_id)::int FROM client_sessions cs JOIN support_requests r ON r.id = cs.request_id
          WHERE r.kind = 'private' AND cs.done_at IS NOT NULL AND cs.paid_at IS NULL AND cs.payment_id IS NULL
            AND cs.price_czk IS NOT NULL AND to_char(cs.starts_at AT TIME ZONE 'Europe/Prague', 'YYYY-MM') = $1)
         + (SELECT count(*)::int FROM payments WHERE period = $1 AND paid_on IS NULL AND invoice_number IS NULL) AS to_invoice`,
      [month],
    ),
    pool.query<Row>(
      `SELECT r.id AS request_id, r.first_name, s.name AS counsellor, r.service,
         count(*)::int AS sessions,
         count(*) FILTER (WHERE cs.late_cancelled)::int AS late,
         COALESCE(sum(cs.price_czk), 0)::int AS gross,
         COALESCE(sum(cs.price_czk) FILTER (WHERE cs.paid_at IS NOT NULL), 0)::int AS paid,
         count(*) FILTER (WHERE cs.price_czk IS NULL)::int AS no_price,
         COALESCE(array_agg(cs.price_czk) FILTER (WHERE cs.price_czk IS NOT NULL), '{}') AS prices
       FROM client_sessions cs
       JOIN support_requests r ON r.id = cs.request_id
       LEFT JOIN staff s ON s.id = r.assigned_to
       WHERE r.kind = 'private' AND cs.done_at IS NOT NULL
         AND to_char(cs.starts_at AT TIME ZONE 'Europe/Prague', 'YYYY-MM') = $1
       GROUP BY r.id, s.name ORDER BY s.name NULLS LAST, r.first_name`,
      [month],
    ),
  ]);
  // Tax base and VAT per session, as on the invoices.
  const split = (prices: number[]) =>
    prices.reduce(
      (a, p) => {
        const v = settings.vatPayer ? vatSplit(p, settings.vatRate) : { base: p * 100, vat: 0 };
        return { base: a.base + v.base, vat: a.vat + v.vat };
      },
      { base: 0, vat: 0 },
    );
  const total = rows.reduce(
    (a, r) => ({ sessions: a.sessions + r.sessions, gross: a.gross + r.gross, paid: a.paid + r.paid }),
    { sessions: 0, gross: 0, paid: 0 },
  );
  const totalSplit = split(rows.flatMap((r) => r.prices));
  const byCounsellor = new Map<string, { sessions: number; gross: number; paid: number }>();
  for (const r of rows) {
    const k = r.counsellor ?? "Not assigned";
    const c = byCounsellor.get(k) ?? { sessions: 0, gross: 0, paid: 0 };
    byCounsellor.set(k, { sessions: c.sessions + r.sessions, gross: c.gross + r.gross, paid: c.paid + r.paid });
  }

  return (
    <main className="stack" style={{ gap: 20 }}>
      <div className="stack">
        <h1 style={{ fontSize: 32 }}>Monthly billing</h1>
        <p className="lede">
          Private clients&apos; sessions held in the month, late cancellations included, at each client&apos;s price.
        </p>
      </div>
      <nav className="tabs" aria-label="Month">
        <Link href={`/admin/billing?month=${shift(month, -1)}`}>← {monthName(shift(month, -1))}</Link>
        <Link href={`/admin/billing?month=${month}`} aria-current="page">{monthName(month)}</Link>
        {month < thisMonth && <Link href={`/admin/billing?month=${shift(month, 1)}`}>{monthName(shift(month, 1))} →</Link>}
      </nav>

      {sp.created && (
        <p className="flash" role="status">
          {sp.created === "0" ? "No new invoices: every session held this month is already invoiced or paid." : `${sp.created} monthly invoice${sp.created === "1" ? "" : "s"} created, due in 14 days.`}
          {sp.noprice && sp.noprice !== "0" && ` ${sp.noprice} client${sp.noprice === "1" ? " has" : "s have"} sessions without a price, left out: choose their price and create again.`}
        </p>
      )}
      {sp.emailed && (
        <p className={sp.failed && sp.failed !== "0" ? "err" : "flash"} role="status">
          {sp.emailed} invoice{sp.emailed === "1" ? "" : "s"} emailed{sp.failed && sp.failed !== "0" ? `, ${sp.failed} failed (see each client's page)` : ""}.
        </p>
      )}

      <section className="card stack">
        <h2>Invoices for {monthName(month)}</h2>
        <ol className="steps">
          <li className="small" style={{ listStyle: "none", marginLeft: -20 }}>
            <b>Automatic:</b> last month&apos;s invoices are created on the 1st and emailed to clients on the 3rd; you get
            the PDF and CSV by email then. Use the buttons to do it sooner, or after changes.
          </li>
          <li>
            <form action={createMonthlyInvoicesAction} className="actions" style={{ gap: 8 }}>
              <input type="hidden" name="month" value={month} />
              <button type="submit" disabled={toEmail[0].to_invoice === 0}>Issue monthly invoices now</button>
              <span className="small">
                {toEmail[0].to_invoice
                  ? `${toEmail[0].to_invoice} running invoice${toEmail[0].to_invoice === 1 ? "" : "s"} not issued yet. Issuing gives each a number, a due date 14 days later, the client's variable symbol and a QR payment code.`
                  : "Nothing left to invoice for this month."}
              </span>
            </form>
          </li>
          <li>
            <form action={emailMonthlyInvoicesAction} className="actions" style={{ gap: 8 }}>
              <input type="hidden" name="month" value={month} />
              <button type="submit" className="ghost" disabled={toEmail[0].n === 0}>Email invoices to clients</button>
              <span className="small">{toEmail[0].n ? `${toEmail[0].n} not emailed yet.` : "All emailed."}</span>
            </form>
          </li>
          <li className="actions" style={{ gap: 8 }}>
            <a className="button ghost" href={`/admin/invoices/export?month=${month}`} target="_blank" rel="noopener">Export invoices (PDF)</a>
            <a className="button ghost" href={`/admin/invoices/export?month=${month}&format=csv`}>Export list (CSV)</a>
          </li>
        </ol>
      </section>

      <section className="card load-summary">
        <div><span className="big-num">{total.sessions}</span><span className="of"> sessions</span></div>
        <div><span className="big-num">{czk(total.gross)}</span><span className="of"> total{settings.vatPayer ? " incl. VAT" : ""}</span></div>
        <div><span className="big-num">{czk(total.paid)}</span><span className="of"> paid</span></div>
        <div><span className="big-num">{czk(total.gross - total.paid)}</span><span className="of"> to pay</span></div>
      </section>
      {settings.vatPayer && total.gross > 0 && (
        <p className="small">
          Of which tax base {hal(totalSplit.base)} and VAT ({settings.vatRate} %) {hal(totalSplit.vat)}.
        </p>
      )}

      <div className="table-wrap">
        {rows.length === 0 ? (
          <p className="empty">No private sessions held in {monthName(month)}.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Counsellor</th>
                <th>Sessions</th>
                <th>Total{settings.vatPayer ? " incl. VAT" : ""}</th>
                {settings.vatPayer && <th>Without VAT</th>}
                <th>Paid</th>
                <th>To pay</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.request_id}>
                  <td>
                    <Link className="rowlink" href={`/admin/requests/${r.request_id}#payments`}>{r.first_name}</Link>
                    {r.service && <div className="small">{r.service}</div>}
                  </td>
                  <td>{r.counsellor ?? <span className="small">—</span>}</td>
                  <td>
                    {r.sessions}
                    {r.late > 0 && <div className="small">{r.late} late cancelled</div>}
                    {r.no_price > 0 && <div className="overdue">{r.no_price} without a price</div>}
                  </td>
                  <td><b>{czk(r.gross)}</b></td>
                  {settings.vatPayer && <td>{hal(split(r.prices).base)}</td>}
                  <td>{czk(r.paid)}</td>
                  <td className={r.gross > r.paid ? "overdue" : undefined}>{czk(r.gross - r.paid)}</td>
                </tr>
              ))}
              <tr>
                <td><b>Total</b></td>
                <td />
                <td><b>{total.sessions}</b></td>
                <td><b>{czk(total.gross)}</b></td>
                {settings.vatPayer && <td><b>{hal(totalSplit.base)}</b></td>}
                <td><b>{czk(total.paid)}</b></td>
                <td><b>{czk(total.gross - total.paid)}</b></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <section className="card stack" id="bank">
        <h2>Bank statement</h2>
        <p className="small">
          In Raiffeisenbank online banking, export the account statement as <b>CSV</b> and upload it here. Payments with a
          client&apos;s variable symbol and the invoice amount are marked paid automatically. Uploading the same statement
          twice is safe.
        </p>
        {sp.bank === "nofile" && <p className="err" role="alert">Choose the statement file first.</p>}
        {sp.bank === "toobig" && <p className="err" role="alert">That file is too big (over 5 MB). Export a shorter period.</p>}
        {sp.bank === "error" && <p className="err" role="alert">{sp.why}</p>}
        <form action={importStatementAction} className="actions" style={{ gap: 8 }}>
          <input type="file" name="statement" accept=".csv,.txt,text/csv" aria-label="Bank statement CSV" />
          <button type="submit">Upload and match payments</button>
        </form>
        {lastImport && (
          <div className="stack" style={{ gap: 6 }}>
            <p className={sp.bank === "done" ? "flash" : "small"} role="status">
              Last upload {new Date(lastImport.at).toLocaleString("en-GB", { timeZone: "Europe/Prague" })}:{" "}
              {lastImport.incoming} incoming payment{lastImport.incoming === 1 ? "" : "s"},{" "}
              <b>{lastImport.paid.length} invoice{lastImport.paid.length === 1 ? "" : "s"} marked paid</b>
              {lastImport.alreadyImported ? `, ${lastImport.alreadyImported} already uploaded before` : ""}
              {lastImport.unmatched.length ? `, ${lastImport.unmatched.length} to check` : ""}.
            </p>
            {lastImport.paid.length > 0 && (
              <ul className="small">
                {lastImport.paid.map((p) => (
                  <li key={p.invoice}>{p.firstName}: invoice {p.invoice}, {czk(p.amount)}, paid {p.date}</li>
                ))}
              </ul>
            )}
            {lastImport.unmatched.length > 0 && (
              <>
                <p className="small"><b>To check by hand</b> (then mark the invoice paid on the client&apos;s page):</p>
                <ul className="small">
                  {lastImport.unmatched.map((u, i) => (
                    <li key={i}>
                      {u.date} · {czk(u.amount)} · {u.counterparty || "unknown sender"}
                      {u.vs ? ` · VS ${u.vs}` : ""}: {u.reason}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>

      <section className="card stack">
        <h2>Invoices awaiting payment</h2>
        {open.length === 0 ? (
          <p className="small">None: every invoice is paid.</p>
        ) : (
          <ul className="payments">
            {open.map((o) => (
              <li key={o.id} className="payment-row">
                <span>
                  <Link href={`/admin/requests/${o.request_id}#payments`}>{o.first_name}</Link> · invoice {o.invoice_number}
                </span>
                <span>
                  <b>{czk(o.amount_czk)}</b>{" "}
                  {o.overdue ? (
                    <span className="pill pill-crisis">Overdue since {o.due_on}</span>
                  ) : (
                    <span className="pill pill-unpaid">Due {o.due_on}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="small">Upload the bank statement below to mark paid invoices automatically. For anything still overdue, send the client a payment reminder from their page.</p>
      </section>

      {byCounsellor.size > 0 && (
        <section className="card stack">
          <h2>By counsellor</h2>
          <ul className="payments">
            {[...byCounsellor].map(([name, c]) => (
              <li key={name} className="payment-row">
                <span>{name}</span>
                <span>{c.sessions} sessions · <b>{czk(c.gross)}</b> · paid {czk(c.paid)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
