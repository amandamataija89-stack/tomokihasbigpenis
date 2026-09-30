import {
  bookDiscoveryAction,
  offerDiscoveryAction,
  requestConsentFromCoordinatorAction,
  sendConsentAndPaymentAction,
  sendIntakeAction,
} from "../../../actions";
import { formatDate } from "../../../format";
import { discoveryOffer } from "@/lib/discovery-offer";

type StepState = {
  accepted: Date | null;
  discoveryOffered: Date | null;
  discoverySession: { starts_at: Date; done: boolean } | null;
  intakeSent: Date | null;
  intakeDone: Date | null;
  firstFullSession: Date | null;
  consentRequested: Date | null;
  consentSent: Date | null;
  consentSigned: Date | null;
};

const Done = ({ when, text }: { when: Date | null; text: string }) =>
  when ? <span className="step-done">✓ {text} {formatDate(when)}</span> : null;

// The steps with a new private client, in order, with what's done and the button for what's next.
export function Steps({
  requestId,
  s,
  canAct,
  counsellorName,
  manager = false,
  flash,
}: {
  requestId: string;
  s: StepState;
  canAct: boolean;
  counsellorName: string;
  manager?: boolean; // coordinators and admins send the consent form and payment details
  flash?: string;
}) {
  return (
    <section className="card stack" id="steps">
      <h2>Steps with this client</h2>
      <ol className="client-steps">
        <li className={s.accepted ? "done" : "current"}>
          <b>Accept the client</b> (within 24 hours) <Done when={s.accepted} text="Accepted" />
        </li>
        <li className={s.discoveryOffered ? "done" : s.accepted ? "current" : ""}>
          <b>Offer a free discovery session</b> (online)
          <Done when={s.discoveryOffered} text="Offered" />
          {!s.discoveryOffered && s.accepted && canAct && (
            <form action={offerDiscoveryAction.bind(null, requestId)} className="step-form">
              <span className="small">Sends the client a message on their private page offering a free discovery session.</span>
              <details className="small">
                <summary>See the message</summary>
                <p style={{ whiteSpace: "pre-wrap" }}>{discoveryOffer(counsellorName)}</p>
              </details>
              <button type="submit" className="small-btn">Send the offer</button>
            </form>
          )}
        </li>
        <li className={s.discoverySession ? "done" : s.discoveryOffered ? "current" : ""}>
          <b>When they agree: book the discovery session (always online) and send the intake form</b>
          {s.discoverySession && <span className="step-done">✓ Discovery session {formatDate(s.discoverySession.starts_at)}</span>}
          <Done when={s.intakeDone} text="Intake form filled in" />
          {!s.discoverySession && canAct && (
            <form action={bookDiscoveryAction.bind(null, requestId)} className="step-form">
              <input type="datetime-local" name="startsAt" aria-label="Discovery session date and time" />
              <button type="submit" className="small-btn">Book free discovery session + send calendar invite and intake form</button>
              <span className="small">The client is emailed the time, the online meeting link, a calendar invitation to add it to their calendar, and the intake form.</span>
            </form>
          )}
          {s.discoverySession && !s.intakeDone && canAct && (
            <form action={sendIntakeAction.bind(null, requestId)} className="step-form">
              <span className="small">{s.intakeSent ? `Intake form sent ${formatDate(s.intakeSent)}, not filled in yet.` : "Intake form not sent."}</span>
              <button type="submit" className="ghost small-btn">{s.intakeSent ? "Send it again" : "Send intake form"}</button>
            </form>
          )}
        </li>
        <li className={s.consentSent ? "done" : s.discoverySession ? "current" : ""}>
          <b>If they choose counselling: onboarding details.</b> The counsellor informs the coordinator, who sends the client
          the onboarding details: the consent form to sign and the payment details (price, account, their variable symbol,
          pay within 24 hours after each session). The client has 72 hours to sign; then they get a reminder.
          {flash === "requested" && <p className="flash" role="status">The coordinator has been informed and will send the onboarding details.</p>}
          {flash === "sent" && <p className="flash" role="status">Onboarding details (consent form + payment details) sent to the client.</p>}
          <Done when={s.consentRequested} text="Coordinator informed" />
          <Done when={s.consentSent} text="Sent to the client" />
          {!s.consentSent && canAct && !manager && !s.consentRequested && (
            <form action={requestConsentFromCoordinatorAction.bind(null, requestId)} className="step-form">
              <button type="submit" className="small-btn">Inform the coordinator to send the onboarding details</button>
            </form>
          )}
          {manager && !s.consentSigned && (
            <form action={sendConsentAndPaymentAction.bind(null, requestId)} className="step-form">
              <button type="submit" className={s.consentSent ? "ghost small-btn" : "small-btn"}>
                {s.consentSent ? "Send the onboarding details again" : "Send onboarding details (consent form + payment details)"}
              </button>
            </form>
          )}
        </li>
        <li className={s.consentSigned ? "done" : s.consentSent ? "current" : ""}>
          <b>Consent form signed: counselling sessions can start.</b> You&apos;re emailed when they sign. Until then, sessions
          can be booked but not started (marked done).
          <Done when={s.consentSigned} text="Signed" />
          {s.consentSent && !s.consentSigned && <span className="small"> Waiting for the client to sign (sent {formatDate(s.consentSent)}).</span>}
          {s.firstFullSession && <span className="step-done"> · First full session {formatDate(s.firstFullSession)}</span>}
        </li>
      </ol>
    </section>
  );
}
