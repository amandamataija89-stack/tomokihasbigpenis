import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="brand" aria-label="Prague Integration">
      <span className="wordmark">
        Prague
        <br />
        Integration<span className="plus">+</span>
      </span>
      <span className="marks" aria-hidden="true">
        <span className="dot" />
        <span className="dot" />
        <span className="tri-up" />
        <span className="tri-down" />
      </span>
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="site">
      <span>Prague Integration s.r.o. · Mezibranská 4, 110 00 Prague 1</span>
      <span>+420 608 573 256 · contact@pragueintegration.cz</span>
    </footer>
  );
}

export function CrisisNotice() {
  return (
    <p className="notice">
      <b>Need help right now?</b> This service is not for emergencies. Call <b>112</b>, or the Linka první
      psychické pomoci on <b>116 123</b> (free, 24/7).
    </p>
  );
}
