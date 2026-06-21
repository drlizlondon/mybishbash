import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getBearerToken(req: Request) {
  const header = req.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return error?.code === "PGRST205" || /Could not find the table/i.test(error?.message ?? "");
}

async function deleteWhere(
  client: ReturnType<typeof createClient>,
  tableName: string,
  columnName: string,
  value: string,
) {
  const { error } = await client.from(tableName).delete().eq(columnName, value);
  if (error && !isMissingTableError(error)) throw error;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Account deletion is not configured." }, 500);
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) {
    return jsonResponse({ error: "Please log in before deleting your account." }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !userData?.user?.id) {
    return jsonResponse({ error: "Please log in again before deleting your account." }, 401);
  }

  const user = userData.user;
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const userId = user.id;

    // Explicitly purge tables whose auth.users foreign key is ON DELETE SET NULL,
    // plus legacy/shared-state rows. Cascading tables below are also deleted
    // explicitly where safe, so deletion is complete even before auth cleanup.
    await deleteWhere(adminClient, "mybishbash_events", "user_id", userId);
    await deleteWhere(adminClient, "bishbash_events", "user_id", userId);
    await deleteWhere(adminClient, "launcher_events", "user_id", userId);
    await deleteWhere(adminClient, "mybishbash_state", "user_id", userId);
    await deleteWhere(adminClient, "bishbash_state", "user_id", userId);
    await deleteWhere(adminClient, "access_audit_log", "user_id", userId);
    if (user.email) {
      await deleteWhere(adminClient, "access_audit_log", "email", user.email);
    }
    await deleteWhere(adminClient, "mybishbash_signup_handoffs", "claimed_user_id", userId);
    await deleteWhere(adminClient, "pending_access_grants", "applied_user_id", userId);

    // These tables declare ON DELETE CASCADE to auth.users in migrations.
    // Delete the user-content rows explicitly first for immediate privacy
    // cleanup; user_profiles and admin_users are left to the auth-user cascade
    // so profile/admin access is only removed when account deletion succeeds.
    await deleteWhere(adminClient, "tester_report_attachments", "user_id", userId);
    await deleteWhere(adminClient, "tester_reports", "user_id", userId);
    await deleteWhere(adminClient, "notification_delivery_log", "user_id", userId);
    await deleteWhere(adminClient, "notification_preferences", "user_id", userId);
    await deleteWhere(adminClient, "push_subscriptions", "user_id", userId);

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteUserError) throw deleteUserError;

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("[DELETE_ACCOUNT_ERROR]", error);
    return jsonResponse({ error: "We could not delete your account just now. Please try again in a moment." }, 500);
  }
});
