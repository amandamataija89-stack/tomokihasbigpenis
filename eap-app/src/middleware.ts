import { NextResponse, type NextRequest } from "next/server";

// On the main domain (pragueintegration.cz) the home page is the website; the app's own pages keep working there
// too. Any other old address (from the previous website) shows the home page instead of a broken page.
const SITE_HOSTS = new Set(["pragueintegration.cz", "www.pragueintegration.cz"]);
const APP_PATHS = ["/start", "/join", "/privacy", "/terms", "/cookies", "/consent", "/intake", "/messages", "/feedback", "/group-consent", "/admin", "/api", "/site"];

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (!SITE_HOSTS.has(host)) return NextResponse.next();
  const { pathname } = req.nextUrl;
  const url = req.nextUrl.clone();
  if (pathname === "/eap") {
    url.pathname = "/"; // the EAP company-code page
    return NextResponse.rewrite(url);
  }
  if (APP_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  url.pathname = "/site";
  return NextResponse.rewrite(url);
}

export const config = {
  // Not for Next's own files, images and the like.
  matcher: ["/((?!_next/|favicon|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt|xml)$).*)"],
};
