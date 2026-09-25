// Sets a staff member's role. Usage:
//   npm run staff:admin -- <email>                 make them an admin (sees everything, including feedback)
//   npm run staff:admin -- <email> coordinator     make them a coordinator
//   npm run staff:admin -- <email> counsellor      back to counsellor
import pg from "pg";

const [email, role = "admin"] = process.argv.slice(2);
if (!email || !process.env.DATABASE_URL || !["admin", "coordinator", "counsellor"].includes(role)) {
  console.error("Usage: DATABASE_URL=... npm run staff:admin -- <email> [admin|coordinator|counsellor]");
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rowCount } = await client.query("UPDATE staff SET role = $2, is_admin = ($2 = 'admin') WHERE email = lower($1)", [
  email,
  role,
]);
await client.end();
if (!rowCount) {
  console.error(`No staff login for ${email}. Create it first with npm run staff:create.`);
  process.exit(1);
}
console.log(`${email.toLowerCase()} is now: ${role}.`);
