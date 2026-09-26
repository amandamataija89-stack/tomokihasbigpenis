import Link from "next/link";
import type { ReactNode } from "react";
import { Brand, SiteFooter } from "./Brand";

export const LEGAL_UPDATED = "27 September 2026";

// Shared layout for the Privacy Policy, Terms of Service and Cookie Policy.
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="wrap">
      <Brand />
      <article className="card stack legal">
        <h1>{title}</h1>
        <p className="small">Last updated: {LEGAL_UPDATED}</p>
        {children}
        <p className="small">
          See also: <Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Service</Link> ·{" "}
          <Link href="/cookies">Cookie Policy</Link>
        </p>
      </article>
      <SiteFooter />
    </main>
  );
}

export const COMPANY = {
  name: "Prague Integration s.r.o.",
  address: "Olšanská 4E, 130 00 Praha 3, Czech Republic",
  ico: "21048428",
  dic: "CZ21048428",
  email: "contact@pragueintegration.cz",
  phone: "+420 608 573 256",
};
