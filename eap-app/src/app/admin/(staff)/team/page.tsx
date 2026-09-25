import { therapistLoads } from "@/lib/assign";
import { requireManager, ROLE_LABELS, ROLES, type Role } from "@/lib/auth";
import { pool } from "@/lib/db";
import { resendInvite, updateStaff } from "../../actions";
import { AvailabilityFields } from "../AvailabilityFields";
import { AddStaffForm } from "./AddStaffForm";

const monthName = () => new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "Europe/Prague" }).format(new Date());

type Member = { id: string; role: Role; takes_clients: boolean; away_until: string | null; invited: boolean };

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; invited?: string; welcome?: string; noemail?: string; emailerror?: string }>;
}) {
  const me = await requireManager();
  const sp = await searchParams;
  const [loads, { rows: members }] = await Promise.all([
    therapistLoads(pool, false),
    pool.query<Member>(
      `SELECT id, role, takes_clients, to_char(away_until, 'YYYY-MM-DD') AS away_until, password_hash = '!' AS invited
       FROM staff`,
    ),
  ]);
  const info = new Map(members.map((m) => [m.id, m]));
  const today = new Date().toISOString().slice(0, 10);
  const available = (id: string) => {
    const m = info.get(id)!;
    return m.takes_clients && !m.invited && !(m.away_until && m.away_until >= today);
  };
  const active = loads.filter((t) => available(t.id));
  const places = active.reduce((a, t) => a + t.capacity, 0);
  const used = active.reduce((a, t) => a + Math.min(t.assignedThisMonth, t.capacity), 0);

  return (
    <main className="stack" style={{ gap: 20 }}>
      <div className="stack">
        <h1 style={{ fontSize: 32 }}>Team</h1>
        <p className="lede">
          New clients are offered to the available counsellor with the fewest new clients this month who works in the
          client&apos;s language. They have 4 office hours to accept (30 minutes for a crisis). A decline, or no
          answer, passes the client straight to the next available counsellor. The coordinator is only emailed if
          nobody is available.
        </p>
      </div>
      {sp.welcome && (
        <p className="flash" role="status">
          Welcome! You&apos;re signed in as admin. Next: invite your coordinator and counsellors below, then add your
          first client company under Companies.
        </p>
      )}
      {sp.saved && <p className="flash" role="status">Saved.</p>}
      {sp.invited && <p className="flash" role="status">Invitation emailed.</p>}
      {sp.emailerror && (
        <p className="err" role="alert">
          No invitation was sent. {sp.emailerror.slice(0, 400)}
        </p>
      )}
      {sp.noemail && (
        <p className="err" role="alert">
          No invitation was sent: email isn&apos;t connected yet. Add RESEND_API_KEY in Vercel&apos;s environment
          variables and redeploy, then press &quot;Resend invitation&quot; again.
        </p>
      )}

      <section className="card load-summary">
        <div>
          <span className="big-num">{used}</span>
          <span className="of">/ {places}</span>
        </div>
        <p>
          new-client places used in {monthName()} across {active.length} available{" "}
          {active.length === 1 ? "counsellor" : "counsellors"}.
        </p>
        <div className="meter" aria-hidden="true"><span style={{ width: `${places ? (used / places) * 100 : 0}%` }} /></div>
      </section>

      <AddStaffForm canAddAdmin={me.role === "admin"} />

      <div className="therapists">
        {loads.map((t) => {
          const m = info.get(t.id)!;
          const full = t.assignedThisMonth >= t.capacity;
          return (
            <div key={t.id} className="card therapist">
              <div className="therapist-head">
                <div>
                  <h2>{t.name}</h2>
                  <span className="small">{t.email}</span>
                </div>
                <span className={`pill ${!available(t.id) ? "pill-closed" : full ? "pill-new" : "pill-scheduled"}`}>
                  {!available(t.id)
                    ? m.invited
                      ? "Not signed up yet"
                      : m.away_until && m.away_until >= today ? `Away until ${m.away_until}` : "Not taking clients"
                    : `${t.assignedThisMonth} / ${t.capacity}${full ? " · full" : ""}`}
                </span>
              </div>
              {m.invited && (
                <form action={resendInvite.bind(null, t.id)} className="actions invite-pending">
                  <span className="small">Hasn&apos;t set a password yet.</span>
                  <button type="submit" className="ghost small-btn">Resend invitation</button>
                </form>
              )}
              <form action={updateStaff.bind(null, t.id)} className="stack" style={{ gap: 12 }}>
                <div className="actions">
                  <label htmlFor={`role-${t.id}`} className="small">Role</label>
                  <select id={`role-${t.id}`} name="role" defaultValue={m.role} disabled={me.role !== "admin"} className="role-select">
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </div>
                <AvailabilityFields
                  idPrefix={t.id}
                  languages={t.languages}
                  capacity={t.capacity}
                  maxCapacity={100}
                  takesClients={m.takes_clients}
                  awayUntil={m.away_until ?? ""}
                />
                <div className="actions"><button type="submit" className="ghost small-btn">Save</button></div>
              </form>
            </div>
          );
        })}
      </div>
    </main>
  );
}
