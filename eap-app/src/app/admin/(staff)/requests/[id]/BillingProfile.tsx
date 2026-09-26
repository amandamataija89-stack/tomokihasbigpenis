import type { RequestRow } from "@/lib/data";
import { priceSteps, withVat, type PriceRow } from "@/lib/billing";
import { chooseClientPrice, saveClientBilling, setClientService } from "../../../billing-actions";
import { SERVICES } from "@/lib/request-form";

const czk = (n: number) => `${n.toLocaleString("cs-CZ")} CZK`;

// A private client's price, picked by their counsellor from the price list's range, and invoice details.
export function BillingProfile({
  r,
  range,
  vatPayer,
  vatRate,
  manager,
  flash,
}: {
  r: RequestRow;
  range: PriceRow | null;
  vatPayer: boolean;
  vatRate: number;
  manager: boolean;
  flash?: string;
}) {
  const steps = range?.min_net_czk != null ? priceSteps(range.min_net_czk, range.max_net_czk ?? range.min_net_czk) : [];
  const vat = { vatPayer, vatRate };
  const chosen = r.session_price_net_czk;
  return (
    <>
      <section className="card stack" id="price">
        <h2>1. Type of counselling</h2>
        <form action={setClientService.bind(null, r.id)} className="actions" style={{ gap: 8 }}>
          <select name="service" defaultValue={r.service} aria-label="Type of counselling">
            <option value="" disabled>Choose one</option>
            {SERVICES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button type="submit" className="ghost small-btn">Save type</button>
        </form>
        {flash === "service-saved" && <p className="flash" role="status">Type of counselling saved.</p>}
        {flash === "service" && <p className="err" role="alert">Choose a type of counselling.</p>}

        <h2>2. Session price</h2>
        {flash === "pricechosen" && <p className="flash" role="status">Price chosen.</p>}
        {flash === "range" && <p className="err" role="alert">Choose one of the prices shown{manager ? ", or type a whole number of CZK" : ""}.</p>}
        {chosen !== null ? (
          <p>
            <b>{czk(chosen)}</b>
            {vatPayer ? <> + {vatRate} % VAT = <b>{czk(r.session_price_czk ?? withVat(chosen, vat))}</b> per session</> : " per session"}
          </p>
        ) : (
          <p className="notice">
            <b>Choose this client&apos;s price</b> before booking sessions.
          </p>
        )}
        {steps.length > 0 ? (
          <form action={chooseClientPrice.bind(null, r.id)} className="stack" style={{ gap: 8 }}>
            <span className="small">
              {r.service || "Their support"}: {czk(steps[0])} to {czk(steps[steps.length - 1])} without VAT. Choose this client&apos;s price:
            </span>
            <div className="actions" style={{ gap: 8 }}>
              <select name="net" defaultValue={chosen !== null && steps.includes(chosen) ? String(chosen) : ""} aria-label="Session price">
                <option value="" disabled>Choose a price</option>
                {steps.map((n) => (
                  <option key={n} value={n}>
                    {czk(n)}{vatPayer ? ` + ${vatRate} % VAT = ${czk(withVat(n, vat))}` : ""}
                  </option>
                ))}
              </select>
              <button type="submit" className="small-btn">Save price</button>
            </div>
          </form>
        ) : (
          <p className="small">
            {!r.service ? "Choose the type of counselling first." : <>There&apos;s no price range for {r.service} yet.</>}{" "}
            {manager ? "Set one under Pricing & invoices, or type a price below." : "Ask the coordinator to set one."}
          </p>
        )}
        {manager && (
          <form action={chooseClientPrice.bind(null, r.id)} className="actions" style={{ gap: 8 }}>
            <input
              type="text"
              inputMode="numeric"
              name="customNet"
              aria-label="Other price without VAT, CZK"
              placeholder="Other price"
              className="price-input"
            />
            <button type="submit" className="ghost small-btn">Set other price</button>
          </form>
        )}
        <span className="small">Applies to new sessions and to booked sessions not yet paid.</span>
      </section>

      {manager && (
      <form action={saveClientBilling.bind(null, r.id)} className="card form" id="billing">
        <h2>3. Invoices</h2>
        <p className="small">
          Create an invoice for each payment under Payments.{" "}
          <a href={`/admin/invoices/export?client=${r.id}`} target="_blank" rel="noopener">
            Export all of this client&apos;s invoices (PDF)
          </a>
        </p>
        <p>
          Variable symbol: <b className="mono">{r.variable_symbol ?? "given with the first invoice"}</b>
          <span className="small"> (on all this client&apos;s invoices, so their payments can be matched)</span>
        </p>
        <h3 style={{ fontSize: 16 }}>Invoice to</h3>
        <div className="field">
          <label htmlFor="billingName">Name or company</label>
          <input id="billingName" name="billingName" type="text" defaultValue={r.billing_name} placeholder={r.full_name || r.first_name} />
        </div>
        <div className="field">
          <label htmlFor="billingAddress">Address</label>
          <textarea id="billingAddress" name="billingAddress" rows={3} defaultValue={r.billing_address} placeholder={r.address} />
          <span className="small">Leave empty to use their residential address from the sign-up form.</span>
        </div>
        <div className="pay-fields">
          <label>
            <span className="small">IČO (companies)</span>
            <input name="billingIco" type="text" defaultValue={r.billing_ico} />
          </label>
          <label>
            <span className="small">DIČ</span>
            <input name="billingDic" type="text" defaultValue={r.billing_dic} />
          </label>
        </div>
        <div className="field">
          <label htmlFor="billingEmail">Send invoices to</label>
          <input id="billingEmail" name="billingEmail" type="email" defaultValue={r.billing_email} placeholder={r.email} />
          <span className="small">Leave empty to use the client&apos;s email.</span>
        </div>
        <div className="actions"><button type="submit">Save</button></div>
      </form>
      )}
    </>
  );
}
