import { createId } from "./utils";
import { supabase } from "./lib/supabaseClient";

const EVENT_LOG_KEY = "mybishbash.event-log.v1";
const USER_ID_KEY = "mybishbash.user-id.v1";
const OFFLINE_QUEUE_KEY = "mybishbash.offline-event-queue.v1";
const SUPABASE_EVENTS_TABLE = import.meta.env.VITE_SUPABASE_EVENTS_TABLE || "mybishbash_events";
const LEGACY_SUPABASE_EVENTS_TABLE = ("bish" + "bash") + "_events";
const STORAGE_PREFIX = "mybishbash";
const LEGACY_STORAGE_PREFIX = "bish" + "bash";

function getLegacyStorageKey(key) {
  return key.startsWith(`${STORAGE_PREFIX}.`) ? key.replace(`${STORAGE_PREFIX}.`, `${LEGACY_STORAGE_PREFIX}.`) : null;
}

function getStorageItem(key) {
  const value = window.localStorage.getItem(key);
  if (value !== null) return value;

  const legacyKey = getLegacyStorageKey(key);
  if (!legacyKey) return null;

  const legacyValue = window.localStorage.getItem(legacyKey);
  if (legacyValue !== null) {
    window.localStorage.setItem(key, legacyValue);
  }
  return legacyValue;
}

function setStorageItem(key, value) {
  window.localStorage.setItem(key, value);
}

function isMissingTableError(error) {
  return error?.code === "PGRST205" || /Could not find the table/i.test(error?.message ?? "");
}

async function insertEventWithFallback(event) {
  let lastError = null;

  for (const tableName of [SUPABASE_EVENTS_TABLE, LEGACY_SUPABASE_EVENTS_TABLE]) {
    const { error } = await supabase.from(tableName).upsert([event], {
      onConflict: "id",
      ignoreDuplicates: true,
    });
    if (!error || error.code === "23505") return { error: null };
    if (isMissingTableError(error)) {
      lastError = error;
      continue;
    }
    return { error };
  }

  return { error: lastError };
}


function safeParse(rawValue, fallback) {
  try {
    return JSON.parse(rawValue ?? "");
  } catch {
    return fallback;
  }
}

export function mergeEventsById(localEvents = [], incomingEvents = []) {
  const mergedMap = new Map();

  if (Array.isArray(localEvents)) {
    localEvents.forEach((event) => {
      if (event && event.id) {
        mergedMap.set(event.id, event);
      }
    });
  }

  if (Array.isArray(incomingEvents)) {
    incomingEvents.forEach((event) => {
      if (event && event.id) {
        mergedMap.set(event.id, event);
      }
    });
  }

  return Array.from(mergedMap.values())
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 500);
}

export function getUserId() {
  const existing = getStorageItem(USER_ID_KEY);
  if (existing) return existing;
  const next = createId();
  setStorageItem(USER_ID_KEY, next);
  return next;
}

export function loadEventLog() {
  const stored = safeParse(getStorageItem(EVENT_LOG_KEY), []);
  return Array.isArray(stored) ? stored : [];
}

export function saveEventLog(events) {
  setStorageItem(EVENT_LOG_KEY, JSON.stringify(events));
}

export function loadOfflineEventQueue() {
  const stored = safeParse(getStorageItem(OFFLINE_QUEUE_KEY), []);
  return Array.isArray(stored) ? stored : [];
}

export function saveOfflineEventQueue(queue) {
  setStorageItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

let isProcessingQueue = false;

export async function processEventQueue() {
  if (isProcessingQueue) return;
  if (typeof window !== "undefined" && !window.navigator.onLine) return;

  let queue = loadOfflineEventQueue();
  if (queue.length === 0) return;

  isProcessingQueue = true;
  try {
    if (!supabase) return;
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.user?.id) return;

    const successfulIds = new Set();

    for (const event of queue) {
      const dbEvent = { ...event, user_id: sessionData.session.user.id };
      const { error } = await insertEventWithFallback(dbEvent);

      if (!error || error.code === "23505") {
        successfulIds.add(event.id);
      } else {
        console.warn("[SYNC] Failed to insert event:", error);
        break;
      }
    }

    if (successfulIds.size > 0) {
      queue = loadOfflineEventQueue();
      const nextQueue = queue.filter((e) => !successfulIds.has(e.id));
      saveOfflineEventQueue(nextQueue);
    }
  } catch (err) {
    console.warn("[SYNC] Error processing event queue:", err);
  } finally {
    isProcessingQueue = false;
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
  const next = mergeEventsById(current, [event]);
  saveEventLog(next);

  const queue = loadOfflineEventQueue();
  queue.push(event);
  saveOfflineEventQueue(queue);

  void processEventQueue();
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
