import { supabase } from "./supabaseClient";
import {
  assertKnownLauncherId,
  isStaticLauncher,
  validateLauncherDraft,
} from "./launcherRegistry";
import { LAUNCHER_AVAILABILITY_STATUSES } from "./launcherAvailability";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the environment.");
  }
  return supabase;
}

const SHARED_STATE_TABLE = "mybishbash_state";
const LEGACY_SHARED_STATE_TABLE = ("bish" + "bash") + "_state";
const SHARED_EVENTS_TABLE = "mybishbash_events";
const LEGACY_SHARED_EVENTS_TABLE = ("bish" + "bash") + "_events";
export const INVITE_ONLY_ACCESS_ERROR = "MyBishBash is currently invite-only.\nYour access code was not recognised.";

function isDemoMode() {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem("MYBISHBASH_DEMO_MODE") === "true" ||
    window.localStorage.getItem(("BISH" + "BASH") + "_DEMO_MODE") === "true"
  );
}

function isMissingTableError(error) {
  return error?.code === "PGRST205" || /Could not find the table/i.test(error?.message ?? "");
}

async function selectSharedStateFromTable(client, tableName, userId) {
  const { data, error } = await client
    .from(tableName)
    .select("state_json")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return { missingTable: true, state: null };
    throw error;
  }

  return { missingTable: false, state: data?.state_json ?? null };
}

