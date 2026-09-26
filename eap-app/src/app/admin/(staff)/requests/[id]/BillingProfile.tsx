import type { RequestRow } from "@/lib/data";
import { saveClientBilling } from "../../../billing-actions";

// A private client's price and invoice details.
export function BillingProfile({ r, listPrice }: { r: RequestRow; listPrice: number | null }) {
  return (
    <form action={saveClientBilling.bind(null, r.id)} className="card form" id="billing">
      <h2>Price and invoicing</h2>
      <div className="field">
        <label htmlFor="sessionPrice">Session price for this client, CZK</label>
        <input
          id="sessionPrice"
          name="sessionPrice"
          type="text"
          inputMode="numeric"
          className="price-input"
          defaultValue={r.session_price_czk ?? ""}
          placeholder={listPrice !== null ? String(listPrice) : "e.g. 1500"}
        />
        <span className="small">
          {listPrice !== null
            ? `Leave empty to use the price list: ${listPrice.toLocaleString("cs-CZ")} CZK for ${r.service || "their kind of support"}.`
            : "No price-list price for their kind of support yet (set it under Pricing)."}{" "}
          New sessions start with this price; you can still change a single session.
        </span>
      </div>
      <h3 style={{ fontSize: 16 }}>Invoice to</h3>
      <div className="field">
        <label htmlFor="billingName">Name or company</label>
        <input id="billingName" name="billingName" type="text" defaultValue={r.billing_name} placeholder={r.full_name || r.first_name} />
      </div>
      <div className="field">
        <label htmlFor="billingAddress">Address</label>
        <textarea id="billingAddress" name="billingAddress" rows={3} defaultValue={r.billing_address} />
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
  );
}
