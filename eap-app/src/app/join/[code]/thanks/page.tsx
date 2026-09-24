import { Brand, CrisisNotice, SiteFooter } from "@/components/Brand";

export default function Thanks() {
  return (
    <main className="wrap">
      <Brand />
      <section className="card stack">
        <h1>Thank you. We&apos;ve got your request.</h1>
        <p className="lede">
          Someone from our team will contact you within 24 hours, in the way you asked. We&apos;ve also sent a
          confirmation to your email.
        </p>
        <p className="lede">
          If you&apos;d rather talk to us sooner, call <b>+420 608 573 256</b>.
        </p>
      </section>
      <CrisisNotice />
      <SiteFooter />
    </main>
  );
}
