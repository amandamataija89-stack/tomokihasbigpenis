import { Pool } from "pg";
// @ts-expect-error: plain JavaScript helper shared with scripts/migrate.mjs
import { cleanDatabaseUrl } from "../../scripts/database-url.mjs";

const globalForPool = globalThis as unknown as { eapPool?: Pool };

// One pool per server process (and per hot reload in development).
export const pool =
  globalForPool.eapPool ??
  new Pool({ connectionString: cleanDatabaseUrl(process.env.DATABASE_URL), max: 5 });

if (process.env.NODE_ENV !== "production") globalForPool.eapPool = pool;
