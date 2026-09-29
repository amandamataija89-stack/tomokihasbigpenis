import type { SignedIntake } from "@/lib/intake";
import { sendIntakeAction } from "../../../actions";
import { formatDate } from "../../../format";

const yn = (v: string, details: string) => (v === "yes" ? <><b>Yes</b>{details ? `: ${details}` : ""}</> : v === "no" ? "No" : "—");

// The client's intake & registration answers, or whether the form is still to be filled in.
export function IntakeCard({ requestId, intake, sentAt }: { requestId: string; intake: SignedIntake | null; sentAt: Date | null }) {
  if (!intake)
    return (
      <section className="card stack" id="intake">
        <h2>Intake &amp; registration form</h2>
        <p className="notice">
          <b>Not filled in yet.</b> The client fills it in before the free discovery session.{" "}
          {sentAt ? `The link was emailed on ${formatDate(sentAt)}.` : "It's emailed with the discovery session invitation."}
        </p>
        <form action={sendIntakeAction.bind(null, requestId)}>
          <button type="submit" className="ghost small-btn">{sentAt ? "Email the link again" : "Email the intake form now"}</button>
        </form>
      </section>
    );
  const a = intake.answers;
  return (
    <section className="card stack" id="intake">
      <h2>Intake &amp; registration form</h2>
      <p className="small">Filled in and signed by {intake.signed_name} on {formatDate(intake.signed_at)}.</p>
      {a.harmThoughts === "yes" && (
        <p className="err" role="alert"><b>Thoughts of harming themselves or others: YES.</b> {a.harmDetails}</p>
      )}
      <dl className="facts">
        <dt>Name</dt><dd>{a.lastName}, {a.firstName}</dd>
        <dt>Date of birth</dt><dd>{a.dateOfBirth}</dd>
        <dt>Gender</dt><dd>{a.gender || "—"}</dd>
        <dt>Phone · email</dt><dd className="mono">{a.phone} · {a.email}</dd>
        <dt>Country of origin</dt><dd>{a.countryOfOrigin || "—"}</dd>
        <dt>Relationship</dt><dd>{a.relationship}</dd>
        <dt>Lives in Czech Republic</dt><dd>{a.livesInCz === "yes" ? "Yes" : "No"}</dd>
        <dt>Illnesses, surgeries, hospitalizations</dt><dd>{a.illnesses || "—"}</dd>
        <dt>Medications</dt><dd>{a.medications || "—"}</dd>
        <dt>Last two weeks</dt><dd>{a.symptoms.length ? a.symptoms.join(", ") : "None ticked"}{a.frequency ? ` (${a.frequency.toLowerCase()})` : ""}</dd>
        <dt>Family mental health history</dt><dd>{yn(a.familyHistory, a.familyHistoryDetails)}</dd>
        <dt>Thoughts of harm</dt><dd>{yn(a.harmThoughts, a.harmDetails)}</dd>
        <dt>Previous consultation</dt><dd>{yn(a.previousHelp, a.previousHelpDetails)}</dd>
        <dt>Addiction</dt><dd>{yn(a.addiction, a.addictionDetails)}</dd>
        <dt>Motivation</dt><dd style={{ whiteSpace: "pre-wrap" }}>{a.motivation}</dd>
        <dt>For the discovery call</dt><dd style={{ whiteSpace: "pre-wrap" }}>{a.questions || "—"}</dd>
      </dl>
    </section>
  );
}
