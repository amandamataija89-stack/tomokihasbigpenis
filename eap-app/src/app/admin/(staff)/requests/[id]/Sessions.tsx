import { SESSIONS_PER_CLIENT, type ClientSession } from "@/lib/data";
import { LATE_CANCEL_HOURS } from "@/lib/deadlines";
import { addSession, moveSession, removeSession, setSessionOutcome, updateClientEmail } from "../../../actions";
import { formatDate, toPragueInput } from "../../../format";

const NotifyBox = ({ label }: { label: string }) => (
  <label className="consent small-consent">
    <input type="checkbox" name="notifyClient" value="yes" defaultChecked />
    <span>{label}</span>
  </label>
);

export function Sessions({
  requestId,
  sessions,
  clientEmail,
  error,
}: {
  requestId: string;
  sessions: ClientSession[];
  clientEmail: string;
  error?: string;
}) {
  const done = sessions.filter((s) => s.done_at).length;
  const now = Date.now();
  return (
    <section className="card stack" id="sessions">
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <h2>Sessions</h2>
        <span className={`pill ${done >= SESSIONS_PER_CLIENT ? "pill-completed" : "pill-scheduled"}`}>
          {done} of {SESSIONS_PER_CLIENT} done
        </span>
      </div>
      <div className="slots" aria-hidden="true">
        {Array.from({ length: SESSIONS_PER_CLIENT }, (_, i) => (
          <span key={i} className={i < done ? "slot used" : i < sessions.length ? "slot booked" : "slot"} />
        ))}
      </div>
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
      {error === "full" && (
        <p className="err" role="alert">This client already has {SESSIONS_PER_CLIENT} sessions booked.</p>
      )}

      <p className="small">
        Cancelled with less than {LATE_CANCEL_HOURS} hours&apos; notice? Press <b>Late cancellation</b>: it counts as
        one of the {SESSIONS_PER_CLIENT} sessions. Cancelled in time? Press <b>Remove</b>, and it doesn&apos;t count.
        Clients are emailed a reminder {LATE_CANCEL_HOURS} hours before each session.
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
                      <NotifyBox label="Email the client if I change or remove this session" />
                    </>
                  )}
                </form>
              </li>
            );
          })}
        </ol>
      )}

      {sessions.length < SESSIONS_PER_CLIENT ? (
        <form action={addSession.bind(null, requestId)} className="form add-session">
          <label htmlFor="new-session">Book session {sessions.length + 1}</label>
          <div className="actions">
            <input id="new-session" type="datetime-local" name="startsAt" />
            <button type="submit">Book session</button>
          </div>
          <NotifyBox label={`Email a confirmation to ${clientEmail}`} />
        </form>
      ) : (
        done < SESSIONS_PER_CLIENT && (
          <p className="small">All {SESSIONS_PER_CLIENT} sessions are booked. Mark each one done after it happens.</p>
        )
      )}
      {done >= SESSIONS_PER_CLIENT && (
        <p className="flash">All {SESSIONS_PER_CLIENT} sessions are done, so this case is marked Completed.</p>
      )}
    </section>
  );
}
