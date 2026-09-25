// Lets a staff member see admin-only pages (client feedback).
// Usage: npm run staff:admin -- <email>        (add --remove to take it away)
import pg from "pg";

const [email, flag] = process.argv.slice(2);
if (!email || !process.env.DATABASE_URL) {
  console.error("Usage: DATABASE_URL=... npm run staff:admin -- <email> [--remove]");
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rowCount } = await client.query("UPDATE staff SET is_admin = $2 WHERE email = lower($1)", [email, flag !== "--remove"]);
await client.end();
if (!rowCount) {
  console.error(`No staff login for ${email}. Create it first with npm run staff:create.`);
  process.exit(1);
}
console.log(`${email.toLowerCase()} ${flag === "--remove" ? "is no longer" : "is now"} an admin.`);
