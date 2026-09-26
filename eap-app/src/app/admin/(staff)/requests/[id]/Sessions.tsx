import { sessionLimit, type ClientKind, type ClientSession } from "@/lib/data";
import { LATE_CANCEL_HOURS } from "@/lib/deadlines";
import {
  addSession,
  moveSession,
  removeSession,
  setSessionOutcome,
  setSessionPaid,
  setSessionPrice,
  updateClientEmail,
} from "../../../actions";
import { formatDate, toPragueInput } from "../../../format";

const NotifyBox = ({ label }: { label: string }) => (
  <label className="consent small-consent">
    <input type="checkbox" name="notifyClient" value="yes" defaultChecked />
    <span>{label}</span>
  </label>
);

const czk = (n: number) => `${n.toLocaleString("cs-CZ")} CZK`;

// Price and paid tick for one session of a private client.
function Payment({ s }: { s: ClientSession }) {
  return (
    <span className="payment">
      <input
        type="text"
        inputMode="numeric"
        name="price"
        aria-label="Price in CZK"
        placeholder="Price, CZK"
        defaultValue={s.price_czk ?? ""}
        className="price-input"
      />
      <button formAction={setSessionPrice.bind(null, s.id)} className="ghost small-btn">Save price</button>
      {s.paid_at ? (
        <>
          <span className="pill pill-paid">✓ Paid {formatDate(s.paid_at)}</span>
          <button formAction={setSessionPaid.bind(null, s.id, false)} className="ghost small-btn">Not paid</button>
        </>
      ) : (
        <button formAction={setSessionPaid.bind(null, s.id, true)} className="small-btn">Mark paid</button>
      )}
    </span>
  );
}

