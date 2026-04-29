const STORAGE_KEY = "bishbash.cards.v1";
const SETUP_KEY = "bishbash.setup-complete.v1";
const MOOD_KEY = "bishbash.mood.v1";
const PROFILE_KEY = "bishbash.profile.v1";

function safeParse(rawValue) {
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadCards() {
  const stored = safeParse(window.localStorage.getItem(STORAGE_KEY));
  if (stored && stored.length > 0) {
    return stored;
  }
  return [];
}

export function saveCards(cards) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

export function loadSetupComplete() {
  return window.localStorage.getItem(SETUP_KEY) === "true";
}

export function saveSetupComplete(value) {
  window.localStorage.setItem(SETUP_KEY, String(value));
}

export function loadMood() {
  return window.localStorage.getItem(MOOD_KEY) || "Minimal";
}

export function saveMood(value) {
  window.localStorage.setItem(MOOD_KEY, value);
}

export function loadProfile() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PROFILE_KEY) ?? "{}");
    return {
      name: stored?.name ?? "",
      timezone: stored?.timezone ?? "Europe/London",
    };
  } catch {
    return {
      name: "",
      timezone: "Europe/London",
    };
  }
}

export function saveProfile(value) {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(value));
}
