import { Pool } from "pg";

const globalForPool = globalThis as unknown as { eapPool?: Pool };

// One pool per server process (and per hot reload in development).
export const pool =
  globalForPool.eapPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

if (process.env.NODE_ENV !== "production") globalForPool.eapPool = pool;
