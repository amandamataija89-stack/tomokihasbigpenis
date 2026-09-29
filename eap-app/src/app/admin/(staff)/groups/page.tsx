import Link from "next/link";
import { isManager, requireStaff } from "@/lib/auth";
import { pool } from "@/lib/db";
import { GROUP_KINDS, listGroups } from "@/lib/groups";
import { createGroupAction } from "../../group-actions";
import { formatDate } from "../../format";

// Group support: ADHD, anxiety and depression, and general support groups.
export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string }> }) {
  const me = await requireStaff();
  const manager = isManager(me);
  const sp = await searchParams;
  const [groups, { rows: counsellors }] = await Promise.all([
    listGroups(me),
    manager ? pool.query<{ id: string; name: string }>("SELECT id, name FROM staff WHERE password_hash <> '!' ORDER BY name") : { rows: [] },
  ]);
  return (
    <main className="stack" style={{ gap: 20 }}>
      <div className="stack">
        <h1 style={{ fontSize: 32 }}>Groups</h1>
        <p className="lede">
          {manager ? "Every support group" : "The groups you lead"}: members, signed consent forms and attendance.
        </p>
      </div>
      {sp.deleted && <p className="flash" role="status">Group deleted.</p>}

      {GROUP_KINDS.map((kind) => {
        const list = groups.filter((g) => g.kind === kind);
        return (
          <section className="stack" key={kind} style={{ gap: 10 }}>
            <h2 style={{ fontSize: 20 }}>{kind}</h2>
            {list.length === 0 ? (
              <p className="small">No groups yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Group</th><th>Led by</th><th>Members</th><th>Sessions</th><th>Next session</th><th>When / where</th></tr>
                  </thead>
                  <tbody>
                    {list.map((g) => (
                      <tr key={g.id}>
                        <td>
                          <Link href={`/admin/groups/${g.id}`}><b>{g.name}</b></Link>
                          {!g.active && <span className="pill pill-closed" style={{ marginLeft: 6 }}>Finished</span>}
                        </td>
                        <td>{g.counsellor ?? <span className="small">—</span>}</td>
                        <td>{g.members}</td>
                        <td>{g.sessions}</td>
                        <td>{g.next_session ? formatDate(g.next_session) : <span className="small">—</span>}</td>
                        <td className="small">{g.details || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      <form action={createGroupAction} className="card form" style={{ maxWidth: 640 }}>
        <h2>New group</h2>
        {sp.error && <p className="err" role="alert">Give the group a name and choose its type.</p>}
        <div className="field">
          <label htmlFor="kind">Type of group</label>
          <select id="kind" name="kind" defaultValue="">
            <option value="" disabled>Choose one</option>
            {GROUP_KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" placeholder="e.g. ADHD group – autumn 2026" />
        </div>
        <div className="field">
          <label htmlFor="details">When and where<span className="opt">optional</span></label>
          <input id="details" name="details" type="text" placeholder="e.g. Tuesdays 18:00, Mezibranská 4" />
        </div>
        {manager && (
          <div className="field">
            <label htmlFor="counsellor">Led by</label>
            <select id="counsellor" name="counsellor" defaultValue="">
              <option value="">Nobody yet</option>
              {counsellors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div className="actions"><button type="submit">Create group</button></div>
      </form>
    </main>
  );
}
