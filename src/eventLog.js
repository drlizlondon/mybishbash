import { createId } from "./utils";

const EVENT_LOG_KEY = "bishbash.event-log.v1";
const USER_ID_KEY = "bishbash.user-id.v1";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_EVENTS_TABLE = import.meta.env.VITE_SUPABASE_EVENTS_TABLE || "bishbash_events";

function safeParse(rawValue, fallback) {
  try {
    return JSON.parse(rawValue ?? "");
  } catch {
    return fallback;
  }
}

export function getUserId() {
  const existing = window.localStorage.getItem(USER_ID_KEY);
  if (existing) return existing;
  const next = createId();
  window.localStorage.setItem(USER_ID_KEY, next);
  return next;
}

export function loadEventLog() {
  const stored = safeParse(window.localStorage.getItem(EVENT_LOG_KEY), []);
  return Array.isArray(stored) ? stored : [];
}

export function saveEventLog(events) {
  window.localStorage.setItem(EVENT_LOG_KEY, JSON.stringify(events));
}

async function postEventToSupabase(event) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_EVENTS_TABLE}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(event),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export function createEventRecord(input) {
  const actionTaken =
    input.action_taken ??
    input.action ??
    input.event_type?.replace(/^bash_/, "").replace(/^intercept_/, "") ??
    null;

  return {
    id: createId(),
    user_id: getUserId(),
    event_type: input.event_type,
    created_at: input.created_at ?? new Date().toISOString(),
    source_type: input.source_type ?? input.card_source ?? "personal",
    bash_id: input.bash_id ?? null,
    bash_title: input.bash_title ?? null,
    card_id: input.card_id ?? input.bash_id ?? input.message_id ?? null,
    card_title: input.card_title ?? input.bash_title ?? input.card_text ?? null,
    card_text: input.card_text ?? input.bash_title ?? input.card_title ?? null,
    card_source: input.card_source ?? input.source_type ?? "personal",
    app_id: input.app_id ?? null,
    app_name: input.app_name ?? null,
    launcher_context: input.launcher_context ?? input.launcherContext ?? "normal",
    target_app: input.target_app ?? input.targetApp ?? input.app_id ?? null,
    pack_id: input.pack_id ?? null,
    message_id: input.message_id ?? null,
    action_taken: actionTaken,
    metadata: input.metadata ?? null,
  };
}

export async function persistEventRecord(event) {
  const current = loadEventLog();
  const next = [event, ...current].slice(0, 500);
  saveEventLog(next);
  void postEventToSupabase(event);
  return next;
}

export function getStartOfWeek(date = new Date()) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + diff);
  return next;
}

export function formatTwentyFourHourTime(timestamp, timeZone = "Europe/London") {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(timestamp));
}