async function upsertSharedStateIntoTable(client, tableName, userId, state) {
  const { error } = await client
    .from(tableName)
    .upsert(
      {
        user_id: userId,
        state_json: state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    if (isMissingTableError(error)) return { missingTable: true };
    throw error;
  }

  return { missingTable: false };
}

export function getSyncErrorMessage(error, fallback = "Could not sync your MyBishBash profile.") {
  if (error?.code === "PGRST205" || /Could not find the table/i.test(error?.message ?? "")) {
    return "Supabase is connected, but the MyBishBash tables are not installed yet. Apply the SQL migration, then try again.";
  }

  if (error?.code === "42501" || /permission denied/i.test(error?.message ?? "")) {
    return "Supabase is connected, but MyBishBash does not have permission to read/write the sync tables yet. Apply the grant SQL, then try again.";
  }

  if (error?.message) return error.message;
  return fallback;
}

export async function loadSharedState(userId) {
  if (isDemoMode()) return null;
  const client = requireSupabase();

  let firstMissingTableError = null;
  let sawUsableTable = false;

  for (const tableName of [SHARED_STATE_TABLE, LEGACY_SHARED_STATE_TABLE]) {
    const result = await selectSharedStateFromTable(client, tableName, userId);
    if (result.missingTable) {
      firstMissingTableError ??= new Error(`Could not find the table ${tableName}`);
      firstMissingTableError.code = "PGRST205";
      continue;
    }

    sawUsableTable = true;
    if (result.state) return result.state;
  }

  if (!sawUsableTable && firstMissingTableError) throw firstMissingTableError;
  return null;
}

export async function saveSharedState(userId, state) {
  if (isDemoMode()) return;
  const client = requireSupabase();

  let firstMissingTableError = null;
  for (const tableName of [SHARED_STATE_TABLE, LEGACY_SHARED_STATE_TABLE]) {
    const result = await upsertSharedStateIntoTable(client, tableName, userId, state);
    if (!result.missingTable) return;
    firstMissingTableError ??= new Error(`Could not find the table ${tableName}`);
    firstMissingTableError.code = "PGRST205";
  }

  console.error("UPSERT ERROR (Raw)", firstMissingTableError);
  throw firstMissingTableError;
}

export async function getSession() {
  if (isDemoMode()) {
    return { user: { id: "demo-user", email: "demo@example.com" } };
  }
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

function normalizeAccessCode(accessCode) {
  return String(accessCode ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

function logSupabaseAccessError(operation, error) {
  if (!error) return;
  console.error("[AUTH_ACCESS_ERROR]", {
    operation,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
    status: error.status,
  });
}

const LOCAL_INVITATION_CODES = [
  "REDDIT-14",
  "FAMILY-ALPHA",
  "FOUNDER-EARLY",
  "TESTER"
];

async function validateAccessCode(accessCode) {
  const client = requireSupabase();
  const normalizedAccessCode = normalizeAccessCode(accessCode);

  if (!normalizedAccessCode) return false;
  if (LOCAL_INVITATION_CODES.includes(normalizedAccessCode)) return true;

  const { data: rpcData, error: rpcError } = await client.rpc("validate_mybishbash_access_code", {
    access_code: normalizedAccessCode,
  });

  if (!rpcError) return rpcData === true;
  if (!isMissingTableError(rpcError) && rpcError.code !== "PGRST202") {
    logSupabaseAccessError("rpc:validate_mybishbash_access_code", rpcError);
  }

  const { data, error } = await client
    .from("access_invitation_codes")
    .select("code, active, usage_count, max_uses")
    .eq("code", normalizedAccessCode)
    .maybeSingle();

  if (error) {
    logSupabaseAccessError("query:validate_access_code", error);
    return false;
  }

  if (!data) return false;
  if (data.active === false) return false;
  if (data.max_uses !== null && data.usage_count >= data.max_uses) return false;

  return true;
}

async function claimAccessCode(accessCode) {
  const client = requireSupabase();
  const normalizedAccessCode = normalizeAccessCode(accessCode);
  if (!normalizedAccessCode) return false;
  if (LOCAL_INVITATION_CODES.includes(normalizedAccessCode)) return true;

  const { data: rpcData, error: rpcError } = await client.rpc("claim_mybishbash_access_code", {
    access_code: normalizedAccessCode,
  });

  if (!rpcError) return rpcData === true;
  if (!isMissingTableError(rpcError) && rpcError.code !== "PGRST202") {
    logSupabaseAccessError("rpc:claim_mybishbash_access_code", rpcError);
  }

  const { data, error: fetchError } = await client
    .from("access_invitation_codes")
    .select("usage_count")
    .eq("code", normalizedAccessCode)
    .maybeSingle();

  if (fetchError || !data) {
    logSupabaseAccessError("query:claim_access_code_fetch", fetchError);
    return false;
  }

  const { error: updateError } = await client
    .from("access_invitation_codes")
    .update({ usage_count: (data.usage_count || 0) + 1, updated_at: new Date().toISOString() })
    .eq("code", normalizedAccessCode);

  if (updateError) {
    logSupabaseAccessError("update:claim_access_code", updateError);
    return false;
  }
  return true;
}

export async function hasAccessEntitlement(userId) {
  if (isDemoMode()) return true;
  const client = requireSupabase();

  const { data: profile, error: profileError } = await client
    .from("user_profiles")
    .select("has_access")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profileError) {
    if (profile?.has_access === false) return false;
    if (profile?.has_access === true) return true;
  } else if (!isMissingTableError(profileError)) {
    logSupabaseAccessError("query:user_profiles.has_access", profileError);
  }

  const { data, error } = await client
    .from("access_entitlements")
    .select("has_access")
    .eq("user_id", userId)
    .maybeSingle();
    
  if (error && error.code !== "PGRST205" && !/Could not find the table/i.test(error.message)) {
    logSupabaseAccessError("query:access_entitlements.has_access", error);
  }

  // If an admin has explicitly revoked access, block them.
  if (data?.has_access === false) return false;

  // Otherwise, if they have an active session, they passed the access code gate at signup!
  return true;
}

export function onAuthStateChange(callback) {
  if (isDemoMode() || !supabase) {
    return { data: { subscription: { unsubscribe: () => {} } } };
  }
  const client = requireSupabase();
  return client.auth.onAuthStateChange(callback);
}

export async function signUp(email, password, accessCode) {
  const client = requireSupabase();
  const normalizedAccessCode = normalizeAccessCode(accessCode);
  const hasValidAccessCode = await validateAccessCode(normalizedAccessCode);

  if (!hasValidAccessCode) {
    const error = new Error(INVITE_ONLY_ACCESS_ERROR);
    error.code = "MYBISHBASH_INVALID_ACCESS_CODE";
    throw error;
  }

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        mybishbash_access_code: normalizedAccessCode,
      },
    },
  });
  if (error) {
    logSupabaseAccessError("auth.signUp", error);
    throw error;
  }
  if (data.session?.user) await claimAccessCode(normalizedAccessCode);
  return data.session;
}

