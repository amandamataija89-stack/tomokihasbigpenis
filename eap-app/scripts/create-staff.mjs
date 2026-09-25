// Creates a staff login, or resets the password of an existing one.
// Usage: npm run staff:create -- <email> "<Full name>"
// The password is read from the STAFF_PASSWORD env var, or generated and printed.
import { randomBytes, scryptSync } from "node:crypto";
import pg from "pg";

const [email, name] = process.argv.slice(2);
if (!email || !name || !process.env.DATABASE_URL) {
  console.error('Usage: DATABASE_URL=... npm run staff:create -- <email> "<Full name>"');
  process.exit(1);
}
const password = process.env.STAFF_PASSWORD || randomBytes(12).toString("base64url");
if (password.length < 12) {
  console.error("STAFF_PASSWORD must be at least 12 characters.");
  process.exit(1);
}
// Must match hashPassword() in src/lib/password.ts.
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
const stored = `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(
  `INSERT INTO staff (email, name, password_hash) VALUES (lower($1), $2, $3)
   ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash`,
  [email, name, stored],
);
await client.query(
  "DELETE FROM staff_sessions WHERE staff_id = (SELECT id FROM staff WHERE email = lower($1))",
  [email],
);
await client.end();
console.log(`Staff login ready for ${email.toLowerCase()}.`);
if (!process.env.STAFF_PASSWORD) console.log(`Password: ${password}  (share it privately; it is not stored anywhere readable)`);
