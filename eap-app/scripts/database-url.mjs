// Tidies a pasted database address: people often copy Neon's snippet with extras around it,
// like  psql 'postgresql://…'  or  DATABASE_URL="postgresql://…"  or a stray space.
// Shared by the migration script and the app (src/lib/db.ts).
export function cleanDatabaseUrl(raw) {
  if (!raw) return raw;
  const match = String(raw).match(/postgres(?:ql)?:\/\/[^\s'"]+/);
  return match ? match[0] : String(raw).trim();
}
