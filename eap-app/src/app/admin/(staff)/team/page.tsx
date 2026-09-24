import { therapistLoads } from "@/lib/assign";
import { pool } from "@/lib/db";
import { LANGUAGES } from "@/lib/request-form";
import { updateTherapist } from "../../actions";
import { AddTherapistForm } from "./AddTherapistForm";

const THERAPY_LANGUAGES = LANGUAGES.filter((l) => l !== "Other");
const monthName = () => new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "Europe/Prague" }).format(new Date());

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const [everyone, { rows: flags }] = await Promise.all([
    therapistLoads(pool, false),
    pool.query<{ id: string; takes_clients: boolean }>("SELECT id, takes_clients FROM staff"),
  ]);
  const taking = new Set(flags.filter((f) => f.takes_clients).map((f) => f.id));
  const active = everyone.filter((t) => taking.has(t.id));
  const others = everyone.filter((t) => !taking.has(t.id));
  const places = active.reduce((a, t) => a + t.capacity, 0);
  const used = active.reduce((a, t) => a + Math.min(t.assignedThisMonth, t.capacity), 0);

  return (
    <main className="stack" style={{ gap: 20 }}>
      <div className="stack">
        <h1 style={{ fontSize: 32 }}>Team</h1>
        <p className="lede">
          New requests are shared out automatically to the therapist with the fewest new clients this month who
          works in the person&apos;s language. Anyone at their limit is skipped and the case passes to the next
          therapist. If everyone in that language is full, it goes to another therapist with space and is flagged to
          check the language. Counts restart on the 1st.
        </p>
      </div>
      {saved && <p className="flash" role="status">Saved.</p>}

      <section className="card load-summary">
        <div>
          <span className="big-num">{used}</span>
          <span className="of">/ {places}</span>
        </div>
        <p>
          new-client places used in {monthName()} across {active.length}{" "}
          {active.length === 1 ? "therapist" : "therapists"}.{" "}
          {places > 0 && used >= places && <b className="overdue">
              Everyone is full. New requests wait until a place opens or you assign them; crisis cases are still
              assigned straight away.
            </b>}
        </p>
        <div className="meter" aria-hidden="true"><span style={{ width: `${places ? (used / places) * 100 : 0}%` }} /></div>
      </section>

      {active.length === 0 ? (
        <p className="card empty">No therapists are taking new clients yet. Add your team below.</p>
      ) : (
        <div className="therapists">
          {active.map((t) => {
            const full = t.assignedThisMonth >= t.capacity;
            return (
              <form key={t.id} action={updateTherapist.bind(null, t.id)} className="card therapist">
                <div className="therapist-head">
                  <div>
                    <h2>{t.name}</h2>
                    <span className="small">{t.email}</span>
                  </div>
                  <span className={`pill ${full ? "pill-new" : "pill-scheduled"}`}>
                    {t.assignedThisMonth} / {t.capacity}{full ? " · full" : ""}
                  </span>
                </div>
                <div className="slots" aria-label={`${t.assignedThisMonth} of ${t.capacity} new clients this month`}>
                  {Array.from({ length: Math.max(t.capacity, t.assignedThisMonth) }, (_, i) => (
                    <span key={i} className={i < t.assignedThisMonth ? (i >= t.capacity ? "slot over" : "slot used") : "slot"} />
                  ))}
                </div>
                <TherapistFields languages={t.languages} capacity={t.capacity} takesClients idPrefix={t.id} />
                <div className="actions"><button type="submit" className="ghost small-btn">Save</button></div>
              </form>
            );
          })}
        </div>
      )}

      <AddTherapistForm languages={THERAPY_LANGUAGES} />

      {others.length > 0 && (
        <section className="stack">
          <h2>Not taking new clients</h2>
          <div className="therapists">
            {others.map((t) => (
              <form key={t.id} action={updateTherapist.bind(null, t.id)} className="card therapist">
                <div className="therapist-head">
                  <div>
                    <h2>{t.name}</h2>
                    <span className="small">{t.email}</span>
                  </div>
                </div>
                <TherapistFields languages={t.languages} capacity={t.capacity} takesClients={false} idPrefix={t.id} />
                <div className="actions"><button type="submit" className="ghost small-btn">Save</button></div>
              </form>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function TherapistFields({
  languages,
  capacity,
  takesClients,
  idPrefix,
}: {
  languages: string[];
  capacity: number;
  takesClients: boolean;
  idPrefix: string;
}) {
  return (
    <>
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
      <div className="actions">
        <label htmlFor={`cap-${idPrefix}`} className="small">New clients per month</label>
        <input id={`cap-${idPrefix}`} name="capacity" type="number" min={0} max={100} defaultValue={capacity} className="cap-input" />
        <label className="consent">
          <input type="checkbox" name="takesClients" value="yes" defaultChecked={takesClients} />
          <span>Taking new clients</span>
        </label>
      </div>
    </>
  );
}
