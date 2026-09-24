const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Prague",
});

export const formatDate = (d: Date) => dateFmt.format(d);

// "3 h", "2 d": how long a request has been waiting.
export function age(d: Date, now = Date.now()): string {
  const hours = Math.floor((now - d.getTime()) / 3600_000);
  if (hours < 1) return "< 1 h";
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

// First contact is due within 24 hours, or 2 hours for someone who said they need help urgently.
export const isOverdue = (d: Date, now = Date.now(), crisis = false) =>
  now - d.getTime() > (crisis ? 2 : 24) * 3600_000;

// Value for an <input type="datetime-local">, in Prague time: "2026-09-30T14:00".
export function toPragueInput(d: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Prague",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
