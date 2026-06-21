import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";

function toDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  const date = typeof d === "string" ? parseISO(d) : d;
  return isValid(date) ? date : null;
}

export function formatDate(d: string | Date | null | undefined): string {
  const date = toDate(d);
  return date ? format(date, "dd MMM yyyy") : "—";
}

export function formatDateTime(d: string | Date | null | undefined): string {
  const date = toDate(d);
  return date ? format(date, "dd MMM yyyy, HH:mm") : "—";
}

export function fromNow(d: string | Date | null | undefined): string {
  const date = toDate(d);
  return date ? `${formatDistanceToNowStrict(date)} ago` : "—";
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The calendar day of a timestamp in the SERVER's local zone (yyyy-MM-dd).
 *  Use for "today" counters so they match the times rendered on the page,
 *  rather than bucketing around the UTC midnight boundary. */
export function localDay(d: string | Date | null | undefined): string {
  const date = toDate(d);
  return date ? format(date, "yyyy-MM-dd") : "";
}
