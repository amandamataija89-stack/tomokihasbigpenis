import { Brand, SiteFooter } from "@/components/Brand";
import { findInvite } from "@/lib/feedback";
import { FeedbackForm } from "./FeedbackForm";

export default async function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findInvite(token);
  return (
    <main className="wrap">
      <Brand />
      {!invite ? (
        <section className="card stack">
          <h1>This link has already been used</h1>
          <p className="lede">
            Each feedback link works once and expires after 60 days. If you still want to tell us something, write to
            contact@pragueintegration.cz.
          </p>
        </section>
      ) : (
        <>
          <section className="stack">
            <h1>How did it go?</h1>
            <p className="lede">Your feedback helps us look after the people who come to us. It takes about two minutes.</p>
          </section>
          <p className="reassure">
            This is anonymous. We don&apos;t store your name, email or any details of your case with your answers, and
            your counsellor doesn&apos;t see them. They&apos;re read only by the head of Prague Integration, who sees
            which counsellor you worked with{invite.counsellorName ? ` (${invite.counsellorName})` : ""} so we can
            support our team.
          </p>
          <FeedbackForm token={token} counsellorName={invite.counsellorName} />
        </>
      )}
      <SiteFooter />
    </main>
  );
}
