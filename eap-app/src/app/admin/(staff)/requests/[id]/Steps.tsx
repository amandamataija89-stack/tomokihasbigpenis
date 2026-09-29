import { bookDiscoveryAction, offerDiscoveryAction, sendIntakeAction } from "../../../actions";
import { formatDate } from "../../../format";

type StepState = {
  accepted: Date | null;
  discoveryOffered: Date | null;
  discoverySession: { starts_at: Date; done: boolean } | null;
  intakeSent: Date | null;
  intakeDone: Date | null;
  firstFullSession: Date | null;
  consentSent: Date | null;
  consentSigned: Date | null;
};

const Done = ({ when, text }: { when: Date | null; text: string }) =>
  when ? <span className="step-done">✓ {text} {formatDate(when)}</span> : null;

// The steps with a new private client, in order, with what's done and the button for what's next.
export function Steps({ requestId, s, canAct }: { requestId: string; s: StepState; canAct: boolean }) {
  return (
    <section className="card stack" id="steps">
      <h2>Steps with this client</h2>
      <ol className="client-steps">
        <li className={s.accepted ? "done" : "current"}>
          <b>Accept the client</b> (within 24 hours) <Done when={s.accepted} text="Accepted" />
        </li>
        <li className={s.discoveryOffered ? "done" : s.accepted ? "current" : ""}>
          <b>Offer a free discovery session</b>
          <Done when={s.discoveryOffered} text="Offered" />
          {!s.discoveryOffered && s.accepted && canAct && (
            <form action={offerDiscoveryAction.bind(null, requestId)} className="step-form">
              <span className="small">Sends the client a message on their private page offering a free discovery session.</span>
              <button type="submit" className="small-btn">Send the offer</button>
            </form>
          )}
        </li>
        <li className={s.discoverySession ? "done" : s.discoveryOffered ? "current" : ""}>
          <b>When they agree: book the discovery session and send the intake form</b>
          {s.discoverySession && <span className="step-done">✓ Discovery session {formatDate(s.discoverySession.starts_at)}</span>}
          <Done when={s.intakeDone} text="Intake form filled in" />
          {!s.discoverySession && canAct && (
            <form action={bookDiscoveryAction.bind(null, requestId)} className="step-form">
              <input type="datetime-local" name="startsAt" aria-label="Discovery session date and time" />
              <button type="submit" className="small-btn">Book free discovery session + send intake form</button>
            </form>
          )}
          {s.discoverySession && !s.intakeDone && canAct && (
            <form action={sendIntakeAction.bind(null, requestId)} className="step-form">
              <span className="small">{s.intakeSent ? `Intake form sent ${formatDate(s.intakeSent)}, not filled in yet.` : "Intake form not sent."}</span>
              <button type="submit" className="ghost small-btn">{s.intakeSent ? "Send it again" : "Send intake form"}</button>
            </form>
          )}
        </li>
        <li className={s.firstFullSession ? "done" : s.discoverySession ? "current" : ""}>
          <b>If they choose counselling: book the first full session</b> under Sessions below. The consent form and payment
          information (price, variable symbol, QR code, pay within 24 hours after each session) go to the client automatically.
          {s.firstFullSession && <span className="step-done">✓ First full session {formatDate(s.firstFullSession)}</span>}
          <Done when={s.consentSigned} text="Consent form signed" />
          {s.consentSent && !s.consentSigned && <span className="small"> Consent form sent {formatDate(s.consentSent)}, not signed yet.</span>}
        </li>
      </ol>
    </section>
  );
}
