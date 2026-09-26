import type { ClientSession } from "@/lib/data";
import { PAYMENT_METHODS, type PackageState, type Payment } from "@/lib/billing";
import {
  createInvoiceAction,
  emailInvoice,
  markPaidAction,
  recordPackagePayment,
  recordSessionsPayment,
  removePayment,
} from "../../../billing-actions";
import { formatDate, formatDay } from "../../../format";

const czk = (n: number) => `${n.toLocaleString("cs-CZ")} CZK`;

const FLASH: Record<string, [ok: boolean, text: string]> = {
  paid: [true, "Payment recorded."],
  invoiced: [true, "Invoice created. It's due in 14 days."],
  markedpaid: [true, "Invoice marked paid."],
  package: [true, "Package recorded. Booked sessions it covers are marked paid, and new bookings use what's left."],
  deleted: [true, "Payment deleted. Its sessions are unpaid again."],
  emailed: [true, "Invoice emailed."],
  saved: [true, "Invoice details saved."],
  pricechosen: [true, "Price chosen."],
  range: [false, "Choose one of the prices shown."],
  nosessions: [false, "Tick at least one unpaid session."],
  amount: [false, "Enter the amount as a whole number of CZK, e.g. 4500."],
  price: [false, "Enter the price as a whole number of CZK, e.g. 1500, or leave it empty."],
  email: [false, "Enter the invoice email like name@example.com, or leave it empty."],
  date: [false, "Choose the date it was paid."],
  sessions: [false, "Enter how many sessions the package has (1 to 100)."],
  duplicate: [false, "That invoice number is already used. Leave it empty to use the next number automatically."],
  missing: [false, "That payment no longer exists."],
};

