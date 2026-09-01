import { supabase } from "../../lib/supabaseClient.js";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the environment.");
  }
  return supabase;
}

function isDemoMode() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("MYBISHBASH_DEMO_MODE") === "true";
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

async function attachSignedScreenshotUrls(client, reports = []) {
  return Promise.all(reports.map(async (report) => {
    const attachments = await Promise.all((report.tester_report_attachments ?? []).map(async (attachment) => {
      if (!attachment.storage_path) return attachment;
      const { data } = await client.storage
        .from("tester-report-uploads")
        .createSignedUrl(attachment.storage_path, 60 * 60);
      return {
        ...attachment,
        public_url: data?.signedUrl ?? attachment.public_url ?? null,
      };
    }));
    return { ...report, tester_report_attachments: attachments };
  }));
}

function getTestPilotErrorMessage(error, fallback) {
  if (error?.code === "PGRST205" || /Could not find the table/i.test(error?.message ?? "")) {
    return "Supabase is connected, but the TestPilot tables are not installed yet. Apply the Supabase migration, then try again.";
  }
  if (error?.code === "42501" || /permission denied/i.test(error?.message ?? "")) {
    return "Supabase is connected, but Tester Mode does not have permission for that action. Check the migration and RLS policies.";
  }
  if (error?.message) return error.message;
  return fallback;
}

export function buildTesterReportPayload(report = {}) {
  return {
    user_id: report.userId,
    report_type: report.reportType ?? "bug",
    title: report.title?.trim() || null,
    description: report.description?.trim(),
    expected: report.expected?.trim() || null,
    actual: report.actual?.trim() || null,
    severity: report.severity ?? "medium",
    frequency: report.frequency ?? null,
    route: report.route ?? report.diagnostics?.route ?? null,
    launcher_context: report.launcherContext ?? report.diagnostics?.launcherContext ?? null,
    display_mode: report.displayMode ?? report.diagnostics?.displayMode ?? null,
    device_summary: report.deviceSummary ?? null,
    app_version: report.appVersion ?? report.diagnostics?.appVersion ?? null,
    diagnostics_json: report.diagnostics ?? {},
    screenshot_urls: normalizeArray(report.screenshotUrls),
  };
}

export async function fetchTesterStatus(userId) {
  if (isDemoMode()) return { is_tester: false };
  if (!userId) return { is_tester: false };
  const client = requireSupabase();
  const { data, error } = await client
    .from("user_profiles")
    .select("user_id,is_tester,tester_group,tester_enabled_at,tester_notes")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") return { is_tester: false };
    throw error;
  }
  return data ?? { is_tester: false };
}

export async function createTesterReport(report) {
  const client = requireSupabase();
  const payload = buildTesterReportPayload(report);
  if (!payload.user_id) throw new Error("A signed-in tester is required.");
  if (!payload.description) throw new Error("Tell us what happened first.");

  const { data, error } = await client
    .from("tester_reports")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(getTestPilotErrorMessage(error, "Could not submit tester report."));
  return data;
}

export async function uploadTesterScreenshot(file, userId, reportId) {
  if (!file || !userId || !reportId) return null;
  const client = requireSupabase();
  const extension = file.name?.split(".").pop() || "png";
  const storagePath = `${userId}/${reportId}/${Date.now()}.${extension}`;
  const { data, error } = await client.storage
    .from("tester-report-uploads")
    .upload(storagePath, file, { upsert: false, contentType: file.type || "application/octet-stream" });
  if (error) throw new Error(getTestPilotErrorMessage(error, "Could not upload screenshot."));

  const { data: signed } = await client.storage.from("tester-report-uploads").createSignedUrl(storagePath, 60 * 60);
  const publicUrl = signed?.signedUrl ?? null;
  const { error: attachmentError } = await client.from("tester_report_attachments").insert({
    report_id: reportId,
    user_id: userId,
    storage_path: data?.path ?? storagePath,
    public_url: publicUrl,
    mime_type: file.type || null,
  });
  if (attachmentError) console.warn("Could not store tester attachment row", attachmentError);
  return { storagePath: data?.path ?? storagePath, publicUrl };
}

export async function fetchMyTesterReports(userId) {
  if (!userId) return [];
  const client = requireSupabase();
  const { data, error } = await client
    .from("tester_reports")
    .select("*, tester_report_attachments(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(getTestPilotErrorMessage(error, "Could not load tester reports."));
  return attachSignedScreenshotUrls(client, data ?? []);
}

export async function fetchAdminTesterReports(filters = {}) {
  const client = requireSupabase();
  let query = client
    .from("tester_reports")
    .select("*, tester_report_attachments(*)")
    .order("created_at", { ascending: false })
    .limit(250);

  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.severity && filters.severity !== "all") query = query.eq("severity", filters.severity);
  if (filters.reportType && filters.reportType !== "all") query = query.eq("report_type", filters.reportType);
  if (filters.launcher && filters.launcher !== "all") query = query.eq("launcher_context", filters.launcher);
  if (filters.device) query = query.ilike("device_summary", `%${filters.device}%`);

  const { data, error } = await query;
  if (error) throw new Error(getTestPilotErrorMessage(error, "Could not load tester reports."));
  const rows = await attachSignedScreenshotUrls(client, data ?? []);
  const userIds = Array.from(new Set(rows.map((report) => report.user_id).filter(Boolean)));
  let profilesById = new Map();
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await client
      .from("user_profiles")
      .select("user_id,email,tester_group")
      .in("user_id", userIds);
    if (!profilesError) {
      profilesById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
    }
  }
  const mergedRows = rows.map((report) => ({
    ...report,
    user_profiles: profilesById.get(report.user_id) ?? null,
  }));

  const search = filters.search?.trim().toLowerCase();
  if (!search) return mergedRows;
  return mergedRows.filter((report) =>
    [
      report.title,
      report.description,
      report.user_profiles?.email,
      report.launcher_context,
      report.device_summary,
    ].filter(Boolean).join(" ").toLowerCase().includes(search)
  );
}

export async function updateTesterReportStatus(reportId, updates) {
  const client = requireSupabase();
  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
  };
  if (["fixed", "closed", "not_reproducible"].includes(updates.status)) {
    payload.resolved_at = new Date().toISOString();
  }
  const { data, error } = await client
    .from("tester_reports")
    .update(payload)
    .eq("id", reportId)
    .select("*")
    .single();
  if (error) throw new Error(getTestPilotErrorMessage(error, "Could not update tester report."));
  return data;
}

export async function updateTesterUser(userId, testerFields) {
  const client = requireSupabase();
  // Tester changes go through the audited security-definer RPC; direct
  // user_profiles writes to tester columns are no longer granted.
  const { data, error } = await client.rpc("hq_set_tester_status", {
    p_user_id: userId,
    p_is_tester: testerFields.is_tester === true,
    p_tester_group: testerFields.tester_group ?? null,
    p_tester_notes: testerFields.tester_notes ?? null,
  });
  if (error) throw new Error(getTestPilotErrorMessage(error, "Could not update tester user."));
  return data;
}
