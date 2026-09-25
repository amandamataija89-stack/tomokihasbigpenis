import { therapistLoads } from "@/lib/assign";
import { requireStaff } from "@/lib/auth";
import { pool } from "@/lib/db";
import { updateMyAvailability } from "../../actions";
import { AvailabilityFields } from "../AvailabilityFields";

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const [loads, { rows }] = await Promise.all([
    therapistLoads(pool, false),
    pool.query<{ takes_clients: boolean; away_until: string | null }>(
      "SELECT takes_clients, to_char(away_until, 'YYYY-MM-DD') AS away_until FROM staff WHERE id = $1",
      [me.id],
    ),
  ]);
  const mine = loads.find((t) => t.id === me.id)!;
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
      {sp.saved && <p className="flash" role="status">Saved. New clients will be offered to you accordingly.</p>}
      <form action={updateMyAvailability} className="card form">
        <AvailabilityFields
          idPrefix="me"
          languages={mine.languages}
          capacity={mine.capacity}
          maxCapacity={Math.max(5, mine.capacity)}
          takesClients={rows[0].takes_clients}
          awayUntil={rows[0].away_until ?? ""}
        />
        <p className="small">To take more than 5 new clients a month, ask your coordinator.</p>
        <div className="actions"><button type="submit">Save</button></div>
      </form>
    </main>
  );
}
