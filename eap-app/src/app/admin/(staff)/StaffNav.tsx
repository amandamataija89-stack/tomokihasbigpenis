"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function StaffNav() {
  const path = usePathname();
  const onCompanies = path.startsWith("/admin/companies");
  return (
    <nav aria-label="Staff">
      <Link href="/admin" aria-current={!onCompanies ? "page" : undefined}>Requests</Link>
      <Link href="/admin/companies" aria-current={onCompanies ? "page" : undefined}>Companies</Link>
    </nav>
  );
}
