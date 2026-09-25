import { LANGUAGES } from "@/lib/request-form";

const THERAPY_LANGUAGES = LANGUAGES.filter((l) => l !== "Other");

// Shared by the Team page (coordinators editing anyone) and My availability (each person, themselves).
export function AvailabilityFields({
  idPrefix,
  languages,
  capacity,
  maxCapacity,
  takesClients,
  awayUntil,
}: {
  idPrefix: string;
  languages: string[];
  capacity: number;
  maxCapacity: number;
  takesClients: boolean;
  awayUntil: string;
}) {
  return (
    <>
      <label className="consent">
        <input type="checkbox" name="takesClients" value="yes" defaultChecked={takesClients} />
        <span>Taking new clients</span>
      </label>
      <div className="actions">
        <label htmlFor={`cap-${idPrefix}`} className="small">New clients per month</label>
        <input id={`cap-${idPrefix}`} name="capacity" type="number" min={0} max={maxCapacity} defaultValue={capacity} className="cap-input" />
      </div>
      <div className="actions">
        <label htmlFor={`away-${idPrefix}`} className="small">Away until (no new clients before then)</label>
        <input id={`away-${idPrefix}`} name="awayUntil" type="date" defaultValue={awayUntil} className="date-input" />
      </div>
      <fieldset>
        <legend className="small">Works in<span className="opt">none ticked = any language</span></legend>
        <div className="choices">
          {THERAPY_LANGUAGES.map((l) => (
            <label className="choice" key={l}>
              <input type="checkbox" name="languages" value={l} defaultChecked={languages.includes(l)} />
              <span>{l}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
