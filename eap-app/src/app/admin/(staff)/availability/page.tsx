import { therapistLoads } from "@/lib/assign";
import { requireStaff } from "@/lib/auth";
import { pool } from "@/lib/db";
import { setTakingClientsAction, updateMyAvailability } from "../../actions";
import { AvailabilityFields } from "../AvailabilityFields";

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const [loads, { rows }] = await Promise.all([
    therapistLoads(pool, false),
    pool.query<{ takes_clients: boolean; away_until: string | null; availability_note: string }>(
      "SELECT takes_clients, to_char(away_until, 'YYYY-MM-DD') AS away_until, availability_note FROM staff WHERE id = $1",
      [me.id],
    ),
  ]);
  const mine = loads.find((t) => t.id === me.id)!;
  const taking = rows[0].takes_clients;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
  const away = rows[0].away_until && rows[0].away_until >= today ? rows[0].away_until : null;
  return (
    <main className="stack" style={{ gap: 20, maxWidth: 640 }}>
      <div className="stack">
        <h1 style={{ fontSize: 32 }}>My availability</h1>
        <p className="lede">
          New clients are only offered to you while you&apos;re taking clients, not away, and under your monthly
          number. You&apos;ve had <b>{mine.assignedThisMonth}</b> new {mine.assignedThisMonth === 1 ? "client" : "clients"} this
          month.
        </p>
      </div>
      {sp.saved === "paused" && <p className="flash" role="status">Paused. You won&apos;t be offered new clients until you start again.</p>}
      {sp.saved === "on" && <p className="flash" role="status">You&apos;re taking new clients again.</p>}
      {sp.saved === "1" && <p className="flash" role="status">Saved. New clients will be offered to you accordingly.</p>}

      <section className={`card stack taking-status ${taking && !away ? "on" : "off"}`}>
        {taking ? (
          <>
            <p>
              <b>{away ? `You're away until ${away}.` : "You're taking new clients."}</b> Your current clients aren&apos;t affected
              either way.
            </p>
            <form action={setTakingClientsAction.bind(null, false)}>
              <button type="submit" className="danger">Temporarily not accepting new clients</button>
            </form>
          </>
        ) : (
          <>
            <p>
              <b>You&apos;re not accepting new clients.</b> You keep working with your current clients; no new ones are
              offered to you or assigned to you.
            </p>
            <form action={setTakingClientsAction.bind(null, true)}>
              <button type="submit">Start taking new clients again</button>
            </form>
          </>
        )}
      </section>

      <form action={updateMyAvailability} className="card form">
        <div className="field">
          <label htmlFor="availabilityNote">When I&apos;m available for sessions<span className="opt">optional</span></label>
          <textarea
            id="availabilityNote"
            name="availabilityNote"
            rows={3}
            defaultValue={rows[0].availability_note}
            placeholder="e.g. Mon–Wed 9:00–17:00, Thu evenings online"
          />
          <span className="small">Shown to the coordinator and admins when they assign clients.</span>
        </div>
        <AvailabilityFields
          idPrefix="me"
          languages={mine.languages}
          capacity={mine.capacity}
          maxCapacity={Math.max(5, mine.capacity)}
          takesClients={taking}
          awayUntil={rows[0].away_until ?? ""}
          accepts={mine.accepts}
        />
        <p className="small">To take more than 5 new clients a month, ask your coordinator.</p>
        <div className="actions"><button type="submit">Save</button></div>
      </form>
    </main>
  );
}