export function Sessions({
  requestId,
  kind,
  sessions,
  clientEmail,
  error,
}: {
  requestId: string;
  kind: ClientKind;
  sessions: ClientSession[];
  clientEmail: string;
  error?: string;
}) {
  const limit = sessionLimit(kind);
  const paying = kind === "private";
  const done = sessions.filter((s) => s.done_at).length;
  const unpaid = sessions.filter((s) => s.done_at && !s.paid_at);
  const owed = unpaid.reduce((sum, s) => sum + (s.price_czk ?? 0), 0);
  const lastPrice = [...sessions].reverse().find((s) => s.price_czk !== null)?.price_czk ?? null;
  const now = Date.now();
  return (
    <section className="card stack" id="sessions">
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <h2>Sessions</h2>
        <span className="actions" style={{ gap: 8 }}>
          {paying && unpaid.length > 0 && (
            <span className="pill pill-unpaid">
              {unpaid.length} unpaid{owed ? ` · ${czk(owed)}` : ""}
            </span>
          )}
          <span className={`pill ${limit && done >= limit ? "pill-completed" : "pill-scheduled"}`}>
            {limit ? `${done} of ${limit} done` : `${done} done · private, no limit`}
          </span>
        </span>
      </div>
      {limit && (
        <div className="slots" aria-hidden="true">
          {Array.from({ length: limit }, (_, i) => (
            <span key={i} className={i < done ? "slot used" : i < sessions.length ? "slot booked" : "slot"} />
          ))}
        </div>
      )}
      <form action={updateClientEmail.bind(null, requestId)} className="client-email">
        <label htmlFor="clientEmail">Session emails go to</label>
        <div className="actions">
          <input id="clientEmail" name="clientEmail" type="email" defaultValue={clientEmail} />
          <button type="submit" className="ghost small-btn">Save email</button>
        </div>
        <span className="small">
          The client is emailed automatically when a session is booked, moved or removed (untick the box to skip it).
          Emails give the date, time, therapist and where to meet, never the reason for coming.
        </span>
      </form>
      {error === "email" && <p className="err" role="alert">Enter an email address like name@example.com.</p>}
      {error === "emailsaved" && <p className="flash" role="status">Client email saved.</p>}
      {error === "date" && <p className="err" role="alert">Choose a date and time for the session.</p>}
      {error === "full" && limit && (
        <p className="err" role="alert">This client already has {limit} sessions booked.</p>
      )}
      {error === "price" && (
        <p className="err" role="alert">Enter the price as a whole number of CZK, e.g. 1500, or leave it empty.</p>
      )}

      <p className="small">
        Cancelled with less than {LATE_CANCEL_HOURS} hours&apos; notice? Press <b>Late cancellation</b>:{" "}
        {limit ? <>it counts as one of the {limit} sessions.</> : <>it counts as a session and is charged.</>}{" "}
        Cancelled in time? Press <b>Remove</b>, and it doesn&apos;t count. Clients are emailed a reminder{" "}
        {LATE_CANCEL_HOURS} hours before each session.
        {paying && <> Private client: add a price to each session and press <b>Mark paid</b> when they&apos;ve paid.</>}
      </p>
      {sessions.length > 0 && (
        <ol className="sessions">
          {sessions.map((s, i) => {
            const missed = !s.done_at && s.starts_at.getTime() < now;
            return (
              <li key={s.id} className={s.done_at ? "session done" : "session"}>
                <form className="session-row">
                  <span className="session-n">Session {i + 1}</span>
                  {s.done_at ? (
                    <>
                      <span className="session-when">{formatDate(s.starts_at)}</span>
                      {s.late_cancelled ? (
                        <span className="pill pill-contacted">Late cancellation · counts</span>
                      ) : (
                        <span className="pill pill-completed">✓ Done</span>
                      )}
                      <button formAction={setSessionOutcome.bind(null, s.id, "undo")} className="ghost small-btn">
                        Undo
                      </button>
                      {paying && <Payment s={s} />}
                    </>
                  ) : (
                    <>
                      <input
                        type="datetime-local"
                        name="startsAt"
                        aria-label={`Session ${i + 1} date and time`}
                        defaultValue={toPragueInput(s.starts_at)}
                      />
                      <button formAction={setSessionOutcome.bind(null, s.id, "done")} className="small-btn">
                        Mark done
                      </button>
                      <button formAction={setSessionOutcome.bind(null, s.id, "late")} className="ghost small-btn">
                        Late cancellation
                      </button>
                      <button formAction={moveSession.bind(null, s.id)} className="ghost small-btn">
                        Save new time
                      </button>
                      <button formAction={removeSession.bind(null, s.id)} className="ghost small-btn">
                        Remove (cancelled in time)
                      </button>
                      {missed && <span className="small overdue">Date has passed: mark it done or move it</span>}
                      {paying && <Payment s={s} />}
                      <NotifyBox label="Email the client if I change or remove this session" />
                    </>
                  )}
                </form>
              </li>
            );
          })}
        </ol>
      )}

      {!limit || sessions.length < limit ? (
        <form action={addSession.bind(null, requestId)} className="form add-session">
          <label htmlFor="new-session">Book session {sessions.length + 1}</label>
          <div className="actions">
            <input id="new-session" type="datetime-local" name="startsAt" />
            {paying && (
              <input
                type="text"
                inputMode="numeric"
                name="price"
                aria-label="Price in CZK"
                placeholder="Price, CZK"
                defaultValue={lastPrice ?? ""}
                className="price-input"
              />
            )}
            <button type="submit">Book session</button>
          </div>
          <NotifyBox label={`Email a confirmation to ${clientEmail}`} />
        </form>
      ) : (
        done < limit && <p className="small">All {limit} sessions are booked. Mark each one done after it happens.</p>
      )}
      {limit && done >= limit && (
        <p className="flash">All {limit} sessions are done, so this case is marked Completed.</p>
      )}
      {!limit && (
        <p className="small">
          Private clients have no session limit. When you finish working together, set the status to{" "}
          <b>Completed</b> under Follow-up.
        </p>
      )}
    </section>
  );
}
