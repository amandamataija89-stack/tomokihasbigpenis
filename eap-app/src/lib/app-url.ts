/**
 * The app's public address for links in emails, with no trailing slash. Uses APP_URL when it
 * holds a real web address; otherwise (unset, or something else pasted in by mistake) falls back
 * to the production address Vercel provides, then to localhost for development.
 */
export function appUrl(env: Record<string, string | undefined> = process.env): string {
  const set = env.APP_URL?.match(/https?:\/\/[^\s<>"']+/)?.[0];
  if (set) return set.replace(/\/+$/, "");
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL ?? env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}
