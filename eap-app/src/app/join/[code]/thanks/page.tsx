import { Brand, CrisisNotice, SiteFooter } from "@/components/Brand";

export default async function Thanks({ searchParams }: { searchParams: Promise<{ urgent?: string }> }) {
  const urgent = (await searchParams).urgent === "1";
  return (
    <main className="wrap">
      <Brand />
      {urgent && (
        <section className="notice stack" role="alert">
          <h2>You said you are in a crisis</h2>
          <p>
            We&apos;ve noted this, and we&apos;ll contact you within 24 working hours. We are not an emergency service. If you feel unsafe or
            might harm yourself, don&apos;t wait for us: call <b>112</b> now, or the Linka první psychické pomoci on{" "}
            <b>116 123</b> (free, 24/7). You can also call us on <b>+420 608 573 256</b>.
          </p>
        </section>
      )}
      <section className="card stack">
        <h1>Thank you. We&apos;ve got your request.</h1>
        <p className="lede">
          {urgent
            ? "Someone from our team will contact you within 24 working hours (Monday to Friday), in the way you asked. We are not an emergency service: if you or someone else is in danger, call 112 or the crisis line 116 123 (free, 24/7)."
            : "Someone from our team will contact you within 24 working hours (Monday to Friday), in the way you asked."}{" "}
          We&apos;ve also sent a confirmation to your email.
        </p>
        {!urgent && (
          <p className="lede">
            If you&apos;d rather talk to us sooner, call <b>+420 608 573 256</b>.
          </p>
        )}
      </section>
      {!urgent && <CrisisNotice />}
      <SiteFooter />
    </main>
  );
}
