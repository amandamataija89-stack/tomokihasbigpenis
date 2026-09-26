import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { invoiceSettings, priceList } from "@/lib/billing";
import { pool } from "@/lib/db";
import { SERVICES } from "@/lib/request-form";
import { saveInvoiceSettingsAction, savePriceList } from "../../billing-actions";
import { formatDay } from "../../format";

const czk = (n: number) => `${n.toLocaleString("cs-CZ")} CZK`;

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const [prices, settings, { rows: totals }, { rows: recent }, { rows: owing }] = await Promise.all([
    priceList(),
    invoiceSettings(),
    pool.query<{ this_month: number; last_month: number }>(
      `SELECT
         COALESCE(sum(amount_czk) FILTER (WHERE paid_on >= date_trunc('month', now() AT TIME ZONE 'Europe/Prague')), 0)::int AS this_month,
         COALESCE(sum(amount_czk) FILTER (WHERE paid_on >= date_trunc('month', now() AT TIME ZONE 'Europe/Prague') - interval '1 month'
                                            AND paid_on < date_trunc('month', now() AT TIME ZONE 'Europe/Prague')), 0)::int AS last_month
       FROM payments`,
    ),
    pool.query<{ id: string; request_id: string; first_name: string; amount_czk: number; paid_on: string; method: string; invoice_number: string | null }>(
      `SELECT p.id, p.request_id, r.first_name, p.amount_czk, to_char(p.paid_on, 'YYYY-MM-DD') AS paid_on, p.method, p.invoice_number
       FROM payments p JOIN support_requests r ON r.id = p.request_id ORDER BY p.paid_on DESC, p.created_at DESC LIMIT 30`,
    ),
    pool.query<{ request_id: string; first_name: string; sessions: number; amount: number }>(
      `SELECT r.id AS request_id, r.first_name, count(*)::int AS sessions, COALESCE(sum(cs.price_czk), 0)::int AS amount
       FROM client_sessions cs JOIN support_requests r ON r.id = cs.request_id
       WHERE r.kind = 'private' AND cs.done_at IS NOT NULL AND cs.paid_at IS NULL
       GROUP BY r.id ORDER BY amount DESC`,
    ),
  ]);
  const range = (service: string) => prices.find((p) => p.service === service);
  const owed = owing.reduce((a, o) => a + o.amount, 0);

  return (
    <main className="stack" style={{ gap: 20 }}>
      <div className="stack">
        <h1 style={{ fontSize: 32 }}>Pricing &amp; invoices</h1>
        <p className="lede">For private clients. EAP sessions are paid by the employer and aren&apos;t invoiced here.</p>
      </div>
      {sp.saved && <p className="flash" role="status">Saved.</p>}
      {sp.error === "price" && (
        <p className="err" role="alert">Enter prices as whole numbers of CZK, e.g. 900 to 2300, with &quot;to&quot; not lower than &quot;from&quot;.</p>
      )}
      {sp.error === "number" && <p className="err" role="alert">The next invoice number must end in a digit, e.g. 2026001.</p>}

      <section className="card load-summary">
        <div><span className="big-num">{czk(totals[0].this_month)}</span><span className="of"> paid this month</span></div>
        <div><span className="big-num">{czk(totals[0].last_month)}</span><span className="of"> last month</span></div>
        <div><span className="big-num">{czk(owed)}</span><span className="of"> owed for sessions held</span></div>
      </section>

      {owing.length > 0 && (
        <section className="card stack">
          <h2>Unpaid sessions</h2>
          <ul className="payments">
            {owing.map((o) => (
              <li key={o.request_id} className="payment-row">
                <Link href={`/admin/requests/${o.request_id}#payments`}>{o.first_name}</Link>
                <span>{o.sessions} {o.sessions === 1 ? "session" : "sessions"} · {czk(o.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form action={savePriceList} className="card form">
        <h2>Price list</h2>
        <p className="small">
          Price per session <b>without VAT</b>, from … to …. Each client&apos;s counsellor picks their price from this
          range (in steps of 100 CZK) on the client&apos;s page; {settings.vatPayer ? `${settings.vatRate} % VAT is added on top.` : "no VAT is added."}{" "}
          For a single price, fill in only &quot;from&quot;.
        </p>
        {SERVICES.map((s) => (
          <div className="field" key={s}>
            <b>{s}</b>
            <div className="pay-fields">
              <label><span className="small">From, CZK</span>
                <input name={`min:${s}`} type="text" inputMode="numeric" className="price-input" defaultValue={range(s)?.min_net_czk ?? ""} /></label>
              <label><span className="small">To, CZK</span>
                <input name={`max:${s}`} type="text" inputMode="numeric" className="price-input" defaultValue={range(s)?.max_net_czk ?? ""} /></label>
            </div>
          </div>
        ))}
        <div className="actions"><button type="submit">Save prices</button></div>
      </form>

      <form action={saveInvoiceSettingsAction} className="card form">
        <h2>Invoice details</h2>
        <p className="small">Printed on every invoice. Check them with your accountant before sending the first one.</p>
        <div className="field"><label htmlFor="supplierName">Company name</label>
          <input id="supplierName" name="supplierName" type="text" defaultValue={settings.supplierName} /></div>
        <div className="field"><label htmlFor="supplierAddress">Address</label>
          <textarea id="supplierAddress" name="supplierAddress" rows={3} defaultValue={settings.supplierAddress} /></div>
        <div className="pay-fields">
          <label><span className="small">IČO</span><input name="ico" type="text" defaultValue={settings.ico} /></label>
          <label><span className="small">DIČ</span><input name="dic" type="text" defaultValue={settings.dic} /></label>
        </div>
        <div className="pay-fields">
          <label><span className="small">Bank account</span><input name="bankAccount" type="text" defaultValue={settings.bankAccount} placeholder="123456789/0800" /></label>
          <label><span className="small">IBAN</span><input name="iban" type="text" defaultValue={settings.iban} /></label>
        </div>
        <div className="pay-fields">
          <label><span className="small">Email</span><input name="email" type="text" defaultValue={settings.email} /></label>
          <label><span className="small">Phone</span><input name="phone" type="text" defaultValue={settings.phone} /></label>
        </div>
        <div className="field"><label htmlFor="registration">Registration (commercial register entry)</label>
          <input id="registration" name="registration" type="text" defaultValue={settings.registration}
            placeholder="Zapsáno v obchodním rejstříku vedeném Městským soudem v Praze, oddíl C, vložka …" /></div>
        <div className="field">
          <label className="consent">
            <input type="checkbox" name="vatPayer" value="yes" defaultChecked={settings.vatPayer} />
            <span>We are a VAT payer (invoices are tax documents, &quot;daňový doklad&quot;, showing VAT)</span>
          </label>
          <label htmlFor="vatRate">VAT rate</label>
          <select id="vatRate" name="vatRate" defaultValue={String(settings.vatRate)} className="price-input">
            <option value="21">21 %</option>
            <option value="12">12 %</option>
            <option value="0">0 %</option>
          </select>
          <span className="small">
            The price list is without VAT; session prices and invoices show what the client pays, with VAT
            (e.g. 1,500 CZK + 21 % = 1,815 CZK).
          </span>
          {settings.vatPayer && !settings.dic && (
            <span className="err">Enter your DIČ above: a VAT invoice must show it.</span>
          )}
        </div>
        <div className="field"><label htmlFor="note">Note at the bottom (optional)</label>
          <input id="note" name="note" type="text" defaultValue={settings.note} /></div>
        <div className="field"><label htmlFor="nextNumber">Next invoice number</label>
          <input id="nextNumber" name="nextNumber" type="text" className="price-input" defaultValue={settings.nextNumber} />
          <span className="small">Goes up by one for each new invoice. Set it to continue your current numbering.</span></div>
        <input type="hidden" name="dueDays" value={settings.dueDays} />
        <div className="actions"><button type="submit">Save invoice details</button></div>
      </form>

      {recent.length > 0 && (
        <section className="card stack">
          <h2>Recent payments</h2>
          <ul className="payments">
            {recent.map((p) => (
              <li key={p.id} className="payment-row">
                <span><Link href={`/admin/requests/${p.request_id}#payments`}>{p.first_name}</Link> · {formatDay(p.paid_on)} · {p.method}</span>
                <span>
                  <b>{czk(p.amount_czk)}</b>{" "}
                  <a href={`/admin/invoices/${p.id}`} target="_blank" rel="noopener" className="small">
                    {p.invoice_number ? `Invoice ${p.invoice_number}` : "Create invoice"}
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
