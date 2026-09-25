import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";

type Row = {
  id: string;
  submitted_month: Date;
  overall: number;
  counsellor_rating: number | null;
  helped: string;
  recommend: string;
  comments: string;
  counsellor: string | null;
};

const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const avg = (ns: number[]) => (ns.length ? (ns.reduce((a, b) => a + b, 0) / ns.length).toFixed(1) : "—");
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");

export default async function FeedbackPage() {
  // Checked here as well as hidden from the menu: counsellors must never see this page.
  await requireAdmin();
  const { rows } = await pool.query<Row>(
    `SELECT f.id, f.submitted_month, f.overall, f.counsellor_rating, f.helped, f.recommend, f.comments, s.name AS counsellor
     FROM feedback f LEFT JOIN staff s ON s.id = f.counsellor_id
     ORDER BY f.submitted_month DESC, f.id`,
  );

  const byCounsellor = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.counsellor ?? "Not assigned / former staff";
    byCounsellor.set(k, [...(byCounsellor.get(k) ?? []), r]);
  }
  const helpedALot = rows.filter((r) => r.helped === "Yes, a lot").length;
  const recommends = rows.filter((r) => r.recommend === "Yes").length;

  return (
    <main className="stack" style={{ gap: 20 }}>
      <div className="stack">
        <h1 style={{ fontSize: 32 }}>Client feedback</h1>
        <p className="lede">
          Anonymous answers from clients, sent with a one-use link when their case is completed. Only admins can see
          this page; counsellors can&apos;t. Responses carry the counsellor and month, never the client or case.
        </p>
      </div>

      <section className="stats">
        <div className="card stat"><span className="big-num">{rows.length}</span><span className="small">responses</span></div>
        <div className="card stat"><span className="big-num">{avg(rows.map((r) => r.overall))}</span><span className="small">overall, out of 5</span></div>
        <div className="card stat"><span className="big-num">{pct(helpedALot, rows.length)}</span><span className="small">say the sessions helped a lot</span></div>
        <div className="card stat"><span className="big-num">{pct(recommends, rows.length)}</span><span className="small">would recommend us</span></div>
      </section>

      {rows.length === 0 ? (
        <p className="card empty">No feedback yet. Clients are sent a link when all their sessions are done.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Counsellor</th>
                  <th className="num">Responses</th>
                  <th className="num">Overall</th>
                  <th className="num">Counsellor rating</th>
                  <th className="num">Helped a lot</th>
                  <th className="num">Would recommend</th>
                </tr>
              </thead>
              <tbody>
                {[...byCounsellor].map(([name, rs]) => (
                  <tr key={name}>
                    <td><b>{name}</b></td>
                    <td className="num">{rs.length}</td>
                    <td className="num">{avg(rs.map((r) => r.overall))}</td>
                    <td className="num">{avg(rs.flatMap((r) => (r.counsellor_rating ? [r.counsellor_rating] : [])))}</td>
                    <td className="num">{pct(rs.filter((r) => r.helped === "Yes, a lot").length, rs.length)}</td>
                    <td className="num">{pct(rs.filter((r) => r.recommend === "Yes").length, rs.length)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="stack">
            <h2>All responses</h2>
            {rows.map((r) => (
              <article key={r.id} className="card feedback-item">
                <div className="meta small">
                  {monthFmt.format(r.submitted_month)} · {r.counsellor ?? "Not assigned / former staff"}
                </div>
                <div className="actions" style={{ gap: 8 }}>
                  <span className="pill pill-scheduled">Overall {r.overall}/5</span>
                  {r.counsellor_rating && <span className="pill pill-scheduled">Counsellor {r.counsellor_rating}/5</span>}
                  <span className="pill pill-closed">Helped: {r.helped}</span>
                  <span className="pill pill-closed">Recommend: {r.recommend}</span>
                </div>
                {r.comments && <p className="message">{r.comments}</p>}
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
