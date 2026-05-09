import { supabase } from "./supabaseClient";

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

  if (error?.code === "42501" || /permission denied/i.test(error?.message ?? "")) {
    return "Supabase is connected, but BishBash does not have permission to read/write the sync tables yet. Apply the grant SQL, then try again.";
  }

  if (error?.message) return error.message;
  return fallback;
}

export async function loadSharedState(userId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("bishbash_state")
    .select("state_json")
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // No rows found (expected on first login)
    throw error;
  }
  return data?.state_json ?? null;
}

export async function saveSharedState(userId, state) {
  const client = requireSupabase();
  const { error } = await client
    .from("bishbash_state")
    .upsert(
      {
        user_id: userId,
        state_json: state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("UPSERT ERROR (Raw)", error);
    throw error;
  }
}

export async function getSession() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(callback) {
  const client = requireSupabase();
  return client.auth.onAuthStateChange(callback);
}

export async function signUp(email, password) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  return data.session;
}

export async function logIn(email, password) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function logOut() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
