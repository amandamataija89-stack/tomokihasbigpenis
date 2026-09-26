import { Brand, CrisisNotice, SiteFooter } from "@/components/Brand";
import { clientInvoices } from "@/lib/billing";
import { conversationFor, listMessages } from "@/lib/messages";
import { replyAsClient } from "./actions";

export const metadata = { title: "Your messages · Prague Integration" };
export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Prague",
});

export default async function ClientMessages({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ sent?: string; empty?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const convo = await conversationFor(token);
  if (!convo)
    return (
      <main className="wrap">
        <Brand />
        <section className="card stack">
          <h1 style={{ fontSize: 28 }}>This link no longer works</h1>
          <p>
            Links stop working 30 days after your sessions end. To get in touch, call +420 608 573 256 or write to
            contact@pragueintegration.cz.
          </p>
        </section>
        <SiteFooter />
      </main>
    );
  const [messages, invoices] = await Promise.all([listMessages(convo.requestId), clientInvoices(convo.requestId)]);
  return (
    <main className="wrap">
      <Brand />
      <section className="stack">
        <h1>Your messages</h1>
        <p className="lede">
          {convo.counsellorName
            ? `A private conversation between you (${convo.nickname}) and ${convo.counsellorName} at Prague Integration.`
            : `A private conversation between you (${convo.nickname}) and Prague Integration.`}{" "}
          Your employer can&apos;t see it.
        </p>
      </section>

      <section className="card thread" aria-label="Messages">
        {messages.length === 0 ? (
          <p className="small">No messages yet. You can write to us below, for example to ask a question or to cancel a session.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`bubble ${m.sender === "client" ? "mine" : "theirs"}`}>
              <span className="bubble-meta">
                {m.sender === "client" ? "You" : m.staff_name ?? "Prague Integration"} · {when.format(m.created_at)}
              </span>
              <p>{m.body}</p>
            </div>
          ))
        )}
      </section>

      {invoices.length > 0 && (
        <section className="card stack" aria-label="Invoices">
          <h2 style={{ fontSize: 20 }}>Your invoices / Vaše faktury</h2>
          <ul className="payments">
            {invoices.map((i) => (
              <li key={i.id} className="payment-row">
                <span>
                  <a href={`/messages/${token}/invoices/${i.id}`} target="_blank" rel="noopener">Invoice {i.invoice_number}</a>
                  {i.period && <span className="small"> · {i.period}</span>}
                </span>
                <span>
                  <b>{i.amount_czk.toLocaleString("cs-CZ")} CZK</b>{" "}
                  {i.paid_on ? (
                    <span className="pill pill-paid">Paid</span>
                  ) : (
                    <span className="pill pill-unpaid">To pay by {i.due_on}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="small">Open an invoice to see the payment details and the QR code for your banking app.</p>
        </section>
      )}

      <form action={replyAsClient.bind(null, token)} className="card form" id="reply">
        <label htmlFor="message">Write a message</label>
        <textarea id="message" name="message" maxLength={4000} placeholder="e.g. Could we move Thursday's session to the afternoon?" />
        {sp.empty && <p className="err" role="alert">Write something before sending.</p>}
        {sp.sent && <p className="flash" role="status">Sent. We&apos;ll email you when there&apos;s a reply.</p>}
        <div className="actions"><button type="submit">Send</button></div>
        <p className="small">
          To cancel a session without it counting, please tell us at least 48 hours before. Keep this page&apos;s link
          to yourself: anyone with it can read your messages.
        </p>
      </form>
      <CrisisNotice />
      <SiteFooter />
    </main>
  );
}