// Fields shared by both payment forms.
function PaidFields({ today }: { today: string }) {
  return (
    <div className="pay-fields">
      <label>
        <span className="small">Paid on</span>
        <input type="date" name="paidOn" defaultValue={today} />
      </label>
      <label>
        <span className="small">How</span>
        <select name="method" defaultValue="Bank transfer">
          {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
      </label>
      <label>
        <span className="small">Invoice number (optional)</span>
        <input type="text" name="invoiceNumber" placeholder="Automatic" />
      </label>
    </div>
  );
}

export function Payments({
  requestId,
  sessions,
  payments,
  packages,
  flash,
  why,
}: {
  requestId: string;
  sessions: ClientSession[];
  payments: Payment[];
  packages: PackageState[];
  flash?: string;
  why?: string;
}) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
  const number = new Map(sessions.map((s, i) => [s.id, i + 1]));
  // Sessions that can go on a new invoice or payment: not paid and not already invoiced.
  const unpaid = sessions.filter((s) => !s.paid_at && !s.payment_id);
  const owed = sessions.filter((s) => s.done_at && !s.paid_at).reduce((a, s) => a + (s.price_czk ?? 0), 0);
  const left = packages.reduce((a, p) => a + Math.max(0, p.sessions - p.used), 0);
  // Running totals, with VAT: sessions held (incl. late cancellations), what's paid, and what's booked ahead.
  const sum = (xs: ClientSession[]) => xs.reduce((a, s) => a + (s.price_czk ?? 0), 0);
  const held = sessions.filter((s) => s.done_at);
  const upcoming = sessions.filter((s) => !s.done_at);
  const paidTotal = payments.filter((p) => p.paid_on).reduce((a, p) => a + p.amount_czk, 0);
  const open = payments.filter((p) => !p.paid_on);
  const overdue = open.filter((p) => p.due_on && p.due_on < today);
  const openTotal = open.reduce((a, p) => a + p.amount_czk, 0);
  const noPrice = sessions.filter((s) => s.price_czk === null).length;
  const [ok, text] = flash === "emailfailed" ? [false, `The invoice couldn't be emailed. ${why ?? ""}`] : (FLASH[flash ?? ""] ?? [true, ""]);

  return (
    <section className="card stack" id="payments">
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <h2>Payments</h2>
        <span className="actions" style={{ gap: 8 }}>
          {left > 0 && <span className="pill pill-paid">Package: {left} {left === 1 ? "session" : "sessions"} left</span>}
          {owed > 0 && <span className="pill pill-unpaid">Owed for sessions held: {czk(owed)}</span>}
        </span>
      </div>
      {text && <p className={ok ? "flash" : "err"} role={ok ? "status" : "alert"}>{text}</p>}
      {overdue.length > 0 && (
        <p className="err" role="alert">
          <b>Late payment:</b> {overdue.map((p) => `invoice ${p.invoice_number} (${czk(p.amount_czk)}, due ${formatDay(p.due_on!)})`).join(", ")}{" "}
          {overdue.length === 1 ? "is" : "are"} overdue. The client is emailed a reminder the day after the due date.
        </p>
      )}
      <dl className="totals">
        <div><dt>Sessions held</dt><dd>{held.length} · <b>{czk(sum(held))}</b></dd></div>
        <div><dt>Paid</dt><dd><b>{czk(paidTotal)}</b></dd></div>
        <div><dt>Invoiced, awaiting payment</dt><dd className={overdue.length ? "overdue" : undefined}>{open.length} · {czk(openTotal)}</dd></div>
        <div><dt>To pay for sessions held</dt><dd className={owed ? "overdue" : undefined}><b>{czk(owed)}</b></dd></div>
        <div><dt>Booked ahead</dt><dd>{upcoming.length} · {czk(sum(upcoming))}</dd></div>
      </dl>
      <p className="small">
        Amounts include VAT.
        {noPrice > 0 && <b className="overdue"> {noPrice} {noPrice === 1 ? "session has" : "sessions have"} no price yet: choose the client&apos;s price under Session price.</b>}
      </p>

      <details className="pay-box" open={unpaid.length > 0}>
        <summary>Invoice or record a payment for sessions</summary>
        {unpaid.length === 0 ? (
          <p className="small">Every booked session is paid or invoiced. Book a session first, or record a package below.</p>
        ) : (
          <form className="form" style={{ gap: 12 }}>
            <fieldset>
              <legend className="small">Which sessions?</legend>
              <div className="choices">
                {unpaid.map((s) => (
                  <label className="choice" key={s.id}>
                    <input type="checkbox" name="session" value={s.id} defaultChecked={!!s.done_at} />
                    <span>
                      Session {number.get(s.id)} · {formatDate(s.starts_at)}
                      {s.price_czk !== null ? ` · ${czk(s.price_czk)}` : " · no price"}
                      {s.done_at ? (s.late_cancelled ? " · late cancellation" : " · held") : " · upcoming"}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              <span className="small">Amount, CZK incl. VAT (leave empty for the total of the ticked sessions)</span>
              <input type="text" inputMode="numeric" name="amount" className="price-input" />
            </label>
            <div className="pay-choice">
              <h3>Client pays later</h3>
              <label className="consent small-consent">
                <input type="checkbox" name="send" value="yes" defaultChecked />
                <span>Email the invoice with the QR payment code to the client now</span>
              </label>
              <div className="actions">
                <button formAction={createInvoiceAction.bind(null, requestId)}>Create invoice to pay (due in 14 days)</button>
              </div>
            </div>
            <div className="pay-choice">
              <h3>Already paid</h3>
              <PaidFields today={today} />
              <div className="actions">
                <button formAction={recordSessionsPayment.bind(null, requestId)} className="ghost">Record payment received</button>
              </div>
            </div>
          </form>
        )}
      </details>

      <details className="pay-box">
        <summary>Record a prepaid package</summary>
        <form action={recordPackagePayment.bind(null, requestId)} className="form" style={{ gap: 12 }}>
          <div className="pay-fields">
            <label>
              <span className="small">Number of sessions</span>
              <input type="number" name="sessions" min={1} max={100} defaultValue={5} className="price-input" />
            </label>
            <label>
              <span className="small">Package price, CZK</span>
              <input type="text" inputMode="numeric" name="packagePrice" className="price-input" />
            </label>
          </div>
          <PaidFields today={today} />
          <p className="small">
            Unpaid sessions already booked are taken from the package first, then each new booking, until it&apos;s used up.
          </p>
          <div className="actions"><button type="submit">Record package</button></div>
        </form>
      </details>

      {payments.length > 0 && (
        <ul className="payments">
          {payments.map((p) => (
            <li key={p.id} className="payment-row">
              <div>
                <b>{czk(p.amount_czk)}</b>{" "}
                {p.paid_on ? (
                  <span className="pill pill-paid">Paid {formatDay(p.paid_on)} · {p.method}</span>
                ) : p.due_on && p.due_on < today ? (
                  <span className="pill pill-crisis">Overdue since {formatDay(p.due_on)}</span>
                ) : (
                  <span className="pill pill-unpaid">To pay by {p.due_on ? formatDay(p.due_on) : "—"}</span>
                )}
                <div className="small">
                  {p.period && `Monthly invoice ${p.period} · `}
                  {p.package_sessions
                    ? `Package of ${p.package_sessions} sessions`
                    : `Session${p.session_ids.length === 1 ? "" : "s"} ${p.session_ids.map((id) => number.get(id) ?? "?").join(", ")}`}
                  {p.invoice_number ? ` · Invoice ${p.invoice_number}` : " · No invoice yet"}
                  {p.emailed_at && ` · emailed ${formatDate(p.emailed_at)}`}
                </div>
                {!p.paid_on && (
                  <form action={markPaidAction.bind(null, requestId, p.id)} className="actions mark-paid" style={{ gap: 8 }}>
                    <input type="date" name="paidOn" defaultValue={today} aria-label="Paid on" />
                    <select name="method" defaultValue="Bank transfer" aria-label="How">
                      {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                    </select>
                    <button type="submit" className="small-btn">Mark as paid</button>
                  </form>
                )}
              </div>
              <form className="actions" style={{ gap: 8 }}>
                <a className="button ghost small-btn" href={`/admin/invoices/${p.id}`} target="_blank" rel="noopener">
                  {p.invoice_number ? "Invoice PDF" : "Create invoice PDF"}
                </a>
                <button formAction={emailInvoice.bind(null, requestId, p.id)} className="ghost small-btn">
                  Email invoice
                </button>
                <button formAction={removePayment.bind(null, requestId, p.id)} className="ghost small-btn">
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
