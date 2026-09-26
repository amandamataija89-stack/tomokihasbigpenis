import type { ClientSession } from "@/lib/data";
import { PAYMENT_METHODS, type PackageState, type Payment } from "@/lib/billing";
import { emailInvoice, recordPackagePayment, recordSessionsPayment, removePayment } from "../../../billing-actions";
import { formatDate, formatDay } from "../../../format";

const czk = (n: number) => `${n.toLocaleString("cs-CZ")} CZK`;

const FLASH: Record<string, [ok: boolean, text: string]> = {
  paid: [true, "Payment recorded."],
  package: [true, "Package recorded. Booked sessions it covers are marked paid, and new bookings use what's left."],
  deleted: [true, "Payment deleted. Its sessions are unpaid again."],
  emailed: [true, "Invoice emailed."],
  saved: [true, "Billing details saved."],
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
  const unpaid = sessions.filter((s) => !s.paid_at);
  const owed = unpaid.filter((s) => s.done_at).reduce((a, s) => a + (s.price_czk ?? 0), 0);
  const left = packages.reduce((a, p) => a + Math.max(0, p.sessions - p.used), 0);
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

      <details className="pay-box" open={unpaid.length > 0 && payments.length === 0}>
        <summary>Record a payment for sessions</summary>
        {unpaid.length === 0 ? (
          <p className="small">Every booked session is paid. Book a session first, or record a package below.</p>
        ) : (
          <form action={recordSessionsPayment.bind(null, requestId)} className="form" style={{ gap: 12 }}>
            <fieldset>
              <legend className="small">Which sessions does it pay for?</legend>
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
              <span className="small">Amount paid, CZK (leave empty for the total of the ticked sessions)</span>
              <input type="text" inputMode="numeric" name="amount" className="price-input" />
            </label>
            <PaidFields today={today} />
            <div className="actions"><button type="submit">Record payment</button></div>
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
                <b>{czk(p.amount_czk)}</b> · {formatDay(p.paid_on)} · {p.method}
                <div className="small">
                  {p.package_sessions
                    ? `Package of ${p.package_sessions} sessions`
                    : `Session${p.session_ids.length === 1 ? "" : "s"} ${p.session_ids.map((id) => number.get(id) ?? "?").join(", ")}`}
                  {p.invoice_number ? ` · Invoice ${p.invoice_number}` : " · No invoice yet"}
                </div>
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
