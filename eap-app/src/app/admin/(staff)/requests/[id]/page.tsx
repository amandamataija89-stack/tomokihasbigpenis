import Link from "next/link";
import { notFound } from "next/navigation";
import { speaks } from "@/lib/assign";
import { isManager, requireStaff } from "@/lib/auth";
import { getRequest, listNotes, listSessions, listStaffWithLoad, STATUSES, STATUS_LABELS } from "@/lib/data";
import { acceptCase, addNote, declineCase, deleteRequest, emailFeedbackLink, updateRequest } from "../../../actions";
import { contactDue } from "@/lib/deadlines";
import { formatDate } from "../../../format";
import { listMessages, markClientMessagesRead } from "@/lib/messages";
import { Messages } from "./Messages";
import { Sessions } from "./Sessions";
import { Payments } from "./Payments";
import { BillingProfile } from "./BillingProfile";
import { defaultSessionPrice, invoiceSettings, listPackages, listPayments, priceList } from "@/lib/billing";

export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    saved?: string;
    confirmDelete?: string;
    session?: string;
    feedback?: string;
    accepted?: string;
    taken?: string;
    msg?: string;
    billing?: string;
    why?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireStaff();
  const manager = isManager(me);
  const r = await getRequest(id);
  // Counsellors only ever see their own clients; anything else looks like it doesn't exist.
  if (!r || (!manager && r.assigned_to !== me.id)) notFound();
  // The client's messages count as read once whoever looks after them opens the case.
  if (r.assigned_to === me.id || (!r.assigned_to && manager)) await markClientMessagesRead(id);
  const isPrivate = r.kind === "private";
  const [notes, staff, sessions, messages, payments, packages, prices, defaultPrice] = await Promise.all([
    listNotes(id),
    manager ? listStaffWithLoad(undefined, false) : Promise.resolve([]),
    listSessions(id),
    listMessages(id),
    isPrivate ? listPayments(id) : Promise.resolve([]),
    isPrivate ? listPackages(id) : Promise.resolve([]),
    isPrivate ? priceList() : Promise.resolve([]),
    isPrivate ? defaultSessionPrice(id) : Promise.resolve(null),
  ]);
  const priceRange = prices.find((p) => p.service === r.service) ?? null;
  const settings = isPrivate ? await invoiceSettings() : null;
  const pendingForMe = r.assigned_to === me.id && !r.accepted_at && r.status === "new";
  const due = contactDue(r.created_at, r.crisis);
  const nameOf = (sid: string) => staff.find((s) => s.id === sid)?.name ?? "a former colleague";
  const label = (s: (typeof staff)[number]) => {
    if (s.id === r.assigned_to) return `${s.name} (current)`;
    const load = `${s.assignedThisMonth}/${s.capacity} EAP this month`;
    const warn = s.assignedThisMonth >= s.capacity && r.kind === "eap" ? ", full" : !speaks(s, r.language) ? `, no ${r.language}` : "";
    return `${s.name} (${load}${warn})`;
  };

  return (
    <main className="stack" style={{ gap: 20 }}>
      <p className="small"><Link href="/admin">← {manager ? "All requests" : "My clients"}</Link></p>
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 32 }}>{r.first_name}</h1>
        <span className="actions" style={{ gap: 8 }}>
          {r.kind === "private" && <span className="pill pill-private">Private</span>}
          {r.crisis && <span className="pill pill-crisis">Crisis</span>}
          <span className={`pill pill-${r.status}`}>{STATUS_LABELS[r.status]}</span>
        </span>
      </div>
      {sp.saved && <p className="flash" role="status">Saved.</p>}
      {sp.accepted && <p className="flash" role="status">Accepted. Please contact them by {formatDate(due)}.</p>}
      {sp.taken && <p className="flash" role="status">They&apos;re your client now. Please contact them by {formatDate(due)}.</p>}

      {pendingForMe && (
        <section className="offer">
          <h2>This client has been offered to you</h2>
          <p>
            Please accept or decline{r.respond_by ? ` by ${formatDate(r.respond_by)}` : ""}. If you don&apos;t
            answer by then, the client is passed to the next available counsellor. The client was promised contact
            by {formatDate(due)}.
          </p>
          <div className="actions">
            <form action={acceptCase.bind(null, r.id)}>
              <button type="submit">Accept client</button>
            </form>
          </div>
          <form action={declineCase.bind(null, r.id)} className="form" style={{ gap: 8 }}>
            <label htmlFor="reason" className="small">Can&apos;t take them? Tell the coordinator why (optional)</label>
            <textarea id="reason" name="reason" placeholder="e.g. Fully booked until November, or I know this person" />
            <div className="actions"><button type="submit" className="ghost">Decline, pass to another counsellor</button></div>
          </form>
        </section>
      )}

      {manager && r.status === "new" && (
        <p className="notice">
          {!r.assigned_to ? (
            r.kind === "private" ? (
              <><b>Private client: needs a counsellor.</b> Choose one under Follow-up below. Private clients aren&apos;t offered automatically.</>
            ) : (
              <><b>In the pool: nobody available.</b> Assign a counsellor below. It will also be offered automatically as soon as someone is available.</>
            )
          ) : r.accepted_at ? (
            <><b>Accepted</b> by {r.assigned_name} on {formatDate(r.accepted_at)}.</>
          ) : (
            <>
              <b>Offered to {r.assigned_name}</b>, waiting for them to accept
              {r.respond_by ? ` by ${formatDate(r.respond_by)}` : ""}.
            </>
          )}
          {r.declined_by.length > 0 && <> Declined or not answered by: {r.declined_by.map(nameOf).join(", ")}.</>}
        </p>
      )}

      <div className="detail">
        <div className="stack" style={{ gap: 20 }}>
          <section className="card stack">
            <h2>Request</h2>
            <dl className="facts">
              {r.service && (
                <>
                  <dt>Support needed</dt><dd><b>{r.service}</b></dd>
                </>
              )}
              <dt>Urgent?</dt><dd>{r.crisis ? <b className="overdue">Yes, crisis</b> : "No"}</dd>
              <dt>Nickname</dt><dd>{r.first_name}</dd>
              <dt>Full name</dt><dd>{r.full_name || <span className="small">Not given</span>}</dd>
              {r.address && (
                <>
                  <dt>Residential address</dt><dd style={{ whiteSpace: "pre-line" }}>{r.address}</dd>
                </>
              )}
              <dt>Client of</dt>
              <dd>{r.company_name ? `EAP · ${r.company_name}` : <span className="pill pill-private">Private client</span>}</dd>
              <dt>Age</dt><dd>{r.age_range || "—"}</dd>
              <dt>Gender</dt><dd>{r.gender || "—"}</dd>
              <dt>Based in</dt><dd>{r.location || "—"}</dd>
              <dt>Email</dt><dd className="mono">{r.email}</dd>
              <dt>Phone</dt><dd className="mono">{r.phone || "—"}</dd>
              <dt>Contact by</dt><dd>{r.contact_method}</dd>
              <dt>Language</dt><dd>{r.language}</dd>
              <dt>Online / in person</dt><dd>{r.format}</dd>
              <dt>Support with</dt><dd>{r.topics.length ? r.topics.join(", ") : "Not said"}</dd>
              <dt>Received</dt><dd>{formatDate(r.created_at)}</dd>
              {r.status === "new" && (
                <>
                  <dt>Promised contact by</dt>
                  <dd className={due.getTime() < Date.now() ? "overdue" : undefined}>{formatDate(due)}</dd>
                </>
              )}
              <dt>Consent to contact</dt><dd>{r.consent_contact_at ? `Given ${formatDate(r.consent_contact_at)}` : "Not recorded"}</dd>
              <dt>Consent to store and share</dt><dd>Given {formatDate(r.consent_at)}</dd>
            </dl>
            {r.message && (
              <>
                <h3 style={{ fontSize: 16 }}>Their message</h3>
                <p className="message">{r.message}</p>
              </>
            )}
          </section>
          <Messages requestId={r.id} nickname={r.first_name} messages={messages} flash={sp.msg} />
          <Sessions
            requestId={r.id}
            kind={r.kind}
            sessions={sessions}
            clientEmail={r.email}
            defaultPrice={defaultPrice}
            error={sp.session}
          />
          {isPrivate && (
            <Payments
              requestId={r.id}
              sessions={sessions}
              payments={payments}
              packages={packages}
              flash={sp.billing}
              why={sp.why}
            />
          )}
        </div>

        <div className="stack" style={{ gap: 20 }}>
          <form action={updateRequest.bind(null, r.id)} className="card form">
            <h2>Follow-up</h2>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={r.status}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            {manager && (
              <div className="field">
                <label htmlFor="assignedTo">Counsellor</label>
                <select id="assignedTo" name="assignedTo" defaultValue={r.assigned_to ?? ""}>
                  <option value="">
                    {r.kind === "private" ? "Nobody yet" : "Nobody: offer to the next available counsellor"}
                  </option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{label(s)}</option>)}
                </select>
                <label className="consent small-consent">
                  <input type="checkbox" name="agreed" value="yes" />
                  <span>Already agreed with them (no need to accept)</span>
                </label>
                <span className="small">
                  Otherwise they&apos;re emailed and have 24 working hours (30 minutes for a crisis) to accept, before it passes
                  to the next available counsellor.
                </span>
              </div>
            )}
            <label className="consent">
              <input type="checkbox" name="crisis" value="yes" defaultChecked={r.crisis} />
              <span>Crisis case (needs contact as soon as possible)</span>
            </label>
            <div className="actions"><button type="submit">Save</button></div>
          </form>

          {isPrivate && settings && (
            <BillingProfile r={r} range={priceRange} vatPayer={settings.vatPayer} vatRate={settings.vatRate} manager={manager} flash={sp.billing} />
          )}

          <section className="card stack">
            <h2>Notes</h2>
            <form action={addNote.bind(null, r.id)} className="form" style={{ gap: 10 }}>
              <label htmlFor="body" className="small">Visible to staff only</label>
              <textarea id="body" name="body" placeholder="e.g. Called, left voicemail. Will try again tomorrow morning." />
              <div className="actions"><button type="submit" className="ghost">Add note</button></div>
            </form>
            {notes.map((n) => (
              <div className="note" key={n.id}>
                <span className="meta">{n.staff_name ?? "Automatic"} · {formatDate(n.created_at)}</span>
                <span className="body">{n.body}</span>
              </div>
            ))}
          </section>

          <form action={emailFeedbackLink.bind(null, r.id)} className="card form" style={{ gap: 12 }}>
            <h2 style={{ fontSize: 18 }}>Anonymous feedback</h2>
            <p className="small">
              Clients are emailed a one-use feedback link automatically when all sessions are done. Send it now if the
              case ended early. Answers are anonymous and only admins can read them.
            </p>
            {sp.feedback && <p className="flash" role="status">Feedback link emailed to {r.email}.</p>}
            <div className="actions"><button type="submit" className="ghost">Email feedback link</button></div>
          </form>

          {manager && (
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
          )}
        </div>
      </div>
    </main>
  );
}
