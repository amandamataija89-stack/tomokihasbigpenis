"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth";

export function StaffNav({ role, counsels = true }: { role: Role; counsels?: boolean }) {
  const path = usePathname();
  const manager = role === "admin" || role === "coordinator";
  const links = [
    { href: "/admin", label: manager ? "Requests" : "My clients", show: true },
    { href: "/admin/overview", label: manager ? "All clients" : "All my clients", show: true },
    { href: "/admin/clients", label: "Clients by month", show: true },
    { href: "/admin/groups", label: manager ? "Groups" : "My groups", show: true },
    { href: "/admin/availability", label: "My availability", show: counsels },
    { href: "/admin/dashboard", label: "Dashboard", show: role === "admin" },
    { href: "/admin/payouts", label: role === "admin" ? "Payouts" : "My earnings", show: true },
    { href: "/admin/team", label: "Team", show: manager },
    { href: "/admin/companies", label: "Companies", show: manager },
    { href: "/admin/billing", label: "Monthly billing", show: manager },
    { href: "/admin/pricing", label: "Pricing & invoices", show: manager },
    { href: "/admin/feedback", label: "Feedback", show: role === "admin" },
  ].filter((l) => l.show);
  const current = links
    .filter((l) => path === l.href || (l.href !== "/admin" && path.startsWith(l.href)))
    .pop() ?? links[0];
  return (
    <nav aria-label="Staff">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l === current ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