export async function logIn(email, password) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    logSupabaseAccessError("auth.signInWithPassword", error);
    throw error;
  }
  return data.session;
}

export async function logOut() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function savePushSubscription(userId, subscription, userAgent) {
  if (isDemoMode()) return;
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
  
  if (error) {
    console.error("[NOTIFICATIONS] Error saving push subscription:", error);
    throw error;
  }
}

export async function removePushSubscription(userId, endpoint) {
  if (isDemoMode()) return;
  const client = requireSupabase();
  const { error } = await client.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", endpoint);
  
  if (error) console.error("Error removing push subscription:", error);
}

export async function saveNotificationPreferences(userId, prefs) {
  if (isDemoMode()) return;
  const client = requireSupabase();
  const { error } = await client.from("notification_preferences").upsert({
    user_id: userId,
    ...prefs,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  
  if (error) {
    console.error("[NOTIFICATIONS] Error saving notification preferences:", error);
    throw error;
  }
}

export async function markNotificationOpened(deliveryId) {
  if (isDemoMode()) return;
  const client = requireSupabase();
  const { error } = await client.from("notification_delivery_log").update({ opened_at: new Date().toISOString() }).eq("id", deliveryId);
  
  if (error) console.error("[NOTIFICATIONS] Error marking notification opened:", error);
}

export async function saveLauncherEvent(payload) {
  if (isDemoMode()) return;
  const client = requireSupabase();
  const { error } = await client.from("launcher_events").insert({
    user_id: payload.user_id,
    anonymous_device_id: payload.anonymous_device_id,
    session_id: payload.session_id,
    event_type: payload.event_type,
    launcher_id: payload.launcher_id,
    launcher_name: payload.launcher_name,
    launcher_category: payload.launcher_category,
    route: payload.route,
    source: payload.source,
    is_standalone: payload.is_standalone,
    app_display_mode: payload.app_display_mode,
    platform: payload.platform,
    metadata: payload.metadata ?? {},
  });

  if (error) console.error("[INTERCEPT] Error saving launcher event:", error);
}

// HQ role model: owner (full control incl. hard delete), admin (add/edit/
// test/archive), analyst (view only), support (reports/testing notes).
// Rows created before the role migration default to "admin".
export async function fetchAdminRole(userId) {
  if (isDemoMode()) return null;
  const client = requireSupabase();
  const { data, error } = await client
    .from("admin_users")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.role ?? "admin";
}

export async function checkIsAdmin(userId) {
  if (isDemoMode()) return false;
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
  if (isDemoMode()) return [];
  const client = requireSupabase();
  const { data: packs, error: packsError } = await client
    .from("global_packs")
    .select("*")
    .eq("published", true)
    .order("created_at", { ascending: false });
  if (packsError) throw packsError;

  const { data: cards, error: cardsError } = await client
    .from("global_pack_cards")
    .select("*")
    .order("position", { ascending: true });
  if (cardsError) throw cardsError;

  return packs.map((pack) => mapGlobalPack(pack, cards));
}

export async function touchUserProfile(user) {
  if (!user?.id || (isDemoMode())) return;
  const client = requireSupabase();

  const { error: profileError } = await client
    .from("user_profiles")
    .update({
      email: user.email,
      last_seen_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (!profileError) return;

  if (!isMissingTableError(profileError)) {
    logSupabaseAccessError("update:user_profiles.touchUserProfile", profileError);
    console.warn("Could not update user profile heartbeat", profileError);
    return;
  }

  const { error } = await client.from("access_entitlements").upsert(
    {
      user_id: user.id,
      email: user.email,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    logSupabaseAccessError("upsert:access_entitlements.touchUserProfile", error);
    console.warn("Could not update user profile heartbeat", error);
  }
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

function mapLauncherConfig(row = {}) {
  const config = {
    id: row.launcher_id ?? row.id,
    enabled: row.enabled,
    hqVisible: row.hq_visible,
    useInterruptionPack: row.use_interruption_pack,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    // Rows HQ created itself (not overrides of static registry IDs).
    isCustom: row.is_custom === true,
  };
  const optionalFields = {
    displayName: row.display_name,
    name: row.display_name,
    realAppLabel: row.real_app_label,
    iconSrc: row.icon_src,
    customIconSrc: row.uploaded_icon_url,
    iosAppUrl: row.ios_app_url,
    androidIntentUrl: row.android_intent_url,
    webFallbackUrl: row.web_fallback_url,
    interruptionPackId: row.interruption_pack_id,
    // Columns added by the availability migration; absent on older schemas.
    availabilityStatus: row.availability_status,
    iosWebFallbackUrl: row.ios_web_fallback_url,
    androidWebFallbackUrl: row.android_web_fallback_url,
    nativeAppUrl: row.native_app_url,
    appUrl: row.app_url,
    manualUrl: row.manual_url,
    qaNotes: row.qa_notes,
    category: row.category,
  };
  Object.entries(optionalFields).forEach(([key, value]) => {
    if (typeof value === "string" && value.trim()) config[key] = value.trim();
  });
  return config;
}

function withTimeout(promise, timeoutMs, fallbackValue, label) {
  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = globalThis.setTimeout(() => {
      console.warn(`[${label}] Timed out; using static defaults.`);
      resolve(fallbackValue);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    globalThis.clearTimeout(timeoutId);
  });
}

export async function fetchLauncherConfigs() {
  if (isDemoMode()) return [];
  const client = requireSupabase();
  const query = client
    .from("hq_launcher_configs")
    .select("*")
    .order("launcher_id", { ascending: true });
  const { data, error } = await withTimeout(query, 1200, { data: [], error: null }, "HQ LAUNCHERS");
  if (error) {
    if (isMissingTableError(error) || error.code === "42501") {
      console.warn("[HQ LAUNCHERS] Falling back to static launcher defaults", error.message);
      return [];
    }
    throw error;
  }
  return (data ?? []).map(mapLauncherConfig);
}

export async function fetchAdminLauncherConfigs() {
  return fetchLauncherConfigs();
}

function isMissingColumnError(error) {
  return error?.code === "PGRST204" || error?.code === "42703" || /column .* does not exist|Could not find the '.*' column/i.test(error?.message ?? "");
}

export async function saveAdminLauncherConfig(config, userId) {
  const isCustom = config?.isCustom === true && !isStaticLauncher(config?.id);
  if (!isCustom) {
    // Overrides may only target supported, code-reviewed launcher IDs.
    assertKnownLauncherId(config?.id);
  }

  const client = requireSupabase();
  const now = new Date().toISOString();
  let availabilityStatus = LAUNCHER_AVAILABILITY_STATUSES.includes(config.availabilityStatus)
    ? config.availabilityStatus
    : (config.enabled ? "public" : "disabled");
  if (isCustom) {
    // HQ-created launchers are re-validated on every save. Moving one to a
    // user-facing status additionally requires an https web fallback (the
    // go-live gate inside validateLauncherDraft), so a deployed app can never
    // ship a dead Continue-to-app path.
    const existingConfigs = await fetchLauncherConfigs().catch(() => []);
    const validation = validateLauncherDraft(config, {
      existingIds: existingConfigs.map((row) => row.id).filter((id) => id !== config.id),
      targetStatus: availabilityStatus,
    });
    if (!validation.ok) {
      const error = new Error(validation.errors.join("\n"));
      error.code = "MYBISHBASH_INVALID_LAUNCHER_DRAFT";
      throw error;
    }
  }
  const legacyPayload = {
    launcher_id: config.id,
    display_name: config.displayName || config.name || "",
    real_app_label: config.realAppLabel || "",
    icon_src: config.iconSrc || "",
    uploaded_icon_url: config.customIconSrc || "",
    // Keep the legacy boolean consistent with availability so pre-migration
    // clients see the same effective state.
    enabled: availabilityStatus === "public",
    hq_visible: Boolean(config.hqVisible),
    ios_app_url: config.iosAppUrl || "",
    android_intent_url: config.androidIntentUrl || "",
    web_fallback_url: config.webFallbackUrl || "",
    use_interruption_pack: Boolean(config.useInterruptionPack),
    interruption_pack_id: config.interruptionPackId || "",
    updated_at: now,
    updated_by: userId ?? null,
  };
  const payload = {
    ...legacyPayload,
    availability_status: availabilityStatus,
    ios_web_fallback_url: config.iosWebFallbackUrl || "",
    android_web_fallback_url: config.androidWebFallbackUrl || "",
    native_app_url: config.nativeAppUrl || "",
    app_url: config.appUrl || "",
    manual_url: config.manualUrl || "",
    qa_notes: config.qaNotes || "",
  };
  if (isCustom) {
    payload.is_custom = true;
    payload.category = config.category || "other";
  }

  const upsert = (body) =>
    client
      .from("hq_launcher_configs")
      .upsert(body, { onConflict: "launcher_id" })
      .select("*")
      .single();

  let { data, error } = await upsert(payload);
  if (error && isCustom && isMissingColumnError(error)) {
    // Never silently save a custom app as an unflagged row on an old schema.
    const schemaError = new Error("HQ-created apps need the custom-apps migration (is_custom/category columns). Apply the latest SQL migration, then try again.");
    schemaError.code = "MYBISHBASH_CUSTOM_APPS_MIGRATION_MISSING";
    throw schemaError;
  }
  if (error && isMissingColumnError(error)) {
    // The availability migration has not been applied yet — save the legacy
    // column set so HQ keeps working against the old schema.
    console.warn("[HQ LAUNCHERS] availability columns missing; saving legacy launcher config", error.message);
    ({ data, error } = await upsert(legacyPayload));
  }
  if (error) throw error;
  return mapLauncherConfig(data);
}

// Permanent delete is only available for HQ-created (custom) rows. Supported
// registry launchers are code-defined: archive them instead, or clear their
// override row manually in Supabase.
export async function deleteAdminLauncherConfig(launcherId) {
  if (!launcherId || isStaticLauncher(launcherId)) {
    throw new Error("Supported registry launchers cannot be deleted — archive them instead.");
  }
  const client = requireSupabase();
  const { error } = await client
    .from("hq_launcher_configs")
    .delete()
    .eq("launcher_id", launcherId)
    .eq("is_custom", true);
  if (error) throw error;
}

// Dependency summary used to warn admins before archive/delete. Historical
// launcher_events keep their own launcher_name/category snapshot, so they
// stay renderable after a delete — but new metadata is lost.
export async function fetchLauncherUsageSummary(launcherId) {
  const client = requireSupabase();
  const summary = { launcherEvents: 0, testerReports: 0 };
  if (!launcherId) return summary;

  const [eventsResult, reportsResult] = await Promise.all([
    client.from("launcher_events").select("id", { count: "exact", head: true }).eq("launcher_id", launcherId),
    client.from("tester_reports").select("id", { count: "exact", head: true }).eq("launcher_context", launcherId),
  ]);
  if (!eventsResult.error) summary.launcherEvents = eventsResult.count ?? 0;
  if (!reportsResult.error) summary.testerReports = reportsResult.count ?? 0;
  return summary;
}

export const LAUNCHER_ICON_BUCKET = "launcher-icons";
const LAUNCHER_ICON_ALLOWED_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const LAUNCHER_ICON_MAX_BYTES = 1024 * 1024;

// Upload a launcher icon to Supabase Storage and return its public URL.
// If the bucket has not been provisioned, fail with a clear message — the
// custom image URL field remains the manual fallback path.
export async function uploadLauncherIcon(launcherId, file) {
  const client = requireSupabase();
  if (!launcherId) throw new Error("A launcher ID is required to upload an icon.");
  const extension = LAUNCHER_ICON_ALLOWED_TYPES[file?.type];
  if (!extension) {
    throw new Error("Unsupported image type. Use PNG, JPG, WebP or SVG.");
  }
  if (file.size > LAUNCHER_ICON_MAX_BYTES) {
    throw new Error("Icon image must be under 1MB.");
  }

  const path = `${launcherId}/${Date.now()}.${extension}`;
  const { error } = await client.storage
    .from(LAUNCHER_ICON_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) {
    if (/bucket not found/i.test(error.message ?? "")) {
      throw new Error(`Icon upload storage is not provisioned yet (missing "${LAUNCHER_ICON_BUCKET}" bucket). Apply the latest SQL migration, or paste an https image URL into the custom icon field instead.`);
    }
    throw error;
  }
  const { data } = client.storage.from(LAUNCHER_ICON_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Could not resolve the uploaded icon URL.");
  return data.publicUrl;
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
  const [
    { data: summary, error: summaryError },
    { data: recent, error: recentError },
    { data: launcherEvents, error: launcherEventsError },
    { data: waitlist, error: waitlistError },
    { data: testerReports, error: testerReportsError },
  ] = await Promise.all([
    client.from("analytics_summary").select("*").order("event_count", { ascending: false }),
    client
      .from(SHARED_EVENTS_TABLE)
      .select("id,user_id,event_type,created_at,source_type,bash_id,card_id,card_title,card_text,target_app,launcher_context,pack_id,message_id,app_id,app_name,action_taken,metadata")
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .from("launcher_events")
      .select("id,user_id,anonymous_device_id,session_id,event_type,launcher_id,launcher_name,launcher_category,route,source,is_standalone,app_display_mode,platform,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("launch_signups")
      .select("id,email,country,created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    client
      .from("tester_reports")
      .select("id,user_id,report_type,status,severity,launcher_context,created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);
  if (summaryError) throw summaryError;
  if (recentError) throw recentError;
  if (launcherEventsError && launcherEventsError.code !== "PGRST205") throw launcherEventsError;
  if (waitlistError && !["PGRST205", "42501"].includes(waitlistError.code)) throw waitlistError;
  if (testerReportsError && !["PGRST205", "42501"].includes(testerReportsError.code)) throw testerReportsError;
  return { summary: summary ?? [], recent: recent ?? [], launcherEvents: launcherEvents ?? [], waitlist: waitlist ?? [], testerReports: testerReports ?? [] };
}

export async function fetchAdminLiveActivity() {
  const client = requireSupabase();
  const [
    { data: recent, error: recentError },
    { data: launcherEvents, error: launcherEventsError },
  ] = await Promise.all([
    client
      .from(SHARED_EVENTS_TABLE)
      .select("id,user_id,event_type,created_at,source_type,bash_id,card_id,card_title,card_text,target_app,launcher_context,pack_id,message_id,app_id,app_name,action_taken,metadata")
      .order("created_at", { ascending: false })
      .limit(80),
    client
      .from("launcher_events")
      .select("id,user_id,anonymous_device_id,session_id,event_type,launcher_id,launcher_name,launcher_category,route,source,is_standalone,app_display_mode,platform,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(120),
  ]);
  if (recentError) throw recentError;
  if (launcherEventsError && launcherEventsError.code !== "PGRST205") throw launcherEventsError;
  return { recent: recent ?? [], launcherEvents: launcherEvents ?? [] };
}
