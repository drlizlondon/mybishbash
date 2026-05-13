import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_AUTH_STORAGE_KEY = "mybishbash.supabase.auth.v1";
const LEGACY_SUPABASE_AUTH_STORAGE_KEY = ("bish" + "bash") + ".supabase.auth.v1";

if (typeof window !== "undefined") {
  const currentSession = window.localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
  const legacySession = window.localStorage.getItem(LEGACY_SUPABASE_AUTH_STORAGE_KEY);

  if (!currentSession && legacySession) {
    window.localStorage.setItem(SUPABASE_AUTH_STORAGE_KEY, legacySession);
  }
}

const options = typeof window !== "undefined" ? {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: SUPABASE_AUTH_STORAGE_KEY,
    storage: window.localStorage,
  }
} : {};

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, options)
  : null;

export function isSupabaseConfigured() {
  return Boolean(supabase);
}
