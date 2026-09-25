"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function StaffNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const section = ["companies", "team", "feedback"].find((s) => path.startsWith(`/admin/${s}`)) ?? "requests";
  const current = (s: string) => (section === s ? ("page" as const) : undefined);
  return (
    <nav aria-label="Staff">
      <Link href="/admin" aria-current={current("requests")}>Requests</Link>
      <Link href="/admin/team" aria-current={current("team")}>Team</Link>
      <Link href="/admin/companies" aria-current={current("companies")}>Companies</Link>
      {isAdmin && <Link href="/admin/feedback" aria-current={current("feedback")}>Feedback</Link>}
    </nav>
  );
}
