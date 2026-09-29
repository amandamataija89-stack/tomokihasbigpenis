import Link from "next/link";
import { notFound } from "next/navigation";
import { isManager, requireStaff } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getGroup, GROUP_KINDS, groupMembers, groupSessions } from "@/lib/groups";
import {
  addGroupSessionAction,
  addMemberAction,
  deleteGroupAction,
  removeGroupSessionAction,
  removeMemberAction,
  saveAttendanceAction,
  setConsentAction,
  updateGroupAction,
} from "../../../group-actions";
import { formatDate } from "../../../format";

const FLASH: Record<string, string> = {
  created: "Group created. Add its members and sessions below.",
  saved: "Saved.",
  added: "Member added.",
  removed: "Member removed.",
  consent: "Consent form updated.",
  session: "Session added. Tick who attended once it has happened.",
  sessionremoved: "Session removed.",
  attendance: "Attendance saved.",
};
const ERRORS: Record<string, string> = {
  member: "Enter the member's name, surname and a valid email.",
  date: "Choose the session's date and time.",
  confirm: "Tick the box to confirm.",
  error: "That didn't work. Please try again.",
};

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { groupId } = await params;
  const sp = await searchParams;
  const me = await requireStaff();
  const manager = isManager(me);
  const g = await getGroup(groupId, me);
  if (!g) notFound();
  const [members, sessions, { rows: counsellors }] = await Promise.all([
    groupMembers(g.id),
    groupSessions(g.id),
    manager ? pool.query<{ id: string; name: string }>("SELECT id, name FROM staff WHERE password_hash <> '!' ORDER BY name") : { rows: [] },
  ]);
  const unsigned = members.filter((m) => !m.consent_signed_on).length;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
  return (
    <main className="stack" style={{ gap: 20 }}>
      <p className="small"><Link href="/admin/groups">← Groups</Link></p>
      <div className="stack">
        <h1 style={{ fontSize: 32 }}>{g.name}</h1>
        <p className="lede">
          {g.kind} · led by {g.counsellor ?? "nobody yet"}{g.details ? ` · ${g.details}` : ""}
          {!g.active && " · finished"}
        </p>
      </div>
      {sp.done && FLASH[sp.done] && <p className="flash" role="status">{FLASH[sp.done]}</p>}
      {sp.done && ERRORS[sp.done] && <p className="err" role="alert">{ERRORS[sp.done]}</p>}

      <section className="card stack" id="members">
        <h2>Members ({members.length})</h2>
        {unsigned > 0 && (
          <p className="notice small">
            <b>{unsigned} {unsigned === 1 ? "member hasn't" : "members haven't"} signed the consent form yet.</b> They
            should sign it before taking part.
          </p>
        )}
        {members.length === 0 ? (
          <p className="small">No members yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Surname</th><th>Email</th><th>Consent form signed</th><th>Attended</th><th /></tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>{m.first_name}</td>
                    <td>{m.surname}</td>
                    <td className="mono">{m.email}</td>
                    <td>
                      <form action={setConsentAction.bind(null, g.id, m.id)} className="actions" style={{ gap: 6 }}>
                        <label className="consent small-consent">
                          <input type="checkbox" name="signed" value="yes" defaultChecked={!!m.consent_signed_on} />
                          <span>Signed</span>
                        </label>
                        <input type="date" name="consentSignedOn" defaultValue={m.consent_signed_on ?? today} className="date-input" aria-label="Signed on" />
                        <button type="submit" className="ghost small-btn">Save</button>
                      </form>
                    </td>
                    <td>{m.attended} of {sessions.length}</td>
                    <td>
                      <form action={removeMemberAction.bind(null, g.id, m.id)}>
                        <button type="submit" className="ghost small-btn">Remove</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form action={addMemberAction.bind(null, g.id)} className="stack" style={{ gap: 10 }}>
          <h3 style={{ fontSize: 16 }}>Add a member</h3>
          <div className="pay-fields">
            <label><span className="small">Name</span><input name="firstName" type="text" /></label>
            <label><span className="small">Surname</span><input name="surname" type="text" /></label>
            <label><span className="small">Email</span><input name="email" type="email" /></label>
            <label><span className="small">Consent form signed on (if signed)</span><input name="consentSignedOn" type="date" className="date-input" /></label>
          </div>
          <div className="actions"><button type="submit" className="small-btn">Add member</button></div>
        </form>
      </section>

      <section className="card stack" id="attendance">
        <h2>Sessions and attendance</h2>
        {sessions.length === 0 ? (
          <p className="small">No sessions yet. Add the first one below.</p>
        ) : members.length === 0 ? (
          <p className="small">Add members to record attendance.</p>
        ) : (
          <div className="table-wrap">
            <table className="attendance">
              <thead>
                <tr>
                  <th>Member</th>
                  {sessions.map((s) => (
                    <th key={s.id}>
                      {formatDate(s.starts_at)}
                      <form id={`att-${s.id}`} action={saveAttendanceAction.bind(null, g.id, s.id)} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>{m.first_name} {m.surname}</td>
                    {sessions.map((s) => (
                      <td key={s.id} className="att-cell">
                        <input
                          type="checkbox"
                          name="present"
                          value={m.id}
                          form={`att-${s.id}`}
                          defaultChecked={s.present.includes(m.id)}
                          aria-label={`${m.first_name} ${m.surname} attended on ${formatDate(s.starts_at)}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="small">Present</td>
                  {sessions.map((s) => (
                    <td key={s.id} className="att-cell">
                      <b>{s.present.length}</b>/{members.length}
                      <button type="submit" form={`att-${s.id}`} className="ghost small-btn">Save</button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <form action={addGroupSessionAction.bind(null, g.id)} className="actions" style={{ gap: 8 }}>
          <label htmlFor="startsAt" className="small">New session</label>
          <input id="startsAt" name="startsAt" type="datetime-local" />
          <button type="submit" className="small-btn">Add session</button>
        </form>
        {sessions.length > 0 && (
          <details className="small">
            <summary>Remove a session</summary>
            <ul>
              {sessions.map((s) => (
                <li key={s.id}>
                  <form action={removeGroupSessionAction.bind(null, g.id, s.id)} className="actions" style={{ gap: 8 }}>
                    {formatDate(s.starts_at)}
                    <button type="submit" className="ghost small-btn">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <form action={updateGroupAction.bind(null, g.id)} className="card form" style={{ maxWidth: 640 }}>
        <h2>Group details</h2>
        <div className="field">
          <label htmlFor="kind">Type of group</label>
          <select id="kind" name="kind" defaultValue={g.kind}>
            {GROUP_KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="name">Name</label><input id="name" name="name" type="text" defaultValue={g.name} /></div>
        <div className="field">
          <label htmlFor="details">When and where<span className="opt">optional</span></label>
          <input id="details" name="details" type="text" defaultValue={g.details} />
        </div>
        {manager && (
          <div className="field">
            <label htmlFor="counsellor">Led by</label>
            <select id="counsellor" name="counsellor" defaultValue={g.counsellor_id ?? ""}>
              <option value="">Nobody yet</option>
              {counsellors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <label className="consent">
          <input type="checkbox" name="active" value="yes" defaultChecked={g.active} />
          <span>Group is running (untick when it has finished)</span>
        </label>
        <div className="actions"><button type="submit">Save</button></div>
      </form>

      {manager && (
        <form action={deleteGroupAction.bind(null, g.id)} className="card form" id="delete" style={{ gap: 12, maxWidth: 640 }}>
          <h2 style={{ fontSize: 18 }}>Delete group</h2>
          <p className="small">Removes the group, its members, sessions and attendance permanently.</p>
          <label className="consent">
            <input type="checkbox" name="confirm" value="yes" />
            <span>Delete {g.name} permanently</span>
          </label>
          <div className="actions"><button type="submit" className="danger">Delete</button></div>
        </form>
      )}
    </main>
  );
}
