import type { Metadata } from "next";
import { Brand, SiteFooter } from "@/components/Brand";
import { CONSENT_SECTIONS, CONSENT_TITLE } from "@/lib/consent-text";
import { latestConsent } from "@/lib/consent";
import { pool } from "@/lib/db";
import { conversationFor } from "@/lib/messages";
import { ConsentForm } from "./ConsentForm";

export const metadata: Metadata = { title: "Informed consent – Prague Integration", robots: { index: false } };

const when = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Prague" }).format(d);

// The client reads and signs the informed consent form before their first session.
export default async function ConsentPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ signed?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const convo = await conversationFor(token);
  if (!convo)
    return (
      <main className="wrap">
        <Brand />
        <section className="card stack">
          <h1 style={{ fontSize: 28 }}>This link no longer works</h1>
          <p>Please contact us on +420 608 573 256 or contact@pragueintegration.cz for a new one.</p>
        </section>
        <SiteFooter />
      </main>
    );
  const signed = await latestConsent(convo.requestId);
  if (signed)
    return (
      <main className="wrap">
        <Brand />
        <section className="card stack">
          <h1 style={{ fontSize: 28 }}>{sp.signed ? "Thank you, it's signed" : "Your consent form is signed"}</h1>
          <p>
            Signed by {signed.signedName} on {when(signed.signed_at)}. We&apos;ve emailed a copy to {signed.email}.
          </p>
          <p><a className="button" href={`/consent/${token}/pdf`}>Download your signed form (PDF)</a></p>
          <p className="small">If any of your details change, just let us know.</p>
        </section>
        <SiteFooter />
      </main>
    );
  const { rows } = await pool.query<{ email: string; full_name: string; address: string }>(
    "SELECT email, full_name, address FROM support_requests WHERE id = $1",
    [convo.requestId],
  );
  return (
    <main className="wrap">
      <Brand />
      <section className="stack">
        <h1>{CONSENT_TITLE}</h1>
        <p className="lede">Please read the form, fill in your details and sign at the bottom before your first session.</p>
      </section>
      <article className="card stack legal consent-text">
        {CONSENT_SECTIONS.map((s, i) => (
          <section key={i} className="stack" style={{ gap: 6 }}>
            {s.heading && <h2>{s.heading}</h2>}
            {s.paragraphs?.map((p, j) => <p key={j}>{p}</p>)}
            {s.bullets && <ul>{s.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
          </section>
        ))}
      </article>
      <ConsentForm token={token} email={rows[0]?.email ?? ""} fullName={rows[0]?.full_name ?? ""} address={rows[0]?.address ?? ""} />
      <SiteFooter />
    </main>
  );
}
