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
  if (typeof window !== "undefined" && window.localStorage.getItem("BISHBASH_DEMO_MODE") === "true") return null;
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
  if (typeof window !== "undefined" && window.localStorage.getItem("BISHBASH_DEMO_MODE") === "true") return;
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
  if (typeof window !== "undefined" && window.localStorage.getItem("BISHBASH_DEMO_MODE") === "true") {
    return { user: { id: "demo-user", email: "demo@example.com" } };
  }
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(callback) {
  if (typeof window !== "undefined" && window.localStorage.getItem("BISHBASH_DEMO_MODE") === "true") {
    return { data: { subscription: { unsubscribe: () => {} } } };
  }
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

export async function savePushSubscription(userId, subscription, userAgent) {
  if (typeof window !== "undefined" && window.localStorage.getItem("BISHBASH_DEMO_MODE") === "true") return;
  const client = requireSupabase();
  const sub = JSON.parse(JSON.stringify(subscription));
  const { error } = await client.from("push_subscriptions").upsert({
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: userAgent,
    enabled: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id, endpoint" });
  
  if (error) console.error("Error saving push subscription:", error);
}

export async function removePushSubscription(userId, endpoint) {
  if (typeof window !== "undefined" && window.localStorage.getItem("BISHBASH_DEMO_MODE") === "true") return;
  const client = requireSupabase();
  const { error } = await client.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", endpoint);
  
  if (error) console.error("Error removing push subscription:", error);
}

export async function saveNotificationPreferences(userId, prefs) {
  if (typeof window !== "undefined" && window.localStorage.getItem("BISHBASH_DEMO_MODE") === "true") return;
  const client = requireSupabase();
  const { error } = await client.from("notification_preferences").upsert({
    user_id: userId,
    ...prefs,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  
  if (error) console.error("Error saving notification preferences:", error);
}

export async function markNotificationOpened(deliveryId) {
  if (typeof window !== "undefined" && window.localStorage.getItem("BISHBASH_DEMO_MODE") === "true") return;
  const client = requireSupabase();
  const { error } = await client.from("notification_delivery_log").update({ opened_at: new Date().toISOString() }).eq("id", deliveryId);
  
  if (error) console.error("Error marking notification opened:", error);
}

export async function checkIsAdmin(userId) {
  if (typeof window !== "undefined" && window.localStorage.getItem("BISHBASH_DEMO_MODE") === "true") return false;
  const client = requireSupabase();
  const { data, error } = await client.from("admin_users").select("user_id").eq("user_id", userId).single();
  if (error) {
    console.error("[ADMIN CHECK ERROR]", error);
    return false;
  }
  return !!data;
}

export async function fetchGlobalPacks() {
  if (typeof window !== "undefined" && window.localStorage.getItem("BISHBASH_DEMO_MODE") === "true") return [];
  const client = requireSupabase();
  const { data: packs, error: packsError } = await client.from("global_packs").select("*").eq("published", true);
  if (packsError) return [];

  const { data: cards, error: cardsError } = await client.from("global_pack_cards").select("*");
  if (cardsError) return [];

  return packs.map((pack) => ({
    id: pack.id,
    title: pack.title,
    description: pack.description,
    theme: pack.theme,
    entries: cards.filter((c) => c.pack_id === pack.id).map(c => ({ promptText: c.prompt_text, attribution: c.attribution, frequency: c.frequency, timingWindows: c.timing_windows })),
    isGlobal: true,
  }));
}
