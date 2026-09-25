import { redirect } from "next/navigation";
import { Brand, CrisisNotice, SiteFooter } from "@/components/Brand";
import { normalizeCompanyCode } from "@/lib/codes";

async function goToCompany(formData: FormData) {
  "use server";
  const raw = formData.get("code");
  const code = typeof raw === "string" ? normalizeCompanyCode(raw) : null;
  redirect(code ? `/join/${code}` : "/?error=format");
}

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="wrap">
      <Brand />
      <section className="stack">
        <h1>Talk to someone, confidentially</h1>
        <p className="lede">
          Your employer gives you access to confidential support from Prague Integration&apos;s psychologists,
          counsellors and coaches, in English, Czech, Russian, Spanish and more.
        </p>
      </section>

      <form action={goToCompany} className="card form" noValidate>
        <div className="field">
          <label htmlFor="code">Your company code</label>
          <p className="small">You&apos;ll find it in the programme information from your HR team. It looks like ABCD-EFGH.</p>
          <input
            id="code"
            name="code"
            type="text"
            className="code-input"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ABCD-EFGH"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "code-err" : undefined}
          />
          {error && (
            <span id="code-err" className="err">
              {error === "unknown"
                ? "We couldn't find that code, or it's no longer active. Check it with your HR team, or contact us on +420 608 573 256 or contact@pragueintegration.cz and we'll help you."
                : "Company codes have 8 letters and numbers, like ABCD-EFGH."}
            </span>
          )}
        </div>
        <div className="actions">
          <button type="submit">Continue</button>
        </div>
      </form>

      <p className="reassure">
        Your employer is never told who uses the programme or what you talk about.
      </p>
      <CrisisNotice />
      <SiteFooter />
    </main>
  );
}
