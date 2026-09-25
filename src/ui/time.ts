import { interfaceLanguageCode } from "../i18n";

/** `ms` as the editor writes a time: `HH:MM:SS.mmm`. */
export function formatTime(ms: number): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(ms % 1000, 3)}`;
}

/**
 * The milliseconds of a time typed as `HH:MM:SS.mmm`, `MM:SS.mmm` or `SS.mmm`, a comma standing
 * for the dot as SRT writes it, or none for text that is not a time.
 */
export function parseTime(text: string): number | null {
  const match = /^(?:(?:(\d+):)?(\d{1,2}):)?(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(
    text.trim(),
  );
  if (!match) return null;
  const [, hours = "0", minutes = "0", seconds, fraction = "0"] = match;
  if (Number(minutes) > 59 || Number(seconds) > 59) return null;
  return (
    Number(hours) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1000 +
    Number(fraction.padEnd(3, "0"))
  );
}

/** A Backup's `taken_at` in the local time of the interface language, as a person reads the time. */
export function localTime(takenAt: string): string {
  const [, year, month, day, hour, minute, second] =
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(takenAt)!.map(Number);
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, second),
  ).toLocaleString(interfaceLanguageCode());
}

/** `ms` as a player shows a position: `MM:SS`, or `H:MM:SS` from an hour on. */
export function formatClock(ms: number): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60) % 60;
  const hours = Math.floor(seconds / 3600);
  const clock = `${pad(minutes)}:${pad(seconds % 60)}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}
