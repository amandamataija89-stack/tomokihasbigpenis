import type { PoolClient } from "pg";
import { pool } from "./db";
import { sendEmail, therapistAlert } from "./email";

export const DEFAULT_MONTHLY_CAPACITY = 5;

// Start of the current calendar month in Prague, as SQL. Monthly counts reset at local midnight on the 1st.
export const MONTH_START_SQL = "(date_trunc('month', now() AT TIME ZONE 'Europe/Prague') AT TIME ZONE 'Europe/Prague')";

export type TherapistLoad = {
  id: string;
  name: string;
  email: string;
  capacity: number;
  languages: string[];
  assignedThisMonth: number;
  lastAssignedAt: Date | null;
};

// A therapist with no languages listed is treated as taking any language.
// "Other" can't be matched automatically, so anyone may take it.
export function speaks(t: Pick<TherapistLoad, "languages">, language: string): boolean {
  return language === "Other" || t.languages.length === 0 || t.languages.includes(language);
}

export type Choice =
  | { therapist: TherapistLoad; languageMatch: boolean }
  | { therapist: null; reason: "no-therapists" | "all-full" };

/**
 * Spreads new clients evenly. A therapist at their monthly limit is skipped and the case
 * goes to the next one: whoever has had the fewest new clients this month, then whoever has
 * waited longest. Therapists who work in the person's language come first; if they are all
 * full, the case goes to another therapist with space and is flagged as a language mismatch.
 */
export function chooseTherapist(therapists: TherapistLoad[], language: string, crisis = false): Choice {
  if (therapists.length === 0) return { therapist: null, reason: "no-therapists" };
  // A crisis case never waits: if everyone is full it goes over someone's limit, least-loaded first.
  const open = crisis && therapists.every((t) => t.assignedThisMonth >= t.capacity)
    ? therapists
    : therapists.filter((t) => t.assignedThisMonth < t.capacity);
  if (open.length === 0) return { therapist: null, reason: "all-full" };
  const waited = (t: TherapistLoad) => t.lastAssignedAt?.getTime() ?? 0;
  const best = (ts: TherapistLoad[]) =>
    [...ts].sort(
      (a, b) =>
        a.assignedThisMonth - b.assignedThisMonth || waited(a) - waited(b) || a.name.localeCompare(b.name),
    )[0];
  const speakers = open.filter((t) => speaks(t, language));
  if (speakers.length) return { therapist: best(speakers), languageMatch: true };
  return { therapist: best(open), languageMatch: false };
}

export const UNASSIGNED_REASONS: Record<Exclude<Choice, { therapist: TherapistLoad }>["reason"], string> = {
  "no-therapists": "Waiting for a therapist: nobody is set to take new clients. It will be assigned as soon as someone is.",
  "all-full":
    "Waiting for a therapist: everyone has reached their limit of new clients this month. It will be assigned automatically when a place opens, or you can assign it by hand.",
};

type Queryable = Pick<PoolClient, "query">;

export async function therapistLoads(db: Queryable = pool, onlyTakingClients = true): Promise<TherapistLoad[]> {
  const { rows } = await db.query<{
    id: string;
    name: string;
    email: string;
    monthly_capacity: number;
    languages: string[];
    assigned: number;
    last_assigned_at: Date | null;
  }>(
    `SELECT s.id, s.name, s.email, s.monthly_capacity, s.languages,
       count(r.id) FILTER (WHERE r.assigned_at >= ${MONTH_START_SQL})::int AS assigned,
       max(r.assigned_at) AS last_assigned_at
     FROM staff s LEFT JOIN support_requests r ON r.assigned_to = s.id
     ${onlyTakingClients ? "WHERE s.takes_clients" : ""}
     GROUP BY s.id ORDER BY s.name`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    capacity: r.monthly_capacity,
    languages: r.languages,
    assignedThisMonth: r.assigned,
    lastAssignedAt: r.last_assigned_at,
  }));
}

export type Assignment = { requestId: string; therapist: TherapistLoad; languageMatch: boolean; crisis: boolean };

// Assigns one request inside an open transaction and records why in its notes.
async function assignOne(
  client: PoolClient,
  loads: TherapistLoad[],
  requestId: string,
  language: string,
  crisis: boolean,
  noteIfWaiting: boolean,
): Promise<Assignment | null> {
  const choice = chooseTherapist(loads, language, crisis);
  if (!choice.therapist) {
    if (noteIfWaiting)
      await client.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [
        requestId,
        UNASSIGNED_REASONS[choice.reason],
      ]);
    return null;
  }
  const t = choice.therapist;
  await client.query(
    "UPDATE support_requests SET assigned_to = $2, assigned_at = now(), updated_at = now() WHERE id = $1",
    [requestId, t.id],
  );
  const skipped = loads.filter((x) => x.assignedThisMonth >= x.capacity).map((x) => x.name);
  let note = `${crisis ? "URGENT. " : ""}Assigned automatically to ${t.name} (new client ${t.assignedThisMonth + 1} of ${t.capacity} this month).`;
  if (t.assignedThisMonth >= t.capacity) note += " Everyone was full, so this crisis case goes over their limit.";
  else if (skipped.length) note += ` Skipped because full: ${skipped.join(", ")}.`;
  if (!choice.languageMatch)
    note += ` Check language: everyone who works in ${language} is full this month, and ${t.name} isn't listed for ${language}.`;
  await client.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [requestId, note]);
  // Keep the in-memory counts current so a batch spreads cases out correctly.
  t.assignedThisMonth++;
  t.lastAssignedAt = new Date();
  return { requestId, therapist: t, languageMatch: choice.languageMatch, crisis };
}

// Runs fn under a lock so two requests arriving together can't both take someone's last place.
async function withAssignLock<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('eap-auto-assign'))");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Assigns a new request, or leaves a note that it's waiting for a free place. */
export function autoAssign(requestId: string, language: string, crisis: boolean): Promise<Assignment | null> {
  return withAssignLock(async (client) =>
    assignOne(client, await therapistLoads(client), requestId, language, crisis, true),
  );
}

/**
 * Hands out open requests still waiting for a therapist, oldest first, as places open:
 * a new month, a raised limit, or a therapist added or back to taking clients.
 */
export function assignWaiting(): Promise<Assignment[]> {
  return withAssignLock(async (client) => {
    const { rows } = await client.query<{ id: string; language: string; crisis: boolean }>(
      `SELECT id, language, crisis FROM support_requests WHERE assigned_to IS NULL AND status = 'new'
       ORDER BY crisis DESC, created_at`,
    );
    if (!rows.length) return [];
    const loads = await therapistLoads(client);
    const done: Assignment[] = [];
    for (const r of rows) {
      const a = await assignOne(client, loads, r.id, r.language, r.crisis, false);
      if (a) done.push(a);
    }
    return done;
  });
}

/** assignWaiting, then tells each therapist about their new client. */
export async function assignWaitingAndNotify(): Promise<Assignment[]> {
  const done = await assignWaiting();
  const sent = await Promise.allSettled(
    done.map((a) => sendEmail(therapistAlert(a.therapist.email, a.therapist.name, a.requestId, a.crisis))),
  );
  for (const s of sent) if (s.status === "rejected") console.error("EAP email failed:", s.reason);
  return done;
}
