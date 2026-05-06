import { supabase } from "./supabaseClient";

const CONNECTED_PROFILE_KEY = "bishbash.connected-profile.v1";
const SYNC_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function normalizeSyncCode(value) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function randomChunk(length) {
  let chunk = "";
  const values = new Uint32Array(length);
  window.crypto.getRandomValues(values);
  for (let index = 0; index < length; index += 1) {
    chunk += SYNC_CODE_ALPHABET[values[index] % SYNC_CODE_ALPHABET.length];
  }
  return chunk;
}

export function generateSyncCode() {
  return `BISH-${randomChunk(4)}-${randomChunk(4)}`;
}

export function getConnectedProfile() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(CONNECTED_PROFILE_KEY) ?? "{}");
    if (!stored?.profileId || !stored?.syncCode) return null;
    return {
      profileId: stored.profileId,
      syncCode: stored.syncCode,
    };
  } catch {
    return null;
  }
}

export function setConnectedProfile(profileId, syncCode) {
  window.localStorage.setItem(
    CONNECTED_PROFILE_KEY,
    JSON.stringify({
      profileId,
      syncCode,
    }),
  );
}

export function clearConnectedProfileForTesting() {
  window.localStorage.removeItem(CONNECTED_PROFILE_KEY);
}

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the environment.");
  }
  return supabase;
}

export function getSyncErrorMessage(error, fallback = "Could not sync your BishBash profile.") {
  if (error?.code === "PGRST205" || /Could not find the table/i.test(error?.message ?? "")) {
    return "Supabase is connected, but the BishBash tables are not installed yet. Apply the SQL migration, then try again.";
  }

  if (error?.message) return error.message;
  return fallback;
}

export async function loadSharedState(profileId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("bishbash_state")
    .select("state_json")
    .eq("profile_id", profileId)
    .single();

  if (error) throw error;
  return data?.state_json ?? null;
}

export async function saveSharedState(profileId, state) {
  const client = requireSupabase();
  const { error } = await client
    .from("bishbash_state")
    .upsert(
      {
        profile_id: profileId,
        state_json: state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    );

  // TODO: add robust offline queueing. For now, keep the current UI/local mirror
  // if the network save fails, and surface the next explicit load error.
  if (error) throw error;
}

export async function createNewProfileWithState(initialState) {
  const client = requireSupabase();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const syncCode = generateSyncCode();
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .insert({ sync_code: syncCode })
      .select("id, sync_code")
      .single();

    if (profileError) {
      if (profileError.code === "23505") continue;
      throw profileError;
    }

    const { error: stateError } = await client.from("bishbash_state").insert({
      profile_id: profile.id,
      state_json: initialState,
    });

    if (stateError) throw stateError;
    setConnectedProfile(profile.id, profile.sync_code);
    return {
      profileId: profile.id,
      syncCode: profile.sync_code,
      state: initialState,
    };
  }

  throw new Error("Could not generate a unique sync code. Try again.");
}

export async function connectProfileBySyncCode(syncCode) {
  const client = requireSupabase();
  const normalizedSyncCode = normalizeSyncCode(syncCode);

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, sync_code")
    .eq("sync_code", normalizedSyncCode)
    .single();

  if (profileError || !profile) {
    throw new Error("No BishBash profile found for that sync code.");
  }

  const state = await loadSharedState(profile.id);
  setConnectedProfile(profile.id, profile.sync_code);

  return {
    profileId: profile.id,
    syncCode: profile.sync_code,
    state,
  };
}
