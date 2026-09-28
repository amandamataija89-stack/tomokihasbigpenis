import type { SignedConsent } from "@/lib/consent";
import { sendConsentAction } from "../../../actions";
import { formatDate } from "../../../format";

// The client's informed consent form: whether it's signed, their emergency contact, and sending the link.
export function ConsentCard({
  requestId,
  signed,
  sentAt,
  flash,
}: {
  requestId: string;
  signed: SignedConsent | null;
  sentAt: Date | null;
  flash?: string;
}) {
  return (
    <section className="card stack" id="consent">
      <h2>Informed consent form</h2>
      {flash === "sent" && <p className="flash" role="status">Consent form emailed to the client.</p>}
      {signed ? (
        <>
          <p>
            <span className="pill pill-completed">✓ Signed</span> by {signed.signedName}
            {signed.forMinor ? " (parent/guardian)" : ""} on {formatDate(signed.signed_at)}
          </p>
          <dl className="facts">
            <dt>Emergency contact</dt><dd>{signed.emergencyName}</dd>
            <dt>Relationship, contact</dt><dd>{signed.emergencyContact}</dd>
            <dt>Phone</dt><dd className="mono">{signed.phone}</dd>
            <dt>Home address</dt><dd style={{ whiteSpace: "pre-line" }}>{signed.homeAddress}</dd>
            {signed.localAddress && (<><dt>Local address</dt><dd style={{ whiteSpace: "pre-line" }}>{signed.localAddress}</dd></>)}
            {signed.otherInfo && (<><dt>Other information</dt><dd>{signed.otherInfo}</dd></>)}
          </dl>
          <p><a className="button ghost small-btn" href={`/admin/consent/${requestId}`} target="_blank" rel="noopener">Download signed form (PDF)</a></p>
        </>
      ) : (
        <>
          <p className="notice">
            <b>Not signed yet.</b> The client must sign before their first full session.{" "}
            {sentAt ? `The link was emailed on ${formatDate(sentAt)}.` : "It's emailed automatically when the first session is booked."}
          </p>
          <form action={sendConsentAction.bind(null, requestId)}>
            <button type="submit" className="ghost small-btn">{sentAt ? "Email the link again" : "Email the consent form now"}</button>
          </form>
        </>
      )}
    </section>
  );
}
