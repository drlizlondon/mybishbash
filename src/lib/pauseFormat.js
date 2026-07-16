import { formatTwentyFourHourTime } from "../eventLog";

export function formatPauseRemaining(expiry, nowMs = Date.now()) {
  if (!expiry) return "";
  const remainingMs = new Date(expiry).getTime() - nowMs;
  if (!(remainingMs > 0)) return "";
  const remainingMinutes = Math.ceil(remainingMs / 60000);
  if (remainingMinutes < 60) return `${remainingMinutes} min${remainingMinutes === 1 ? "" : "s"} left`;
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return minutes === 0
    ? `${hours} hr${hours === 1 ? "" : "s"} left`
    : `${hours} hr ${minutes} mins left`;
}

export function formatPauseUntil(expiry, nowMs = Date.now()) {
  if (!expiry) return "";
  const date = new Date(expiry);
  if (!(date.getTime() > nowMs)) return "";
  return formatTwentyFourHourTime(date.toISOString());
}
