import Link from "next/link";
import type { Metadata } from "next";
import { Brand, CrisisNotice, SiteFooter } from "@/components/Brand";
import { RequestForm } from "../join/[code]/RequestForm";

export const metadata: Metadata = {
  title: "Book a first conversation – Prague Integration",
  description: "Ask for support from Prague Integration's psychologists, counsellors and coaches.",
};

// Prague Integration's own (private) clients: the same form as the EAP one, without a company code.
export default function StartPage() {
  return (
    <main className="wrap">
      <Brand />
      <section className="stack">
        <p className="small">
          Coming through your employer&apos;s programme? <Link href="/">Use your company code instead.</Link>
        </p>
        <h1>Ask for support</h1>
        <p className="lede">
          Tell us a little about yourself and how you&apos;d like to be contacted. One of our counsellors will
          contact you within 24 hours.
        </p>
      </section>
      <p className="reassure">What you write here is read only by the Prague Integration team, and kept confidential.</p>
      <RequestForm code={null} />
      <CrisisNotice />
      <SiteFooter />
    </main>
  );
}
