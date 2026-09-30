// Calendar invitations (.ics) sent with session emails, so clients can add a session to their calendar
// in one click. The session id is the event's UID, so a moved session updates the same event and a
// cancelled one removes it.

export const SESSION_MINUTES = 50;
export const DISCOVERY_MINUTES = 20;

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
// Escape text values and fold long lines, as the calendar format requires.
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 74) {
    let cut = 74;
    while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

export function sessionIcs(e: {
  id: string;
  start: Date;
  minutes: number;
  summary: string;
  location: string;
  description: string;
  url?: string;
  cancelled?: boolean;
  now?: Date;
}): string {
  const now = e.now ?? new Date();
  const end = new Date(e.start.getTime() + e.minutes * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Prague Integration//Sessions//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${e.cancelled ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${e.id}@pragueintegration.cz`,
    `SEQUENCE:${Math.floor(now.getTime() / 1000)}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(e.summary)}`,
    `LOCATION:${esc(e.location)}`,
    `DESCRIPTION:${esc(e.description)}`,
    ...(e.url ? [`URL:${e.url}`] : []),
    `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "ORGANIZER;CN=Prague Integration:mailto:contact@pragueintegration.cz",
    ...(e.cancelled
      ? []
      : ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Session with Prague Integration", "TRIGGER:-PT1H", "END:VALARM"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
