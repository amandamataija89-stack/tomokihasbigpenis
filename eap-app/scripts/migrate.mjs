// Applies db/schema.sql to DATABASE_URL. Runs before every Vercel build (npm run vercel-build).
import { readFile } from "node:fs/promises";
import pg from "pg";
import { cleanDatabaseUrl } from "./database-url.mjs";

const url = cleanDatabaseUrl(process.env.DATABASE_URL);
if (!url) {
  console.error("DATABASE_URL is missing. In Vercel: Settings → Environment Variables → add DATABASE_URL (your Neon connection string).");
  process.exit(1);
}
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.error("DATABASE_URL doesn't look like a database address. It should start with postgresql:// (copy it from Neon → Connect).");
  process.exit(1);
}
if (/\/\/[^:/]+:\*+@/.test(url)) {
  console.error("The password in DATABASE_URL is hidden with stars (****). In Neon → Connect, click 'Show password' first, then 'Copy snippet', and paste that into Vercel.");
  process.exit(1);
}
const where = url.replace(/\/\/[^@]*@/, "//***@"); // never print the password
try {
  const sql = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log("Database schema is up to date.");
} catch (err) {
  console.error(`Couldn't set up the database at ${where}`);
  console.error(`Reason: ${err.message}`);
  if (/password authentication failed/i.test(err.message))
    console.error("The password in DATABASE_URL is wrong. Copy the connection string from Neon → Connect again (with 'Show password').");
  if (/ENOTFOUND|getaddrinfo/i.test(err.message))
    console.error("The database address can't be found. Check DATABASE_URL was copied completely from Neon → Connect.");
  process.exit(1);
}
