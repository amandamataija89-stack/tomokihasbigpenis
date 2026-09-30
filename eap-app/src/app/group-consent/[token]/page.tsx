import type { Metadata } from "next";
import { Brand, SiteFooter } from "@/components/Brand";
import { CONSENT_SECTIONS, CONSENT_TITLE } from "@/lib/consent-text";
import { latestGroupConsent, memberForToken } from "@/lib/group-consent";
import { ConsentForm } from "../../consent/[token]/ConsentForm";
import { signGroupConsent } from "./actions";

export const metadata: Metadata = { title: "Informed consent – Prague Integration", robots: { index: false } };

const when = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Prague" }).format(d);

// A group member reads and signs the informed consent form before joining the group.
export default async function GroupConsentPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ signed?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const m = await memberForToken(token);
  if (!m)
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
  const signed = await latestGroupConsent(m.memberId);
  if (signed)
    return (
      <main className="wrap">
        <Brand />
        <section className="card stack">
          <h1 style={{ fontSize: 28 }}>{sp.signed ? "Thank you, it's signed" : "Your consent form is signed"}</h1>
          <p>Signed by {signed.signedName} on {when(signed.signed_at)}. We&apos;ve emailed a copy to {signed.email}.</p>
          <p><a className="button" href={`/group-consent/${token}/pdf`}>Download your signed form (PDF)</a></p>
        </section>
        <SiteFooter />
      </main>
    );
  return (
    <main className="wrap">
      <Brand />
      <section className="stack">
        <h1>{CONSENT_TITLE}</h1>
        <p className="lede">For {m.groupName}. Please read the form, fill in your details and sign at the bottom before the group starts.</p>
      </section>
      <article className="card stack legal consent-text">
        {CONSENT_SECTIONS.map((s, i) => (
          <section key={i} className="stack" style={{ gap: 6 }}>
            {s.heading && <h2>{s.heading}</h2>}
            {s.paragraphs?.map((p, j) => <p key={j}>{p}</p>)}
            {s.bullets && <ul>{s.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
          </section>
        ))}
        <section className="stack" style={{ gap: 6 }}>
          <h2>Group confidentiality</h2>
          <p>
            In a group, confidentiality depends on everyone. By signing, you agree not to share outside the group anything
            that would identify other members or what they said. Your counsellor keeps the same confidentiality as in
            individual counselling, but can&apos;t guarantee that other members will.
          </p>
        </section>
      </article>
      <ConsentForm sign={signGroupConsent.bind(null, token)} email={m.email} fullName={`${m.firstName} ${m.surname}`} address="" />
      <SiteFooter />
    </main>
  );
}
