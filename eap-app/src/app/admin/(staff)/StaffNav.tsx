"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function StaffNav() {
  const path = usePathname();
  const section = path.startsWith("/admin/companies") ? "companies" : path.startsWith("/admin/team") ? "team" : "requests";
  const current = (s: string) => (section === s ? ("page" as const) : undefined);
  return (
    <nav aria-label="Staff">
      <Link href="/admin" aria-current={current("requests")}>Requests</Link>
      <Link href="/admin/team" aria-current={current("team")}>Team</Link>
      <Link href="/admin/companies" aria-current={current("companies")}>Companies</Link>
    </nav>
  );
}
