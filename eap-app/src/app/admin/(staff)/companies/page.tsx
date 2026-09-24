import { headers } from "next/headers";
import { listCompanies } from "@/lib/data";
import { setCompanyActive } from "../../actions";
import { NewCompanyForm } from "./NewCompanyForm";

export default async function CompaniesPage() {
  const companies = await listCompanies();
  const h = await headers();
  const base = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  return (
    <main className="stack" style={{ gap: 20 }}>
      <div className="stack">
        <h1 style={{ fontSize: 32 }}>Companies</h1>
        <p className="lede">
          Each client company gets its own code and registration link to share with employees. The request counts
          here are the only figures to report back to a company; never share names.
        </p>
      </div>

      <NewCompanyForm />

      <div className="table-wrap">
        {companies.length === 0 ? (
          <p className="empty">No companies yet. Add your first client above.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Code</th>
                <th>Registration link</th>
                <th className="num">Last 30 days</th>
                <th className="num">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.name}</b>
                    {!c.active && <> <span className="pill pill-inactive">Paused</span></>}
                    {c.hr_contact && <div className="small">{c.hr_contact}</div>}
                  </td>
                  <td className="mono">{c.code}</td>
                  <td className="mono" style={{ userSelect: "all" }}>{`${base}/join/${c.code}`}</td>
                  <td className="num">{c.last_30_days}</td>
                  <td className="num">{c.total}</td>
                  <td>
                    <form action={setCompanyActive.bind(null, c.id, !c.active)}>
                      <button type="submit" className="ghost small-btn">{c.active ? "Pause" : "Reactivate"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
