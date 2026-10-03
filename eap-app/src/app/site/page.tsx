import type { Metadata } from "next";
import Link from "next/link";
import { Brand, CrisisNotice, SiteFooter } from "@/components/Brand";

export const metadata: Metadata = {
  title: "Prague Integration – Personal and workplace mental health",
  description:
    "Counselling, therapy and coaching in Prague, online and in person, and Employee Assistance Programmes for companies.",
};

// The temporary home page at pragueintegration.cz while the new website is being built.
export default function SitePage() {
  return (
    <main className="wrap">
      <Brand href="/" />
      <section className="stack">
        <h1>Personal and workplace mental health, thoughtfully matched.</h1>
        <p className="lede">
          From individual therapy to company wellbeing programmes, Prague Integration connects you with qualified people
          who understand your world, and your language.
        </p>
        <p className="notice">
          <b>Our website is being updated.</b> Everything else works as usual: you can ask for support below, and existing
          clients&apos; private pages and sessions are not affected.
        </p>
      </section>

      <section className="card stack">
        <h2>For individuals</h2>
        <p>
          Counselling, therapy and coaching for adults, couples, teenagers and students, online or in person in Prague. Your
          first discovery session is free and online.
        </p>
        <p><Link className="button" href="/start">Ask for support</Link></p>
      </section>

      <section className="card stack">
        <h2>For companies</h2>
        <p>
          Our Employee Assistance Programme gives your team confidential support in their own language. You only ever see
          anonymous numbers, never who asked or why.
        </p>
        <p className="actions" style={{ gap: 12 }}>
          <Link className="button ghost" href="/eap">I have a company code</Link>
          <a className="button ghost" href="mailto:contact@pragueintegration.cz?subject=Employee%20Assistance%20Programme">
            Ask about an EAP for your company
          </a>
        </p>
      </section>

      <section className="card stack">
        <h2>Contact</h2>
        <p>
          <a href="mailto:contact@pragueintegration.cz">contact@pragueintegration.cz</a> · <a href="tel:+420608573256">+420 608 573 256</a>
          <br />
          In-person sessions: Mezibranská 4, 110 00 Prague 1
        </p>
      </section>

      <CrisisNotice />
      <SiteFooter />
    </main>
  );
}
