import { CRISIS_SECTIONS, type CrisisChecklist } from "@/lib/crisis";
import { saveCrisisChecklistAction } from "../../../actions";
import { formatDate } from "../../../format";

// The crisis protocol, shortened to tick boxes, with the client's emergency details at hand.
export function CrisisProtocol({
  requestId,
  list,
  phone,
  location,
  emergencyContact,
  saved,
}: {
  requestId: string;
  list: CrisisChecklist;
  phone: string;
  location: string;
  emergencyContact: string;
  saved: boolean;
}) {
  const done = list.checked.length;
  return (
    <section className="card stack crisis-protocol" id="crisis-protocol">
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <h2>Crisis protocol</h2>
        <span className="small">
          {done} ticked{list.updated_at ? ` · last saved ${formatDate(list.updated_at)}${list.updated_by_name ? ` by ${list.updated_by_name}` : ""}` : ""}
        </span>
      </div>
      {saved && <p className="flash" role="status">Saved and recorded in the team notes.</p>}
      <div className="crisis-numbers">
        <span><b>112</b> emergency (English)</span>
        <span><b>155</b> ambulance</span>
        <span><b>158</b> police</span>
        <span><b>116 123</b> crisis line</span>
      </div>
      <dl className="facts">
        <dt>Client&apos;s phone</dt><dd className="mono">{phone || "— not given"}</dd>
        <dt>Address on file</dt><dd style={{ whiteSpace: "pre-line" }}>{location || "— not given: confirm where they are now"}</dd>
        <dt>Emergency contact</dt><dd>{emergencyContact || "— none on file (consent form not signed)"}</dd>
      </dl>
      <form action={saveCrisisChecklistAction.bind(null, requestId)} className="stack" style={{ gap: 14 }}>
        {CRISIS_SECTIONS.map((sec) => (
          <fieldset key={sec.title} className={`crisis-step${sec.when === "high" ? " high" : ""}`}>
            <legend><b>{sec.title}</b></legend>
            {sec.note && <p className="small">{sec.note}</p>}
            {sec.title.startsWith("2.") && (
              <div className="actions" style={{ gap: 16, margin: "4px 0 8px" }}>
                <span className="small"><b>Risk level:</b></span>
                <label className="consent small-consent">
                  <input type="radio" name="risk" value="low" defaultChecked={list.risk === "low"} />
                  <span>Low to moderate → 3A</span>
                </label>
                <label className="consent small-consent">
                  <input type="radio" name="risk" value="high" defaultChecked={list.risk === "high"} />
                  <span><b>High</b> → 3B</span>
                </label>
              </div>
            )}
            {sec.items.map((i) => (
              <label className="consent small-consent" key={i.key}>
                <input type="checkbox" name="checked" value={i.key} defaultChecked={list.checked.includes(i.key)} />
                <span>{i.label}</span>
              </label>
            ))}
            {sec.when === "high" && (
              <div className="field" style={{ marginTop: 8 }}>
                <label htmlFor="emergencyCall" className="small">If you broke confidentiality: time, who and which service you contacted</label>
                <input id="emergencyCall" name="emergencyCall" type="text" defaultValue={list.emergency_call} placeholder="e.g. 14:35, called 112, spoke to operator; called partner Petr" />
              </div>
            )}
          </fieldset>
        ))}
        <div className="field">
          <label htmlFor="report">Crisis report (within 24 hours): what you observed, risk factors, actions taken</label>
          <textarea id="report" name="report" rows={5} defaultValue={list.report} />
        </div>
        <div className="actions"><button type="submit">Save crisis protocol</button></div>
      </form>
    </section>
  );
}
