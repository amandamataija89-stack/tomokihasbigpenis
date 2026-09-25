import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand, CrisisNotice, SiteFooter } from "@/components/Brand";
import { normalizeCompanyCode } from "@/lib/codes";
import { findCompanyByCode } from "@/lib/data";
import { RequestForm } from "./RequestForm";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizeCompanyCode(decodeURIComponent(raw));
  if (!code) redirect("/?error=format");
  if (code !== raw) redirect(`/join/${code}`);
  const company = await findCompanyByCode(code);
  if (!company || !company.active) redirect("/?error=unknown");

  return (
    <main className="wrap">
      <Brand />
      <section className="stack">
        <p className="small">
          Employee Assistance Programme for <b>{company.name}</b> · <Link href="/">Not your company?</Link>
        </p>
        <h1>Ask for support</h1>
        <p className="lede">
          Tell us a little about yourself and how you&apos;d like to be contacted. Someone from our team will get
          back to you within 24 working hours (Monday to Friday) to arrange a first conversation.
        </p>
      </section>
      <p className="reassure">
        What you write here is read only by the Prague Integration team. {company.name} is not told who asks for
        support or why.
      </p>
      <RequestForm code={company.code} />
      <CrisisNotice />
      <SiteFooter />
    </main>
  );
}
