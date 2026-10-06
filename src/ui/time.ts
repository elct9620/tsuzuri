export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

/** `value` written with leading zeros to `width` digits, as every time the interface shows is. */
function padDigits(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** `ms` as the editor writes a time: `HH:MM:SS.mmm`. */
export function formatTime(ms: number): string {
  const hours = Math.floor(ms / MS_PER_HOUR);
  const minutes = Math.floor(ms / MS_PER_MINUTE) % 60;
  const seconds = Math.floor(ms / MS_PER_SECOND) % 60;
  return `${padDigits(hours)}:${padDigits(minutes)}:${padDigits(seconds)}.${padDigits(ms % MS_PER_SECOND, 3)}`;
}

/** The longest time the editor writes: `99:59:59.999`. */
const LONGEST_MS = 100 * MS_PER_HOUR - 1;

/**
 * The milliseconds of a time typed as `HH:MM:SS.mmm`, `MM:SS.mmm` or `SS.mmm`, a comma standing
 * for the dot as SRT writes it, or none for text that is not a time. A part past its range carries
 * into the part above, as Aegisub reads a time, and the whole is held within `LONGEST_MS`.
 */
export function parseTime(text: string): number | null {
  const match = /^(?:(?:(\d+):)?(\d{1,2}):)?(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(
    text.trim(),
  );
  if (!match) return null;
  const [, hours = "0", minutes = "0", seconds, fraction = "0"] = match;
  return Math.min(
    Number(hours) * MS_PER_HOUR +
      Number(minutes) * MS_PER_MINUTE +
      Number(seconds) * MS_PER_SECOND +
      Number(fraction.padEnd(3, "0")),
    LONGEST_MS,
  );
}

/**
 * `text`, a time written as `HH:MM:SS.mmm`, with `digit` typed over the digit at `at`, and the
 * caret after it, as Aegisub's time field overwrites: a caret on a separator types past it, a
 * part past its range carries, and a caret past the last digit types nothing.
 */
export function typedTime(
  text: string,
  at: number,
  digit: string,
): { time: string; caret: number } | null {
  const place = caretPastSeparator(text, at);
  if (place >= text.length) return null;
  const ms = parseTime(text.slice(0, place) + digit + text.slice(place + 1));
  return ms === null ? null : { time: formatTime(ms), caret: place + 1 };
}

/** `at` moved past the separator of `text` there, or `at` itself where it stands on a digit. */
export function caretPastSeparator(text: string, at: number): number {
  return /[:.,]/.test(text[at] ?? "") ? at + 1 : at;
}

/**
 * A moment Rust writes as `YYYYMMDDTHHMMSSZ` in UTC, such as a Backup's `taken_at`, in the local
 * time zone as `YYYY-MM-DD HH:mm`: the one way the interface shows a moment, whatever its language.
 */
export function localTime(utcTime: string): string {
  const [, year, month, day, hour, minute, second] =
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(utcTime)!.map(Number);
  const at = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return `${at.getFullYear()}-${padDigits(at.getMonth() + 1)}-${padDigits(at.getDate())} ${padDigits(at.getHours())}:${padDigits(at.getMinutes())}`;
}

/** `ms` as a player shows a position: `MM:SS`, or `H:MM:SS` from an hour on. */
export function formatClock(ms: number): string {
  const seconds = Math.floor(ms / MS_PER_SECOND) % 60;
  const minutes = Math.floor(ms / MS_PER_MINUTE) % 60;
  const hours = Math.floor(ms / MS_PER_HOUR);
  const clock = `${padDigits(minutes)}:${padDigits(seconds)}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}

/** How long `ms` lasts, in seconds to the millisecond: `3.200s`. */
export function formatLength(ms: number): string {
  return `${(ms / MS_PER_SECOND).toFixed(3)}s`;
}
