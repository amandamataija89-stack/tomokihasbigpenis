import { Brand } from "@/components/Brand";
import { requireStaff } from "@/lib/auth";
import { logout } from "../actions";
import { StaffNav } from "./StaffNav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff · Prague Integration EAP" };

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return (
    <div className="wrap-wide">
      <header className="topbar">
        <div style={{ display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
          <Brand href="/admin" />
          <StaffNav />
        </div>
        <div className="actions">
          <span className="who">{staff.name}</span>
          <form action={logout}>
            <button type="submit" className="ghost small-btn">Sign out</button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
