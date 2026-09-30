import type { SignedConsent } from "@/lib/consent";
import { sendConsentAction } from "../../../actions";
import { formatDate } from "../../../format";

// The client's informed consent form: whether it's signed, their emergency contact, and sending the link.
export function ConsentCard({
  requestId,
  manager = false,
  signed,
  sentAt,
  flash,
}: {
  requestId: string;
  manager?: boolean; // coordinators and admins send the consent form
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
            <dt>Address in Prague</dt><dd style={{ whiteSpace: "pre-line" }}>{signed.localAddress || "—"}</dd>
            {signed.homeAddress && (<><dt>Permanent address</dt><dd style={{ whiteSpace: "pre-line" }}>{signed.homeAddress}</dd></>)}
            {signed.otherInfo && (<><dt>Other information</dt><dd>{signed.otherInfo}</dd></>)}
          </dl>
          <p><a className="button ghost small-btn" href={`/admin/consent/${requestId}`} target="_blank" rel="noopener">Download signed form (PDF)</a></p>
        </>
      ) : (
        <>
          <p className="notice">
            <b>Not signed yet.</b> The client must sign before their first full session.{" "}
            {sentAt
              ? `The link was emailed on ${formatDate(sentAt)}. The client has 72 hours to sign; then they're reminded.`
              : "The coordinator sends it with the payment details (Steps with this client, step 4)."}
          </p>
          {manager && sentAt && (
          <form action={sendConsentAction.bind(null, requestId)}>
            <button type="submit" className="ghost small-btn">Email the link again</button>
          </form>
          )}
        </>
      )}
    </section>
  );
}
