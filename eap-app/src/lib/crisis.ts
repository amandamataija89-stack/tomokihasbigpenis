// Prague Integration's Crisis Intervention and Stabilization Protocol, shortened to tick boxes.
// Counsellors are not medical professionals: this is a stabilization and referral protocol.
import { pool } from "./db";

export type CrisisItem = { key: string; label: string };
export type CrisisSection = { title: string; note?: string; items: CrisisItem[]; when?: "low" | "high" };

export const CRISIS_SECTIONS: CrisisSection[] = [
  {
    title: "1. Essentials",
    items: [
      { key: "location", label: "Client's current location confirmed (exact address for online sessions)" },
      { key: "phone", label: "Client's active phone number confirmed" },
      { key: "contact", label: "Emergency contact on file, with consent to contact them" },
    ],
  },
  {
    title: "2. Risk assessment (tick what applies)",
    note: "Act immediately if: active wish to die or self-harm threat, lethal means at hand, or the client drops out of contact while in crisis.",
    items: [
      { key: "ideation_passive", label: "Passive ideation (\"I wish I weren't here\")" },
      { key: "ideation_active", label: "Active ideation (\"I want to kill myself\")" },
      { key: "plan", label: "Concrete plan" },
      { key: "means", label: "Access to means (pills, weapons, places)" },
      { key: "intent", label: "Intent to act soon" },
      { key: "impulsive", label: "Impulsive: agitated, confused or under the influence" },
    ],
  },
  {
    title: "3A. Low to moderate risk: stabilize",
    when: "low",
    items: [
      { key: "validated", label: "Acknowledged the pain and asked directly about suicide" },
      { key: "protective", label: "Explored protective factors (hope, people, reasons)" },
      { key: "safety_plan", label: "Written safety plan agreed (local help and English-speaking numbers)" },
      { key: "means_restricted", label: "Discussed making the environment safe (means restriction)" },
      { key: "followup_booked", label: "Follow-up booked within 24–48 hours" },
    ],
  },
  {
    title: "3B. High risk: act",
    when: "high",
    note: "Confidentiality is overridden when life is in danger: no consent is needed to call for help.",
    items: [
      { key: "not_alone", label: "In person: client not left alone; management alerted" },
      { key: "kept_talking", label: "Online: exact location confirmed and kept on the call" },
      { key: "contact_called", label: "Emergency contact called and asked to go to the client" },
      { key: "called_back", label: "If disconnected: called back immediately" },
      { key: "emergency_called", label: "Called 112 (or 155 ambulance / 158 police) with location and situation" },
    ],
  },
  {
    title: "4. After the crisis",
    items: [
      { key: "report_filed", label: "Report written below within 24 hours" },
      { key: "checkin_done", label: "Stabilization check-in with the client within 24–48 hours" },
      { key: "referral", label: "Referral to psychiatric care or a crisis centre considered" },
      { key: "supervision", label: "Supervision or peer support sought" },
    ],
  },
];

export const CRISIS_KEYS = CRISIS_SECTIONS.flatMap((s) => s.items.map((i) => i.key));
export const labelOf = (key: string) => CRISIS_SECTIONS.flatMap((s) => s.items).find((i) => i.key === key)?.label ?? key;

export type CrisisChecklist = {
  checked: string[];
  risk: "" | "low" | "high";
  emergency_call: string;
  report: string;
  updated_at: Date | null;
  updated_by_name: string | null;
};

export async function crisisChecklist(requestId: string): Promise<CrisisChecklist> {
  const { rows } = await pool.query<CrisisChecklist>(
    `SELECT c.checked, c.risk, c.emergency_call, c.report, c.updated_at, s.name AS updated_by_name
     FROM crisis_checklists c LEFT JOIN staff s ON s.id = c.updated_by WHERE c.request_id = $1`,
    [requestId],
  );
  return rows[0] ?? { checked: [], risk: "", emergency_call: "", report: "", updated_at: null, updated_by_name: null };
}
