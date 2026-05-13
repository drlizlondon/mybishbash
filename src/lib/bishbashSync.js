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

function mapGlobalPack(pack, cards = []) {
  return {
    id: pack.id,
    title: pack.title,
    description: pack.description,
    theme: pack.theme,
    icon: pack.icon,
    published: pack.published,
    sourceKey: pack.source_key,
    entries: cards
      .filter((card) => card.pack_id === pack.id)
      .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
      .map((card) => ({
        id: card.id,
        promptText: card.prompt_text,
        attribution: card.attribution,
        sourceTitle: card.source_title,
        sourceUrl: card.source_url,
        frequency: card.frequency,
        timingWindows: card.timing_windows,
      })),
    isGlobal: true,
  };
}

export async function fetchGlobalPacks() {
  if (typeof window !== "undefined" && window.localStorage.getItem("BISHBASH_DEMO_MODE") === "true") return [];
  const client = requireSupabase();
  const { data: packs, error: packsError } = await client
    .from("global_packs")
    .select("*")
    .eq("published", true)
    .order("created_at", { ascending: false });
  if (packsError) return [];

  const { data: cards, error: cardsError } = await client
    .from("global_pack_cards")
    .select("*")
    .order("position", { ascending: true });
  if (cardsError) return [];

  return packs.map((pack) => mapGlobalPack(pack, cards));
}

export async function touchUserProfile(user) {
  if (!user?.id || (typeof window !== "undefined" && window.localStorage.getItem("BISHBASH_DEMO_MODE") === "true")) return;
  const client = requireSupabase();
  const { error } = await client.from("user_profiles").upsert(
    {
      user_id: user.id,
      email: user.email,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) console.warn("Could not update user profile heartbeat", error);
}

export async function fetchAdminGlobalPacks() {
  const client = requireSupabase();
  const { data: packs, error: packsError } = await client
    .from("global_packs")
    .select("*")
    .order("created_at", { ascending: false });
  if (packsError) throw packsError;

  const { data: cards, error: cardsError } = await client
    .from("global_pack_cards")
    .select("*")
    .order("position", { ascending: true });
  if (cardsError) throw cardsError;

  return (packs ?? []).map((pack) => mapGlobalPack(pack, cards ?? []));
}

export async function saveAdminGlobalPack(pack, userId) {
  const client = requireSupabase();
  const now = new Date().toISOString();
  const payload = {
    title: pack.title,
    description: pack.description,
    theme: pack.theme || "Minimal",
    icon: pack.icon || null,
    source_key: pack.sourceKey || null,
    published: Boolean(pack.published),
    updated_at: now,
  };

  if (userId) payload.created_by = userId;

  const query = pack.id
    ? client.from("global_packs").update(payload).eq("id", pack.id).select("*").single()
    : client.from("global_packs").insert([{ ...payload, created_at: now }]).select("*").single();

  const { data: savedPack, error: packError } = await query;
  if (packError) throw packError;

  const packId = savedPack.id;
  const { error: deleteError } = await client.from("global_pack_cards").delete().eq("pack_id", packId);
  if (deleteError) throw deleteError;

  const cards = (pack.entries ?? [])
    .map((entry, index) => ({
      pack_id: packId,
      prompt_text: entry.promptText?.trim(),
      attribution: entry.attribution?.trim() || null,
      source_title: entry.sourceTitle?.trim() || null,
      source_url: entry.sourceUrl?.trim() || null,
      frequency: entry.frequency || "once_daily",
      timing_windows: entry.timingWindows?.length ? entry.timingWindows : ["morning", "day", "evening"],
      position: index,
    }))
    .filter((entry) => entry.prompt_text);

  if (cards.length > 0) {
    const { error: cardsError } = await client.from("global_pack_cards").insert(cards);
    if (cardsError) throw cardsError;
  }

  return savedPack;
}

export async function deleteAdminGlobalPack(packId) {
  const client = requireSupabase();
  const { error } = await client.from("global_packs").delete().eq("id", packId);
  if (error) throw error;
}

export async function fetchAdminUsers() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("user_summary")
    .select("*")
    .order("last_seen_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchAdminAnalytics() {
  const client = requireSupabase();
  const [{ data: summary, error: summaryError }, { data: recent, error: recentError }] = await Promise.all([
    client.from("analytics_summary").select("*").order("event_count", { ascending: false }),
    client
      .from("bishbash_events")
      .select("id,event_type,created_at,card_title,card_text,target_app,launcher_context,action_taken")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (summaryError) throw summaryError;
  if (recentError) throw recentError;
  return { summary: summary ?? [], recent: recent ?? [] };
}
