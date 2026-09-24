import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequest, listNotes, listStaff, STATUSES, STATUS_LABELS } from "@/lib/data";
import { addNote, deleteRequest, updateRequest } from "../../../actions";
import { formatDate } from "../../../format";

export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; confirmDelete?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const r = await getRequest(id);
  if (!r) notFound();
  const [notes, staff] = await Promise.all([listNotes(id), listStaff()]);

  return (
    <main className="stack" style={{ gap: 20 }}>
      <p className="small"><Link href="/admin">← All requests</Link></p>
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 32 }}>{r.first_name}</h1>
        <span className={`pill pill-${r.status}`}>{STATUS_LABELS[r.status]}</span>
      </div>
      {sp.saved && <p className="flash" role="status">Saved.</p>}

      <div className="detail">
        <section className="card stack">
          <h2>Request</h2>
          <dl className="facts">
            <dt>Company</dt><dd>{r.company_name}</dd>
            <dt>Email</dt><dd className="mono">{r.email}</dd>
            <dt>Phone</dt><dd className="mono">{r.phone || "—"}</dd>
            <dt>Contact by</dt><dd>{r.contact_method}</dd>
            <dt>Language</dt><dd>{r.language}</dd>
            <dt>Meeting</dt><dd>{r.format}</dd>
            <dt>Support with</dt><dd>{r.topics.length ? r.topics.join(", ") : "Not said"}</dd>
            <dt>Received</dt><dd>{formatDate(r.created_at)}</dd>
            <dt>Consent</dt><dd>Given {formatDate(r.consent_at)}</dd>
          </dl>
          {r.message && (
            <>
              <h3 style={{ fontSize: 16 }}>Their message</h3>
              <p className="message">{r.message}</p>
            </>
          )}
        </section>

        <div className="stack" style={{ gap: 20 }}>
          <form action={updateRequest.bind(null, r.id)} className="card form">
            <h2>Follow-up</h2>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={r.status}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="assignedTo">Assigned to</label>
              <select id="assignedTo" name="assignedTo" defaultValue={r.assigned_to ?? ""}>
                <option value="">Unassigned</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="actions"><button type="submit">Save</button></div>
          </form>

          <section className="card stack">
            <h2>Notes</h2>
            <form action={addNote.bind(null, r.id)} className="form" style={{ gap: 10 }}>
              <label htmlFor="body" className="small">Visible to staff only</label>
              <textarea id="body" name="body" placeholder="e.g. Called, left voicemail. Will try again tomorrow morning." />
              <div className="actions"><button type="submit" className="ghost">Add note</button></div>
            </form>
            {notes.map((n) => (
              <div className="note" key={n.id}>
                <span className="meta">{n.staff_name ?? "Former staff"} · {formatDate(n.created_at)}</span>
                <span className="body">{n.body}</span>
              </div>
            ))}
          </section>

          <form action={deleteRequest.bind(null, r.id)} className="card form" style={{ gap: 12 }}>
            <h2 style={{ fontSize: 18 }}>Delete request</h2>
            <p className="small">
              Use this when the person asks for their data to be erased, or when it&apos;s no longer needed. This
              removes the request and all notes permanently.
            </p>
            {sp.confirmDelete && <p className="err">Tick the box to confirm.</p>}
            <label className="consent">
              <input type="checkbox" name="confirm" value="yes" />
              <span>Delete {r.first_name}&apos;s request permanently</span>
            </label>
            <div className="actions"><button type="submit" className="danger">Delete</button></div>
          </form>
        </div>
      </div>
    </main>
  );
}
