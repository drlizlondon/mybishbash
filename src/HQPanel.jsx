import { useEffect, useMemo, useState, useCallback, useRef, memo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  deleteAdminGlobalPack,
  fetchAdminAnalytics,
  fetchAdminGlobalPacks,
  fetchAdminLauncherConfigs,
  fetchAdminLiveActivity,
  fetchAdminUsers,
  saveAdminGlobalPack,
  saveAdminLauncherConfig,
} from "./lib/mybishbashSync";
import {
  fetchAdminTesterReports,
  updateTesterReportStatus,
  updateTesterUser,
} from "./testing/TestPilot";
import { FAKE_APP_LAUNCHERS, mergeLauncherConfigs, normalizeLauncherOverride } from "./lib/launcherRegistry";
import { THEMES } from "./utils";

const EMPTY_PACK_FORM = {
  id: null,
  title: "",
  description: "",
  theme: "Minimal",
  published: false,
  importText: "",
};

const NAV_ITEMS = [
  "recruitment",
  "live",
  "launchers",
  "retention",
  "tester_reports",
  "users",
  "packs",
  "analytics",
  "events",
  "settings",
];

const NAV_LABELS = {
  recruitment: "Recruitment Funnel",
  live: "Live Activity",
  launchers: "Launcher Performance",
  retention: "User Retention",
  tester_reports: "Tester Reports",
  users: "User Timelines",
  packs: "Packs",
  analytics: "Advanced Analytics",
  events: "Events",
  settings: "Settings",
};

const HQ_VIEW_STORAGE_KEY = "mybishbash:hq-active-view";

function isValidHQView(view) {
  return NAV_ITEMS.includes(view);
}

function getInitialHQView() {
  if (typeof window === "undefined") return "recruitment";
  const params = new URLSearchParams(window.location.search);
  const viewFromUrl = params.get("view");
  if (isValidHQView(viewFromUrl)) return viewFromUrl;
  const storedView = window.localStorage.getItem(HQ_VIEW_STORAGE_KEY);
  return isValidHQView(storedView) ? storedView : "recruitment";
}

const TELEMETRY_BLUE = "#2563eb";
const TELEMETRY_GREEN = "#059669";
const TELEMETRY_AMBER = "#d97706";
const TELEMETRY_NAVY = "#0f172a";
const LIVE_ACTIVITY_REFRESH_MS = 30 * 1000;

function useRenderDiagnostics(componentName) {
  const renderCount = useRef(0);
  useEffect(() => {
    if (import.meta.env.DEV) {
      renderCount.current += 1;
      console.log(`[Diagnostics] ${componentName} rendered ${renderCount.current} times`);
    }
  });
}

function useStableAnalytics({ isAdmin, setStatus, paused, suppressed }) {
  const [analytics, setAnalytics] = useState({ summary: [], recent: [], launcherEvents: [], waitlist: [], testerReports: [] });
  const [isPolling, setIsPolling] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const hasLoadedRef = useRef(false);

  const refreshAnalytics = useCallback(async ({ manual = false } = {}) => {
    if (!isAdmin) return;
    if (!manual && (paused || suppressed)) return;
    try {
      setIsPolling(true);
      const analyticsResult = await fetchAdminAnalytics();
      setAnalytics((current) => (JSON.stringify(current) === JSON.stringify(analyticsResult) ? current : analyticsResult));
      setLastUpdated(new Date());
      setStatus("");
    } catch (error) {
      setStatus(error?.message ?? "Could not load telemetry.");
    } finally {
      setIsPolling(false);
    }
  }, [isAdmin, paused, setStatus, suppressed]);

  useEffect(() => {
    if (!isAdmin || hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    refreshAnalytics({ manual: true });
  }, [refreshAnalytics, isAdmin]);

  useEffect(() => {
    if (!isAdmin || paused || suppressed) return undefined;
    const intervalId = window.setInterval(() => refreshAnalytics(), 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [refreshAnalytics, isAdmin, paused, suppressed]);

  return { analytics, refreshAnalytics, isPolling, lastUpdated };
}

function useLiveActivityStream({ enabled, setStatus }) {
  const [events, setEvents] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  const refreshLiveActivity = useCallback(async () => {
    if (!enabled) return;
    try {
      const result = await fetchAdminLiveActivity();
      const normalizedEvents = [
        ...normalizeEvents(result.recent),
        ...normalizeLauncherEvents(result.launcherEvents).map(mapLauncherEventToOperationalEvent),
      ]
        .filter(Boolean)
        .map(normalizeOperationalEvent)
        .filter(isMeaningfulEvent)
        .map((event) => ({ ...event, displayLabel: getEventDisplayLabel(event) }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 100);

      setEvents((current) => {
        const existingIds = new Set(current.map((event) => event.id));
        const newEvents = normalizedEvents.filter((event) => !existingIds.has(event.id));
        if (newEvents.length === 0) return current;
        return [...newEvents, ...current].slice(0, 120);
      });
      setLastUpdated(new Date());
    } catch (error) {
      setStatus?.(error?.message ?? "Could not load live activity.");
    }
  }, [enabled, setStatus]);

  useEffect(() => {
    refreshLiveActivity();
  }, [refreshLiveActivity]);

  useEffect(() => {
    if (!enabled) return undefined;
    const intervalId = window.setInterval(refreshLiveActivity, LIVE_ACTIVITY_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [enabled, refreshLiveActivity]);

  return { events, lastUpdated, refreshLiveActivity };
}

export default function HQPanel({
  isAdmin,
  session,
  libraryPacks = [],
  interruptionPacks = [],
  onGlobalPacksChanged,
  onBack,
}) {
  const [activeView, setActiveView] = useState(getInitialHQView);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncViewFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const nextView = params.get("view");
      if (isValidHQView(nextView)) setActiveView(nextView);
    };
    window.addEventListener("popstate", syncViewFromLocation);
    return () => window.removeEventListener("popstate", syncViewFromLocation);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HQ_VIEW_STORAGE_KEY, activeView);
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get("view") === activeView) return;
    currentUrl.searchParams.set("view", activeView);
    window.history.replaceState(null, "", currentUrl);
  }, [activeView]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto mt-24 max-w-md rounded-2xl border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-200">MyBishBash HQ</p>
          <h2 className="mt-3 text-2xl font-semibold">Not authorised</h2>
          <p className="mt-2 text-sm text-slate-300">You must be an admin to view this telemetry surface.</p>
          <button className="mt-6 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white" onClick={onBack}>
            Back home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe_0,#f8fbff_38%,#ffffff_70%)] text-slate-950">
      <div className="flex min-h-screen">
        <HQSidebar activeView={activeView} onNavigate={setActiveView} />
        <HQContent
          activeView={activeView}
          onNavigate={setActiveView}
          isAdmin={isAdmin}
          session={session}
          libraryPacks={libraryPacks}
          interruptionPacks={interruptionPacks}
          onGlobalPacksChanged={onGlobalPacksChanged}
          onBack={onBack}
        />
      </div>
      <HQMobileNav activeView={activeView} onNavigate={setActiveView} />
    </div>
  );
}

const HQContent = memo(function HQContent({
  activeView,
  onNavigate,
  isAdmin,
  session,
  libraryPacks,
  interruptionPacks,
  onGlobalPacksChanged,
  onBack,
}) {
  useRenderDiagnostics("HQContent");

  const [adminPacks, setAdminPacks] = useState([]);
  const [launcherConfigs, setLauncherConfigs] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [range, setRange] = useState("7d");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [expandedEventId, setExpandedEventId] = useState(null);
  const [packForm, setPackForm] = useState(EMPTY_PACK_FORM);
  const [loadingStatic, setLoadingStatic] = useState(false);
  const [status, setStatus] = useState("");
  const [pauseTelemetryUpdates, setPauseTelemetryUpdates] = useState(false);
  const [liveActivityPaused, setLiveActivityPaused] = useState(false);
  const isEditingPack = Boolean(packForm.id || packForm.title || packForm.description || packForm.importText || packForm.published);
  const suppressBackgroundRefresh = isEditingPack || Boolean(expandedEventId);

  const { analytics, refreshAnalytics, isPolling, lastUpdated } = useStableAnalytics({
    isAdmin,
    setStatus,
    paused: pauseTelemetryUpdates,
    suppressed: suppressBackgroundRefresh,
  });

  const loadStaticData = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingStatic(true);
    setStatus("");
    try {
      const [packsResult, usersResult] = await Promise.all([
        fetchAdminGlobalPacks(),
        fetchAdminUsers(),
      ]);
      setAdminPacks(packsResult);
      setUsers(usersResult);
      fetchAdminLauncherConfigs()
        .then(setLauncherConfigs)
        .catch((error) => console.warn("Could not load HQ launcher configs", error));
    } catch (error) {
      setStatus(error?.message ?? "Could not load HQ data.");
    } finally {
      setLoadingStatic(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadStaticData();
  }, [loadStaticData]);

  useEffect(() => {
    if (!isAdmin || pauseTelemetryUpdates || suppressBackgroundRefresh) return undefined;
    const intervalId = window.setInterval(loadStaticData, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [isAdmin, loadStaticData, pauseTelemetryUpdates, suppressBackgroundRefresh]);

  const handleRefreshData = useCallback(async () => {
    await Promise.all([loadStaticData(), refreshAnalytics({ manual: true })]);
  }, [loadStaticData, refreshAnalytics]);

  const telemetry = useMemo(
    () => buildTelemetryModel({
      summary: analytics.summary,
      recent: analytics.recent,
      launcherEvents: analytics.launcherEvents,
      users,
      adminPacks,
      libraryPacks,
      interruptionPacks,
      range,
      waitlist: analytics.waitlist,
      testerReports: analytics.testerReports,
    }),
    [analytics.summary, analytics.recent, analytics.launcherEvents, analytics.waitlist, analytics.testerReports, users, adminPacks, libraryPacks, interruptionPacks, range],
  );

  const mergedLaunchers = useMemo(() => mergeLauncherConfigs(launcherConfigs), [launcherConfigs]);

  const handleSaveLauncherConfig = useCallback(async (config) => {
    setLoadingStatic(true);
    setStatus("");
    try {
      const saved = await saveAdminLauncherConfig({ id: config.id, ...normalizeLauncherOverride(config) }, session?.user?.id);
      setLauncherConfigs((current) => {
        const rest = current.filter((item) => item.id !== saved.id);
        return [...rest, saved];
      });
      setStatus("Launcher config saved.");
    } catch (error) {
      setStatus(error?.message ?? "Could not save launcher config.");
    } finally {
      setLoadingStatic(false);
    }
  }, [session?.user?.id]);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return telemetry.events.filter((event) => {
      const matchesType = eventTypeFilter === "all" || event.event_type === eventTypeFilter;
      if (!matchesType) return false;
      if (!query) return true;
      return [
        event.event_type,
        event.user_id,
        event.launcher_context,
        event.target_app,
        event.pack_id,
        event.card_title,
        event.card_text,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [eventTypeFilter, search, telemetry.events]);

  const handleSavePack = useCallback(async (event) => {
    event.preventDefault();
    const entries = parseImportedCards(packForm.importText);

    if (!packForm.title.trim()) {
      setStatus("Add a pack title first.");
      return;
    }

    setLoadingStatic(true);
    setStatus("");
    try {
      await saveAdminGlobalPack(
        {
          id: packForm.id,
          title: packForm.title.trim(),
          description: packForm.description.trim(),
          theme: packForm.theme,
          published: packForm.published,
          entries,
        },
        session?.user?.id,
      );
      setPackForm(EMPTY_PACK_FORM);
      await loadStaticData();
      await refreshAnalytics();
      await onGlobalPacksChanged?.();
      setStatus("Pack deployment saved.");
    } catch (error) {
      setStatus(error?.message ?? "Could not save pack.");
    } finally {
      setLoadingStatic(false);
    }
  }, [packForm, session?.user?.id, loadStaticData, refreshAnalytics, onGlobalPacksChanged]);

  const handleTogglePublished = useCallback(async (pack) => {
    setLoadingStatic(true);
    setStatus("");
    try {
      await saveAdminGlobalPack({ ...pack, published: !pack.published }, session?.user?.id);
      await loadStaticData();
      await refreshAnalytics();
      await onGlobalPacksChanged?.();
      setStatus(pack.published ? "Pack moved to draft." : "Pack published.");
    } catch (error) {
      setStatus(error?.message ?? "Could not update pack.");
    } finally {
      setLoadingStatic(false);
    }
  }, [session?.user?.id, loadStaticData, refreshAnalytics, onGlobalPacksChanged]);

  const handleDeletePack = useCallback(async (pack) => {
    if (!window.confirm(`Delete "${pack.title}"? Published users will stop seeing it after refresh.`)) return;
    setLoadingStatic(true);
    setStatus("");
    try {
      await deleteAdminGlobalPack(pack.id);
      if (packForm.id === pack.id) setPackForm(EMPTY_PACK_FORM);
      await loadStaticData();
      await refreshAnalytics();
      await onGlobalPacksChanged?.();
      setStatus("Pack deleted.");
    } catch (error) {
      setStatus(error?.message ?? "Could not delete pack.");
    } finally {
      setLoadingStatic(false);
    }
  }, [packForm.id, loadStaticData, refreshAnalytics, onGlobalPacksChanged]);

  const editPack = useCallback((pack) => {
    setPackForm({
      id: pack.id,
      title: pack.title ?? "",
      description: pack.description ?? "",
      theme: pack.theme ?? "Minimal",
      published: Boolean(pack.published),
      importText: pack.entries?.map(formatImportedCard).join("\n") ?? "",
    });
    onNavigate("packs");
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, [onNavigate]);

  const loading = loadingStatic || isPolling;

  return (
    <main className="min-w-0 flex-1 pb-28 lg:pb-10">
      <TelemetryTopBar
        loading={loading}
        status={status}
        range={range}
        setRange={setRange}
        search={search}
        setSearch={setSearch}
        onBack={onBack}
        onRefreshData={handleRefreshData}
        pauseTelemetryUpdates={pauseTelemetryUpdates}
        setPauseTelemetryUpdates={setPauseTelemetryUpdates}
        liveActivityPaused={liveActivityPaused}
        setLiveActivityPaused={setLiveActivityPaused}
        lastUpdated={lastUpdated}
        suppressBackgroundRefresh={suppressBackgroundRefresh}
        eventTypes={telemetry.eventTypes}
        eventTypeFilter={eventTypeFilter}
        setEventTypeFilter={setEventTypeFilter}
      />

      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {activeView === "recruitment" ? <RecruitmentPage telemetry={telemetry} /> : null}
        {activeView === "live" ? <LiveActivityPage fallbackEvents={telemetry.meaningfulEvents} paused={liveActivityPaused || pauseTelemetryUpdates} setStatus={setStatus} /> : null}
        {activeView === "launchers" ? (
          <LaunchersPage
            telemetry={telemetry}
            launchers={mergedLaunchers}
            interruptionPacks={interruptionPacks}
            onSaveLauncherConfig={handleSaveLauncherConfig}
            loading={loading}
          />
        ) : null}
        {activeView === "retention" ? <RetentionPage telemetry={telemetry} /> : null}
        {activeView === "tester_reports" ? <TesterReportsPage /> : null}
        {activeView === "users" ? <UsersPage users={users} telemetry={telemetry} onUserUpdated={loadStaticData} setStatus={setStatus} /> : null}
        {activeView === "analytics" ? <AnalyticsPage telemetry={telemetry} /> : null}
        {activeView === "events" ? (
          <EventsPage
            events={filteredEvents}
            expandedEventId={expandedEventId}
            setExpandedEventId={setExpandedEventId}
          />
        ) : null}
        {activeView === "packs" ? (
          <PacksPage
            adminPacks={adminPacks}
            telemetry={telemetry}
            packForm={packForm}
            setPackForm={setPackForm}
            handleSavePack={handleSavePack}
            handleTogglePublished={handleTogglePublished}
            handleDeletePack={handleDeletePack}
            editPack={editPack}
            loading={loading}
          />
        ) : null}
        {activeView === "settings" ? <SettingsPage onRefresh={() => { loadStaticData(); refreshAnalytics(); }} onBack={onBack} loading={loading} /> : null}
      </div>
    </main>
  );
});

const HQSidebar = memo(function HQSidebar({ activeView, onNavigate }) {
  useRenderDiagnostics("HQSidebar");
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-blue-100/80 bg-white/80 px-4 py-5 shadow-[18px_0_50px_rgba(15,23,42,0.04)] backdrop-blur-xl lg:block">
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-slate-950 to-blue-950 p-4 text-white shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">MyBishBash</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">HQ</h1>
        <p className="mt-2 text-xs text-blue-100">Behavioural adoption console</p>
      </div>
      <nav className="mt-5 space-y-1" aria-label="HQ sections">
        {NAV_ITEMS.map((item) => (
          <button
            key={item}
            type="button"
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
              activeView === item
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                : "text-slate-600 hover:bg-blue-50 hover:text-slate-950"
            }`}
            onClick={() => onNavigate(item)}
          >
            <span>{NAV_LABELS[item] ?? item}</span>
            <span className={`h-1.5 w-1.5 rounded-full ${activeView === item ? "bg-white" : "bg-blue-300"}`} />
          </button>
        ))}
      </nav>
    </aside>
  );
});

const HQMobileNav = memo(function HQMobileNav({ activeView, onNavigate }) {
  useRenderDiagnostics("HQMobileNav");
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-blue-100 bg-white/95 px-2 py-2 shadow-2xl backdrop-blur lg:hidden" aria-label="HQ mobile sections">
      <div className="grid grid-cols-5 gap-1">
        {["recruitment", "live", "launchers", "tester_reports", "users"].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onNavigate(item)}
            className={`rounded-xl px-2 py-2 text-[10px] font-semibold ${
              activeView === item ? "bg-blue-600 text-white" : "text-slate-600"
            }`}
          >
            {NAV_LABELS[item]?.replace(" ", "\n") ?? item}
          </button>
        ))}
      </div>
    </nav>
  );
});

const TelemetryTopBar = memo(function TelemetryTopBar({
  loading,
  status,
  range,
  setRange,
  search,
  setSearch,
  onBack,
  onRefreshData,
  pauseTelemetryUpdates,
  setPauseTelemetryUpdates,
  liveActivityPaused,
  setLiveActivityPaused,
  lastUpdated,
  suppressBackgroundRefresh,
  eventTypes,
  eventTypeFilter,
  setEventTypeFilter,
}) {
  useRenderDiagnostics("TelemetryTopBar");
  const livePaused = liveActivityPaused || pauseTelemetryUpdates;
  return (
    <header className="sticky top-0 z-30 border-b border-blue-100/80 bg-white/80 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">MyBishBash HQ</h2>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <span className={`h-2 w-2 rounded-full ${livePaused ? "bg-slate-400" : "bg-emerald-500"}`} />
              {livePaused ? "Live Paused" : "Live On"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Early-access recruitment, onboarding conversion, and behavioural adoption. {status || (suppressBackgroundRefresh ? "Background refresh paused while reviewing." : "Operational")}
          </p>
        </div>
        <div className="grid gap-2 xl:w-[840px]">
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-blue-100 bg-white/70 p-2 shadow-sm">
            <button
              type="button"
              onClick={() => setLiveActivityPaused((current) => !current)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-200 hover:text-blue-700"
            >
              {livePaused ? "○ Live Paused" : "● Live On"}
            </button>
            <button
              type="button"
              onClick={onRefreshData}
              disabled={loading}
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-50"
            >
              Refresh Data
            </button>
            <button
              type="button"
              onClick={() => setPauseTelemetryUpdates((current) => !current)}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                pauseTelemetryUpdates
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700"
              }`}
            >
              {pauseTelemetryUpdates ? "Resume Updates" : "Pause Updates"}
            </button>
            <span className="text-xs font-medium text-slate-500">
              Last updated: {formatDateTime(lastUpdated)}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_130px_170px_auto]">
          <label className="sr-only" htmlFor="hq-search">Search telemetry</label>
          <input
            id="hq-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search event, launcher, user"
            className="h-10 rounded-xl border border-blue-100 bg-white/85 px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
          <select
            value={range}
            onChange={(event) => setRange(event.target.value)}
            className="h-10 rounded-xl border border-blue-100 bg-white/85 px-3 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            aria-label="Date range"
          >
            <option value="24h">24h</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
          </select>
          <select
            value={eventTypeFilter}
            onChange={(event) => setEventTypeFilter(event.target.value)}
            className="h-10 rounded-xl border border-blue-100 bg-white/85 px-3 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            aria-label="Event type filter"
          >
            <option value="all">All event types</option>
            {eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <button type="button" onClick={onBack} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:border-blue-200 hover:text-blue-700">
            Exit
          </button>
          </div>
        </div>
      </div>
    </header>
  );
});

const SectionHeader = memo(function SectionHeader({ title, subtitle }) {
  useRenderDiagnostics("SectionHeader");
  return (
    <div className="rounded-2xl border border-blue-100 bg-white/75 px-4 py-3 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
      <h3 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
});

const RecruitmentPage = memo(function RecruitmentPage({ telemetry }) {
  useRenderDiagnostics("RecruitmentPage");
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {telemetry.heroMetrics.map((metric) => <HeroMetricCard key={metric.label} metric={metric} />)}
      </section>
      <FunnelPanel funnel={telemetry.funnel} />
      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <LiveActivityList events={telemetry.meaningfulEvents.slice(0, 8)} />
        <RetentionSnapshot telemetry={telemetry} />
      </section>
    </div>
  );
});

const LiveActivityPage = memo(function LiveActivityPage({ fallbackEvents, paused, setStatus }) {
  useRenderDiagnostics("LiveActivityPage");
  const { events, lastUpdated } = useLiveActivityStream({ enabled: !paused, setStatus });
  const displayEvents = events.length > 0 ? events : fallbackEvents;
  return (
    <div className="space-y-5">
      <SectionHeader
        title="Live Activity"
        subtitle={`${paused ? "Live stream paused" : "Live stream isolated from analytics"} · Last live update: ${formatDateTime(lastUpdated)}`}
      />
      <LiveActivityList events={displayEvents} large />
    </div>
  );
});

const RetentionPage = memo(function RetentionPage({ telemetry }) {
  useRenderDiagnostics("RetentionPage");
  return (
    <div className="space-y-5">
      <SectionHeader
        title="User Retention"
        subtitle="Repeated behavioural use, return sessions, and launcher adoption gaps."
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Daily active users" value={telemetry.retention.dailyActiveUsers} />
        <MiniStat label="7-day return users" value={telemetry.retention.returnUsers7d} />
        <MiniStat label="Avg interruptions / user" value={telemetry.retention.avgInterruptionsPerUser} />
        <MiniStat label="Avg actions completed" value={telemetry.retention.avgActionsCompleted} />
        <MiniStat label="Most active launcher" value={telemetry.retention.mostActiveLauncher} />
        <MiniStat label="Installed, no interruption" value={telemetry.retention.installedNoInterruption} />
        <MiniStat label="Saw interruption, no Do Something Else" value={telemetry.retention.interruptionNoAction} />
        <MiniStat label="Repeat users (7d)" value={telemetry.retention.repeatUsers7d} />
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <SparklineCard title="Daily Active Users" data={telemetry.activeUsersOverTime} dataKey="users" />
        <DistributionPanel title="Most Active Launchers" rows={telemetry.topLaunchers} />
      </section>
    </div>
  );
});

const AnalyticsPage = memo(function AnalyticsPage({ telemetry }) {
  useRenderDiagnostics("AnalyticsPage");
  return (
    <div className="space-y-5">
      <SectionHeader
        title="Telemetry Analytics"
        subtitle="Measured event trends, launcher frequency, notification delivery, and pack activation counts."
      />
      <section className="grid gap-4 xl:grid-cols-2">
        <TelemetryChart
          title="Continue-to-App Trend"
          subtitle="Measured continuation events by time bucket"
          data={telemetry.interventionsOverTime}
          lines={[{ key: "continueToApp", color: TELEMETRY_AMBER, name: "Continue to app" }]}
        />
        <TelemetryChart
          title="Do Something Else Trend"
          subtitle="Measured Do Something Else events by time bucket"
          data={telemetry.interventionsOverTime}
          lines={[{ key: "doSomethingElse", color: TELEMETRY_GREEN, name: "Do Something Else" }]}
        />
      </section>
      <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <BarPanel title="Interruptions By Hour" data={telemetry.interruptionsByHour} xKey="hour" yKey="count" />
        <BarPanel title="Launcher Event Frequency" data={telemetry.topLaunchers} xKey="label" yKey="count" />
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <TelemetryChart
          title="Pack Activation Trend"
          subtitle="pack_activated events by time bucket"
          data={telemetry.packActivationTrend}
          lines={[{ key: "activations", color: TELEMETRY_BLUE, name: "Pack activations" }]}
        />
        <TelemetryChart
          title="Notification Delivery vs Interaction"
          subtitle="Notification event types grouped by time bucket"
          data={telemetry.notificationTrend}
          lines={[
            { key: "delivered", color: TELEMETRY_BLUE, name: "Delivery events" },
            { key: "interactions", color: TELEMETRY_GREEN, name: "Interaction events" },
          ]}
        />
      </section>
    </div>
  );
});

const FunnelPanel = memo(function FunnelPanel({ funnel }) {
  useRenderDiagnostics("FunnelPanel");
  return (
    <GlassPanel title="Recruitment Funnel" subtitle="Waitlist to action-card completion">
      {funnel.every((stage) => stage.count === 0) ? (
        <EmptyState title="Recruitment data will appear here." body="Waiting for first onboarding sessions." />
      ) : (
        <div className="grid gap-2">
          {funnel.map((stage, index) => (
            <div key={stage.label}>
              <div className="grid gap-3 rounded-2xl border border-blue-100 bg-white/75 p-3 sm:grid-cols-[1fr_92px_96px_92px] sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{stage.label}</p>
                  <div className="mt-2 h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.max(stage.conversion, stage.count > 0 ? 6 : 0)}%` }} />
                  </div>
                </div>
                <MetricPill label="Count" value={stage.count} />
                <MetricPill label="Conv." value={`${stage.conversion}%`} />
                <MetricPill label="Drop-off" value={`${stage.dropoff}%`} />
              </div>
              {index < funnel.length - 1 ? <div className="ml-5 h-4 border-l border-blue-200" /> : null}
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
});

const MetricPill = memo(function MetricPill({ label, value }) {
  return (
    <div className="rounded-xl bg-blue-50 px-3 py-2 text-right">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <strong className="text-sm text-slate-950">{value}</strong>
    </div>
  );
});

const LiveActivityList = memo(function LiveActivityList({ events, large = false }) {
  useRenderDiagnostics("LiveActivityList");
  const scrollRef = useRef(null);
  const previousScrollHeightRef = useRef(0);
  const wasAtLatestRef = useRef(true);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const previousHeight = previousScrollHeightRef.current;
    const nextHeight = node.scrollHeight;
    if (!wasAtLatestRef.current && previousHeight > 0) {
      node.scrollTop += nextHeight - previousHeight;
    } else if (wasAtLatestRef.current) {
      node.scrollTop = 0;
    }
    previousScrollHeightRef.current = nextHeight;
  }, [events]);

  return (
    <GlassPanel title="Live Activity" subtitle="Founder-level product moments">
      {events.length === 0 ? (
        <EmptyState title="No live telemetry yet." body="Waiting for first meaningful product moments." />
      ) : (
        <div
          ref={scrollRef}
          onScroll={(event) => {
            wasAtLatestRef.current = event.currentTarget.scrollTop < 12;
          }}
          className={`grid gap-2 ${large ? "max-h-[720px] overflow-auto" : "max-h-[560px] overflow-auto"}`}
        >
          {events.map((event) => (
            <article key={event.id} className="rounded-2xl border border-blue-100 bg-white/82 p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{event.displayLabel}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">{formatTime(event.created_at)} · {pseudoUser(event.user_id || event.anonymous_device_id)}</p>
                </div>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  {event.launcher_context || event.launcher_id || event.target_app || "app"}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </GlassPanel>
  );
});

const RetentionSnapshot = memo(function RetentionSnapshot({ telemetry }) {
  useRenderDiagnostics("RetentionSnapshot");
  return (
    <GlassPanel title="Retention Snapshot" subtitle="Are people coming back and using the mechanic?">
      <div className="grid gap-2 sm:grid-cols-2">
        <MiniStat label="Daily active users" value={telemetry.retention.dailyActiveUsers} />
        <MiniStat label="7-day return users" value={telemetry.retention.returnUsers7d} />
        <MiniStat label="Avg interventions / user" value={telemetry.retention.avgInterruptionsPerUser} />
        <MiniStat label="Most active launcher" value={telemetry.retention.mostActiveLauncher} />
      </div>
    </GlassPanel>
  );
});

const EmptyState = memo(function EmptyState({ title, body }) {
  return (
    <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 p-6 text-center">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
    </div>
  );
});

const LaunchersPage = memo(function LaunchersPage({ telemetry, launchers = [], interruptionPacks = [], onSaveLauncherConfig, loading }) {
  useRenderDiagnostics("LaunchersPage");
  const [launcherFilter, setLauncherFilter] = useState("all");
  const [identityFilter, setIdentityFilter] = useState("all");
  const [displayFilter, setDisplayFilter] = useState("all");
  const supportedLauncherNames = FAKE_APP_LAUNCHERS.map((launcher) => launcher.displayName).join(", ");
  const launcherIds = Array.from(new Set(telemetry.events.map(getEventLauncher).filter(Boolean))).sort();
  const filtered = telemetry.events.filter((event) => {
    const launcherId = getEventLauncher(event);
    if (launcherFilter !== "all" && launcherId !== launcherFilter) return false;
    if (identityFilter === "logged-in" && !event.user_id) return false;
    if (identityFilter === "anonymous" && event.user_id) return false;
    if (displayFilter === "standalone" && !event.is_standalone) return false;
    if (displayFilter === "browser" && event.is_standalone) return false;
    return true;
  });
  const stats = buildLauncherStats(filtered);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Supported Launcher Performance"
        subtitle="Install views, installs, interruption opens, Do Something Else, Continue to app, and settings for supported launchers."
      />
      <GlassPanel title="Supported Launchers" subtitle={`HQ can edit supported code-reviewed launchers only: ${supportedLauncherNames}. New apps need a reviewed release because routing, install pages, manifests, interruption contexts and tests are still static-ID based. Static registry values remain the fallback if cloud config is unavailable; installed home-screen icons may require users to reinstall a launcher before icon changes appear.`}>
        <div className="grid gap-4 xl:grid-cols-3">
          {(launchers.length ? launchers : FAKE_APP_LAUNCHERS).map((launcher) => (
            <LauncherConfigCard
              key={launcher.id}
              launcher={launcher}
              interruptionPacks={interruptionPacks}
              onSave={onSaveLauncherConfig}
              loading={loading}
            />
          ))}
        </div>
      </GlassPanel>
      <div className="grid gap-2 md:grid-cols-3">
        <select value={launcherFilter} onChange={(event) => setLauncherFilter(event.target.value)} className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm">
          <option value="all">All launchers</option>
          {launcherIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
        <select value={identityFilter} onChange={(event) => setIdentityFilter(event.target.value)} className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm">
          <option value="all">Logged-in and anonymous</option>
          <option value="logged-in">Logged-in only</option>
          <option value="anonymous">Anonymous only</option>
        </select>
        <select value={displayFilter} onChange={(event) => setDisplayFilter(event.target.value)} className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm">
          <option value="all">Standalone and browser</option>
          <option value="standalone">Standalone only</option>
          <option value="browser">Browser only</option>
        </select>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Instagram install views" value={telemetry.instagramStats.installViews} />
        <MiniStat label="Instagram installs" value={telemetry.instagramStats.installs} />
        <MiniStat label="Interruption opens" value={stats.interruptionOpens} />
        <MiniStat label="Continue to app" value={stats.continueToApp} />
        <MiniStat label="Do Something Else" value={stats.doSomethingElse} />
        <MiniStat label="Do Something Else Rate" value={`${percent(stats.doSomethingElse, stats.resolved)}%`} />
        <MiniStat label="Continue To App Rate" value={`${percent(stats.continueToApp, stats.resolved)}%`} />
        <MiniStat label="Unique users/devices" value={stats.uniqueActors} />
      </section>
      <section className="grid gap-4 xl:grid-cols-3">
        <DistributionPanel title="Interruption Opens By Launcher" rows={stats.opensByLauncher} />
        <DistributionPanel title="Active Users By Launcher" rows={stats.activeUsersByLauncher} />
        <DistributionPanel title="Install Page Views" rows={stats.installViewsByLauncher} />
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <DistributionPanel title="Most Used Launcher Versions" rows={stats.mostUsedVersions} />
        <GlassPanel title="Recent Launcher Events" subtitle={`${filtered.length} rows in current filters`}>
          <div className="max-h-[460px] overflow-auto rounded-xl border border-slate-200">
            {filtered.slice(0, 100).map((event) => (
              <div key={event.id} className="grid gap-2 border-b border-slate-100 px-3 py-2 text-xs md:grid-cols-[120px_1fr_120px_120px]">
                <span className="font-mono text-slate-500">{formatTime(event.created_at)}</span>
                <span className="font-semibold text-slate-800">{getEventDisplayLabel(event)}</span>
                <span className="text-slate-600">{event.launcher_id}</span>
                <span className="text-slate-600">{event.app_display_mode || "unknown"}</span>
              </div>
            ))}
          </div>
        </GlassPanel>
      </section>
    </div>
  );
});

const EventsPage = memo(function EventsPage({ events, expandedEventId, setExpandedEventId }) {
  useRenderDiagnostics("EventsPage");
  return (
    <GlassPanel title="Live Event Stream" subtitle={`${events.length} events in current filter`}>
      {events.length === 0 ? (
        <EmptyState title="No live telemetry yet." body="Events will appear as early-access users move through setup and launchers." />
      ) : (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-slate-100 shadow-inner">
        <div className="grid grid-cols-[150px_1.1fr_0.9fr_0.8fr] border-b border-white/10 bg-white/5 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-400">
          <span>Timestamp</span>
          <span>Event Type</span>
          <span>Pseudonymous User ID</span>
          <span>Context</span>
        </div>
        <div className="max-h-[660px] overflow-auto">
          {events.map((event) => {
            const expanded = expandedEventId === event.id;
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => setExpandedEventId(expanded ? null : event.id)}
                className="block w-full border-b border-white/5 px-4 py-3 text-left font-mono text-xs transition hover:bg-blue-500/10 focus:bg-blue-500/10 focus:outline-none"
              >
                <div className="grid gap-2 md:grid-cols-[150px_1.1fr_0.9fr_0.8fr]">
                  <span className="text-slate-400">{formatTime(event.created_at)}</span>
                  <span className="font-semibold text-blue-200">{getEventDisplayLabel(event)}</span>
                  <span className="truncate text-slate-300">{pseudoUser(event.user_id)}</span>
                  <span className="truncate text-slate-300">{event.launcher_context || event.target_app || event.app_name || "none"}</span>
                </div>
                {expanded ? (
                  <pre className="mt-3 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] leading-5 text-slate-200">
                    Payload
                    {"\n"}
                    {JSON.stringify(event, null, 2)}
                  </pre>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      )}
    </GlassPanel>
  );
});

const LauncherConfigCard = memo(function LauncherConfigCard({ launcher, interruptionPacks, onSave, loading }) {
  const [form, setForm] = useState(() => launcher);

  useEffect(() => {
    setForm(launcher);
  }, [launcher]);

  const packOptions = interruptionPacks.filter((pack) => pack.targetApp === launcher.id || pack.linkedVersionId === launcher.id);
  const iconPreview = form.customIconSrc || form.iconSrc;
  const needsQa = form.enabled === false && form.hqVisible !== false;

  return (
    <article className="rounded-2xl border border-blue-100 bg-white/85 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {iconPreview ? <img src={iconPreview} alt="" className="h-12 w-12 rounded-xl object-cover" /> : <div className="h-12 w-12 rounded-xl bg-slate-100" />}
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">{launcher.id}</p>
          <h4 className="text-base font-semibold text-slate-950">{form.displayName || form.name}</h4>
          <p className="text-xs text-slate-500">{form.enabled ? "Live for users" : "Not live for users"} · {form.hqVisible ? "HQ visible" : "Hidden in HQ"}</p>
          {needsQa ? <p className="mt-1 text-xs font-semibold text-amber-700">Needs icon/device QA before enabling</p> : null}
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        <input value={form.displayName ?? ""} onChange={(event) => setForm({ ...form, displayName: event.target.value, name: event.target.value })} placeholder="Display name" className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm" />
        <input value={form.realAppLabel ?? ""} onChange={(event) => setForm({ ...form, realAppLabel: event.target.value })} placeholder="Real app label" className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm" />
        <input value={form.iconSrc ?? ""} onChange={(event) => setForm({ ...form, iconSrc: event.target.value })} placeholder="Default icon URL" className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm" />
        <input value={form.customIconSrc ?? ""} onChange={(event) => setForm({ ...form, customIconSrc: event.target.value })} placeholder="Uploaded icon URL" className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm" />
        <input value={form.iosAppUrl ?? ""} onChange={(event) => setForm({ ...form, iosAppUrl: event.target.value })} placeholder="iOS URL" className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm" />
        <input value={form.androidIntentUrl ?? ""} onChange={(event) => setForm({ ...form, androidIntentUrl: event.target.value })} placeholder="Android intent URL" className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm" />
        <input value={form.webFallbackUrl ?? ""} onChange={(event) => setForm({ ...form, webFallbackUrl: event.target.value })} placeholder="Web fallback URL" className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm" />
        <select value={form.interruptionPackId ?? ""} onChange={(event) => setForm({ ...form, interruptionPackId: event.target.value })} className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm">
          <option value="">Default interruption pack</option>
          {packOptions.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={Boolean(form.enabled)} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
          Enabled
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={Boolean(form.hqVisible)} onChange={(event) => setForm({ ...form, hqVisible: event.target.checked })} />
          HQ visible
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={Boolean(form.useInterruptionPack)} onChange={(event) => setForm({ ...form, useInterruptionPack: event.target.checked })} />
          Use interruption pack
        </label>
        <button type="button" disabled={loading} onClick={() => onSave?.(form)} className="mt-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Save launcher config
        </button>
      </div>
    </article>
  );
});

const PacksPage = memo(function PacksPage({
  adminPacks,
  telemetry,
  packForm,
  setPackForm,
  handleSavePack,
  handleTogglePublished,
  handleDeletePack,
  editPack,
  loading,
}) {
  useRenderDiagnostics("PacksPage");
  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <GlassPanel title={packForm.id ? "Edit Pack Deployment" : "Create Pack Deployment"} subtitle="Database-managed content object">
        <PackEditor form={packForm} setForm={setPackForm} onSubmit={handleSavePack} loading={loading} />
      </GlassPanel>
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          <MiniStat label="Live packs" value={telemetry.publishedPacks} />
          <MiniStat label="Draft packs" value={telemetry.draftPacks} />
          <MiniStat label="Cards indexed" value={telemetry.totalPackCards} />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {adminPacks.map((pack) => (
            <PackDeploymentCard
              key={pack.id}
              pack={pack}
              stats={telemetry.packStats.get(pack.id)}
              onEdit={editPack}
              onTogglePublished={handleTogglePublished}
              onDelete={handleDeletePack}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

const NotificationsPage = memo(function NotificationsPage({ telemetry }) {
  useRenderDiagnostics("NotificationsPage");
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <TelemetryChart
        title="Notification Interaction Rate"
        subtitle="Notification event counts by time bucket"
        data={telemetry.notificationTrend}
        lines={[
          { key: "delivered", color: TELEMETRY_BLUE, name: "Delivery events" },
          { key: "interactions", color: TELEMETRY_GREEN, name: "Interaction events" },
        ]}
      />
      <DistributionPanel title="Notification Event Types" rows={telemetry.notificationRows} />
    </div>
  );
});

const TesterReportsPage = memo(function TesterReportsPage() {
  useRenderDiagnostics("TesterReportsPage");
  const [reports, setReports] = useState([]);
  const [filters, setFilters] = useState({ status: "all", severity: "all", reportType: "all", launcher: "all", device: "", search: "" });
  const [expandedId, setExpandedId] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setStatus("");
    try {
      setReports(await fetchAdminTesterReports(filters));
    } catch (error) {
      setStatus(error?.message ?? "Could not load tester reports.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const launcherOptions = Array.from(new Set(reports.map((report) => report.launcher_context).filter(Boolean))).sort();

  async function saveReport(report, updates) {
    setStatus("Saving report...");
    try {
      await updateTesterReportStatus(report.id, updates);
      await loadReports();
      setStatus("Report updated.");
    } catch (error) {
      setStatus(error?.message ?? "Could not update report.");
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader title="Tester Reports" subtitle="Bugs, feedback, diagnostics, screenshots, and internal follow-up." />
      <GlassPanel title="Filters" subtitle="Narrow by status, severity, launcher, type, device, or text">
        <div className="grid gap-2 md:grid-cols-6">
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm">
            <option value="all">All status</option><option value="open">Open</option><option value="in_review">In review</option><option value="fixed">Fixed</option><option value="closed">Closed</option><option value="not_reproducible">Not reproducible</option>
          </select>
          <select value={filters.severity} onChange={(event) => setFilters({ ...filters, severity: event.target.value })} className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm">
            <option value="all">All severity</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="blocking">Blocking</option>
          </select>
          <select value={filters.reportType} onChange={(event) => setFilters({ ...filters, reportType: event.target.value })} className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm">
            <option value="all">All types</option><option value="bug">Bug</option><option value="feedback">Feedback</option><option value="confusion">Confusion</option><option value="idea">Idea</option>
          </select>
          <select value={filters.launcher} onChange={(event) => setFilters({ ...filters, launcher: event.target.value })} className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm">
            <option value="all">All launchers</option>
            {launcherOptions.map((launcher) => <option key={launcher} value={launcher}>{launcher}</option>)}
          </select>
          <input value={filters.device} onChange={(event) => setFilters({ ...filters, device: event.target.value })} placeholder="Device" className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm" />
          <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search" className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm" />
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
          <button type="button" onClick={loadReports} disabled={loading} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Refresh</button>
          {status || `${reports.length} reports`}
        </div>
      </GlassPanel>
      <div className="grid gap-4">
        {reports.length === 0 && !loading ? <EmptyState title="No tester reports yet." body="Submissions will appear here once testers use Tester Mode." /> : null}
        {reports.map((report) => (
          <TesterReportCard
            key={report.id}
            report={report}
            expanded={expandedId === report.id}
            onToggle={() => setExpandedId(expandedId === report.id ? null : report.id)}
            onSave={saveReport}
          />
        ))}
      </div>
    </div>
  );
});

const TesterReportCard = memo(function TesterReportCard({ report, expanded, onToggle, onSave }) {
  const [notes, setNotes] = useState(report.admin_notes ?? "");
  const screenshot = report.screenshot_urls?.[0] || report.tester_report_attachments?.[0]?.public_url;
  const userEmail = report.user_profiles?.email || pseudoUser(report.user_id);
  const testerGroup = report.user_profiles?.tester_group || "No tester group";

  useEffect(() => {
    setNotes(report.admin_notes ?? "");
  }, [report.admin_notes]);

  return (
    <GlassPanel title={report.title || report.description.slice(0, 90)} subtitle={`${userEmail} - ${testerGroup}`}>
      <div className="grid gap-4 lg:grid-cols-[120px_1fr]">
        <button type="button" onClick={onToggle} className="overflow-hidden rounded-xl border border-blue-100 bg-white text-left">
          {screenshot ? <img src={screenshot} alt="Tester screenshot" className="h-28 w-full object-cover" /> : <div className="grid h-28 place-items-center text-xs font-semibold text-slate-400">No screenshot</div>}
        </button>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{report.report_type}</span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{report.severity}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{report.status}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{report.launcher_context || "normal"}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{formatDate(report.created_at)}</span>
          </div>
          <p className="text-sm text-slate-700">{report.description}</p>
          {report.expected || report.actual ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <MiniStat label="Expected" value={report.expected || "Not provided"} />
              <MiniStat label="Actual" value={report.actual || "Not provided"} />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {["open", "in_review", "fixed", "closed", "not_reproducible"].map((nextStatus) => (
              <button key={nextStatus} type="button" onClick={() => onSave(report, { status: nextStatus, admin_notes: notes })} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${report.status === nextStatus ? "bg-blue-600 text-white" : "border border-blue-100 bg-white text-slate-700"}`}>
                {nextStatus.replace("_", " ")}
              </button>
            ))}
          </div>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Internal notes" rows={3} className="w-full rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm" />
          <button type="button" onClick={() => onSave(report, { status: report.status, admin_notes: notes })} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Save notes</button>
        </div>
      </div>
      {expanded ? (
        <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <div><strong>Route:</strong> {report.route || "Not captured"}</div>
          <div><strong>Display:</strong> {report.display_mode || "Not captured"}</div>
          <div><strong>Device:</strong> {report.device_summary || "Not captured"}</div>
          <pre className="max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100">{JSON.stringify(report.diagnostics_json ?? {}, null, 2)}</pre>
        </div>
      ) : null}
    </GlassPanel>
  );
});

const UsersPage = memo(function UsersPage({ users, telemetry, onUserUpdated, setStatus }) {
  useRenderDiagnostics("UsersPage");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);

  async function handleTesterUpdate(user, fields) {
    try {
      setStatus?.("Updating tester access...");
      await updateTesterUser(user.user_id, fields);
      await onUserUpdated?.();
      setStatus?.("Tester access updated.");
    } catch (error) {
      setStatus?.(error?.message ?? "Could not update tester access.");
    }
  }

  const enrichedUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    return users
      .map((user) => {
        const stats = telemetry.userStats.get(user.user_id) ?? {};
        const lastActivity = stats.lastMeaningfulActivityAt || user.last_meaningful_activity_at || stats.lastEventAt || user.last_seen_at || user.signed_up_at;
        const lastSeen = user.last_login_at || user.last_sign_in_at || user.last_seen_at;
        const searchable = [user.email, user.user_id, user.access_code, user.tester_group].filter(Boolean).join(" ").toLowerCase();
        return { user, stats, lastActivity, lastSeen, searchable };
      })
      .filter((item) => !query || item.searchable.includes(query))
      .sort((left, right) => new Date(right.lastActivity || 0).getTime() - new Date(left.lastActivity || 0).getTime());
  }, [telemetry.userStats, userSearch, users]);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="User Analytics"
        subtitle="Individual adoption paths: signup, onboarding, launcher install, interruptions, Do Something Else, and action-card completion."
      />
      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <input
          value={userSearch}
          onChange={(event) => setUserSearch(event.target.value)}
          placeholder="Search by email, user id, access code, or tester group"
          className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm"
        />
        <span className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm font-semibold text-slate-600">
          Sorted by last activity
        </span>
      </div>
      {users.length === 0 ? (
        <EmptyState title="No user records yet." body="User timelines will appear once early-access accounts are created." />
      ) : null}
      {users.length > 0 && enrichedUsers.length === 0 ? (
        <EmptyState title="No matching users." body="Try another email or user id." />
      ) : null}
      <div className="grid gap-4">
        {enrichedUsers.map(({ user, stats, lastActivity, lastSeen }) => {
          const usageStatus = getUserUsageStatus(stats);
          const activeBadge = getUserActivityBadge(lastActivity);
          const expanded = selectedUserId === user.user_id;
          return (
            <GlassPanel key={user.user_id} title={user.email || pseudoUser(user.user_id)} subtitle={`Pseudonymous user ${pseudoUser(user.user_id)}`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className={`rounded-full px-2.5 py-1 ${activeBadge.className}`}>{activeBadge.label}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{user.is_tester ? `Tester${user.tester_group ? ` · ${user.tester_group}` : ""}` : "Not tester"}</span>
                  <span className={`rounded-full px-2.5 py-1 ${user.has_access === false ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{user.has_access === false ? "No access" : "Access granted"}</span>
                </div>
                <button type="button" onClick={() => setSelectedUserId(expanded ? null : user.user_id)} className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-semibold text-blue-700">
                  {expanded ? "Hide timeline" : "View timeline"}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <MiniStat label="Usage status" value={usageStatus} />
                <MiniStat label="Created" value={formatDate(user.signed_up_at || user.created_at)} />
                <MiniStat label="Last login / seen" value={formatDate(lastSeen)} />
                <MiniStat label="Last meaningful activity" value={formatDate(lastActivity)} />
                <MiniStat label="Last launcher used" value={stats.lastLauncherUsed || "None tracked"} />
                <MiniStat label="Launcher opens" value={stats.launcherOpens ?? 0} />
                <MiniStat label="Cards completed" value={stats.actionsCompleted ?? 0} />
                <MiniStat label="Reports / feedback" value={stats.reportsSubmitted ?? 0} />
                <MiniStat label="Total events" value={user.event_count ?? stats.latestEvents?.length ?? 0} />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-5">
                <LifecyclePill label="Onboarding" active={stats.eventTypes?.includes("onboarding_completed")} />
                <LifecyclePill label="Launcher" active={(stats.installedLaunchers?.length ?? 0) > 0} />
                <LifecyclePill label="Interruption" active={(stats.interruptions ?? 0) > 0} />
                <LifecyclePill label="Do Something Else" active={(stats.doSomethingElse ?? 0) > 0} />
                <LifecyclePill label="Action done" active={(stats.actionsCompleted ?? 0) > 0} />
              </div>
              <UserActivityHeatmap data={stats.hourlyActivity ?? []} />
              {expanded ? <div className="mt-4 rounded-xl border border-slate-200 bg-white/70 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Event timeline</p>
                <div className="space-y-2">
                  {(stats.latestEvents ?? []).length === 0 ? <p className="text-sm text-slate-500">No recent events available for this user.</p> : null}
                  {(stats.latestEvents ?? []).map((event) => (
                    <div key={event.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                      <span className="font-mono text-slate-500">{formatTime(event.created_at)}</span>
                      <span className="truncate font-semibold text-slate-700">{getEventDisplayLabel(event)}</span>
                      <span className="truncate text-slate-500">{event.launcher_context || event.target_app || "none"}</span>
                    </div>
                  ))}
                </div>
              </div> : null}
              <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-slate-600">
                Signed up {formatDate(user.signed_up_at)} - Last seen {formatDate(lastSeen)} - {user.event_count ?? 0} total events
              </div>
              <TesterUserControls user={user} onUpdate={handleTesterUpdate} />
            </GlassPanel>
          );
        })}
      </div>
    </div>
  );
});

const TesterUserControls = memo(function TesterUserControls({ user, onUpdate }) {
  const [group, setGroup] = useState(user.tester_group ?? "");
  const [notes, setNotes] = useState(user.tester_notes ?? "");
  useEffect(() => {
    setGroup(user.tester_group ?? "");
    setNotes(user.tester_notes ?? "");
  }, [user.tester_group, user.tester_notes]);

  return (
    <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">Tester Mode</p>
          <p className="text-xs text-slate-600">{user.is_tester ? "Enabled" : "Disabled"}</p>
        </div>
        <button type="button" onClick={() => onUpdate(user, { is_tester: !user.is_tester, tester_group: group, tester_notes: notes })} className="rounded-xl bg-orange-600 px-3 py-2 text-xs font-semibold text-white">
          {user.is_tester ? "Remove tester" : "Mark tester"}
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input value={group} onChange={(event) => setGroup(event.target.value)} placeholder="Tester group" className="h-10 rounded-xl border border-orange-100 bg-white px-3 text-sm" />
        <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Tester notes" className="h-10 rounded-xl border border-orange-100 bg-white px-3 text-sm" />
      </div>
      <button type="button" onClick={() => onUpdate(user, { is_tester: Boolean(user.is_tester), tester_group: group, tester_notes: notes })} className="mt-2 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-700">Save tester fields</button>
    </div>
  );
});

const DevicesPage = memo(function DevicesPage({ telemetry }) {
  useRenderDiagnostics("DevicesPage");
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <DistributionPanel title="Launcher Contexts" rows={telemetry.topLaunchers} />
      <DistributionPanel title="Device Type Signals" rows={telemetry.deviceRows} />
    </div>
  );
});

const LifecyclePill = memo(function LifecyclePill({ label, active }) {
  return (
    <span className={`rounded-xl border px-3 py-2 text-center text-[11px] font-semibold ${
      active
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-slate-50 text-slate-400"
    }`}>
      {label}
    </span>
  );
});

const DataPage = memo(function DataPage({ telemetry }) {
  useRenderDiagnostics("DataPage");
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <MiniStat label="Event rows sampled" value={telemetry.events.length} />
      <MiniStat label="Event types" value={telemetry.eventTypes.length} />
      <MiniStat label="Pack records" value={telemetry.totalPacks} />
      <GlassPanel title="Schema Signals" subtitle="Fields present in recent telemetry">
        <div className="flex flex-wrap gap-2">
          {telemetry.schemaSignals.map((field) => (
            <span key={field} className="rounded-full border border-blue-100 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{field}</span>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
});

const SettingsPage = memo(function SettingsPage({ onRefresh, onBack, loading }) {
  useRenderDiagnostics("SettingsPage");
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <GlassPanel title="HQ Operations" subtitle="Administrative controls">
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onRefresh} disabled={loading} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-50">
            Refresh Data
          </button>
          <button type="button" onClick={onBack} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:text-blue-700">
            Exit HQ
          </button>
        </div>
      </GlassPanel>
      <GlassPanel title="Data Policy" subtitle="Objective telemetry only">
        <ul className="space-y-2 text-sm text-slate-600">
          <li>Counts are derived from stored event rows and pack/user records.</li>
          <li>User identifiers are shown as pseudonymous hashes where possible.</li>
          <li>No subjective classifications or inferred states are computed.</li>
        </ul>
      </GlassPanel>
    </div>
  );
});

const HeroMetricCard = memo(function HeroMetricCard({ metric }) {
  useRenderDiagnostics("HeroMetricCard");
  return (
    <article
      className="transition-transform hover:-translate-y-1 rounded-2xl border border-blue-100/80 bg-white/80 p-4 shadow-[0_18px_55px_rgba(37,99,235,0.08)] backdrop-blur-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{metric.label}</p>
          <strong className="mt-2 block text-3xl font-semibold tracking-tight text-slate-950">{metric.value}</strong>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${metric.trend >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {metric.trend >= 0 ? "+" : ""}{metric.trend}%
        </span>
      </div>
      <div className="mt-3 h-12">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={metric.sparkline}>
            <Line type="monotone" dataKey="value" stroke={metric.color} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-slate-500">{metric.comparison}</p>
    </article>
  );
});

const SparklineCard = memo(function SparklineCard({ title, data, dataKey }) {
  useRenderDiagnostics("SparklineCard");
  return (
    <GlassPanel title={title} subtitle="Recent time buckets">
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="sparklineBlue" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor={TELEMETRY_BLUE} stopOpacity={0.28} />
                <stop offset="95%" stopColor={TELEMETRY_BLUE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={32} />
            <Tooltip content={<ChartTooltip />} />
            <Area dataKey={dataKey} type="monotone" stroke={TELEMETRY_BLUE} fill="url(#sparklineBlue)" strokeWidth={2} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassPanel>
  );
});

const TelemetryChart = memo(function TelemetryChart({ title, subtitle, data, lines }) {
  useRenderDiagnostics("TelemetryChart");
  return (
    <GlassPanel title={title} subtitle={subtitle}>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              {lines.map((line) => (
                <linearGradient key={line.key} id={`${line.key}Gradient`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor={line.color} stopOpacity={0.24} />
                  <stop offset="95%" stopColor={line.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={34} />
            <Tooltip content={<ChartTooltip />} />
            {lines.map((line) => (
              <Area
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.name}
                stroke={line.color}
                fill={`url(#${line.key}Gradient)`}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassPanel>
  );
});

const BarPanel = memo(function BarPanel({ title, data, xKey, yKey }) {
  useRenderDiagnostics("BarPanel");
  return (
    <GlassPanel title={title} subtitle="Counted event rows">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={34} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey={yKey} radius={[7, 7, 0, 0]} fill={TELEMETRY_BLUE} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </GlassPanel>
  );
});

const HeatmapPanel = memo(function HeatmapPanel({ data }) {
  useRenderDiagnostics("HeatmapPanel");
  const max = Math.max(...data.map((item) => item.count), 1);
  return (
    <GlassPanel title="Hourly Activity Heatmap" subtitle="Events by weekday and hour">
      <div className="grid grid-cols-12 gap-1">
        {data.map((item) => (
          <div
            key={`${item.day}-${item.hour}`}
            title={`${item.day} ${item.hour}:00 - ${item.count} events`}
            className="h-7 rounded-md border border-white/70"
            style={{ backgroundColor: `rgba(37, 99, 235, ${0.08 + (item.count / max) * 0.72})` }}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-between text-[11px] font-medium text-slate-500">
        <span>Low</span>
        <span>High</span>
      </div>
    </GlassPanel>
  );
});

const DistributionPanel = memo(function DistributionPanel({ title, rows }) {
  useRenderDiagnostics("DistributionPanel");
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <GlassPanel title={title} subtitle="Ranked by count">
      <div className="space-y-3">
        {rows.length === 0 ? <p className="text-sm text-slate-500">No rows in current range.</p> : null}
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-semibold text-slate-700">{row.label}</span>
              <span className="font-mono text-xs text-slate-500">{row.count}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
});

const PackDeploymentCard = memo(function PackDeploymentCard({ pack, stats = {}, onEdit, onTogglePublished, onDelete }) {
  useRenderDiagnostics("PackDeploymentCard");
  const entries = pack.entries ?? [];
  return (
    <article
      className="transition-transform hover:-translate-y-1 rounded-2xl border border-blue-100 bg-white/85 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.06)] backdrop-blur"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Pack object</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">{pack.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{pack.description || "No description"}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pack.published ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
          {pack.published ? "Live" : "Draft"}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniStat label="Active users" value={stats.activeUsers ?? 0} />
        <MiniStat label="Activation rate" value={`${stats.activationRate ?? 0}%`} />
        <MiniStat label="Interactions Generated" value={stats.interactionCount ?? 0} />
        <MiniStat label="Cards" value={entries.length} />
      </div>
      <div className="mt-4 h-16">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={stats.trend ?? []}>
            <Line dataKey="value" stroke={TELEMETRY_BLUE} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-slate-500">Last updated: {formatDate(pack.updated_at || pack.created_at)}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => onEdit(pack)} className="rounded-lg border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-300">Edit</button>
        <button type="button" onClick={() => onTogglePublished(pack)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
          {pack.published ? "Move to Draft" : "Deploy Pack"}
        </button>
        <button type="button" onClick={() => onDelete(pack)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-700">Delete</button>
      </div>
    </article>
  );
});

const PackEditor = memo(function PackEditor({ form, setForm, onSubmit, loading }) {
  useRenderDiagnostics("PackEditor");
  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
      <input
        className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        value={form.title}
        onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
        placeholder="Pack title"
      />
      <textarea
        className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        value={form.description}
        onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
        placeholder="Short description"
        rows={2}
      />
      <select
        className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        value={form.theme}
        onChange={(event) => setForm((current) => ({ ...current, theme: event.target.value }))}
      >
        {THEMES.map((theme) => <option key={theme} value={theme}>{theme}</option>)}
      </select>
      <textarea
        className="rounded-xl border border-blue-100 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        value={form.importText}
        onChange={(event) => setForm((current) => ({ ...current, importText: event.target.value }))}
        placeholder={"Card text | attribution | source title | source URL"}
        rows={10}
      />
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input
          type="checkbox"
          checked={form.published}
          onChange={(event) => setForm((current) => ({ ...current, published: event.target.checked }))}
        />
        Live deployment
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-50" type="submit" disabled={loading}>
          {form.id ? "Save deployment" : "Deploy Pack"}
        </button>
        {form.id ? (
          <button className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700" type="button" onClick={() => setForm(EMPTY_PACK_FORM)}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
});

const GlassPanel = memo(function GlassPanel({ title, subtitle, children }) {
  useRenderDiagnostics("GlassPanel");
  return (
    <section className="rounded-2xl border border-blue-100/80 bg-white/78 p-4 shadow-[0_18px_55px_rgba(37,99,235,0.07)] backdrop-blur-xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-slate-950">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
});

const MiniStat = memo(function MiniStat({ label, value }) {
  useRenderDiagnostics("MiniStat");
  return (
    <div className="rounded-xl border border-blue-100 bg-white/85 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <strong className="mt-1 block text-xl font-semibold text-slate-950">{value}</strong>
    </div>
  );
});

const UserActivityHeatmap = memo(function UserActivityHeatmap({ data }) {
  useRenderDiagnostics("UserActivityHeatmap");
  const cells = data.length ? data : Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  const max = Math.max(...cells.map((item) => item.count), 1);
  return (
    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Hourly Activity</p>
      <div className="grid grid-cols-12 gap-1">
        {cells.map((item) => (
          <div
            key={item.hour}
            title={`${item.hour}:00 - ${item.count} events`}
            className="h-6 rounded border border-white/80"
            style={{ backgroundColor: `rgba(37, 99, 235, ${0.08 + (item.count / max) * 0.72})` }}
          />
        ))}
      </div>
    </div>
  );
});

const ChartTooltip = memo(function ChartTooltip({ active, payload, label }) {
  useRenderDiagnostics("ChartTooltip");
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-blue-100 bg-white/95 p-3 text-xs shadow-xl">
      <p className="mb-2 font-semibold text-slate-700">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
          {item.name || item.dataKey}: <strong className="text-slate-950">{item.value}</strong>
        </p>
      ))}
    </div>
  );
});

function buildTelemetryModel({ summary, recent, launcherEvents: rawLauncherEvents, users, adminPacks, libraryPacks, interruptionPacks, range, waitlist = [], testerReports = [] }) {
  const appEvents = normalizeEvents(recent);
  const launcherEvents = normalizeLauncherEvents(rawLauncherEvents);
  const events = [...appEvents, ...launcherEvents.map(mapLauncherEventToOperationalEvent)]
    .filter(Boolean)
    .map(normalizeOperationalEvent)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const summaryMap = new Map(summary.map((row) => [row.event_type, Number(row.event_count ?? 0)]));
  const eventCount = (type) => events.filter((event) => event.event_type === type).length || summaryMap.get(type) || 0;

  const signups = users.length;
  const onboardingStarted = eventCount("onboarding_started");
  const onboardingCompleted = eventCount("onboarding_completed");
  const instagramInstallViews = events.filter((event) => event.event_type === "launcher_install_viewed" && getEventLauncher(event) === "instagram").length;
  const instagramInstalled = events.filter((event) => ["launcher_installed", "launcher_install_clicked"].includes(event.event_type) && getEventLauncher(event) === "instagram").length;
  const firstInterruptionSeen = eventCount("first_interruption_seen");
  const totalInterruptions = events.filter((event) => ["first_interruption_seen", "intercept_card_viewed"].includes(event.event_type)).length;
  const continueToApp = eventCount("intercept_continue_to_app");
  const doSomethingElse = eventCount("intercept_do_something_else");
  const resolved = continueToApp + doSomethingElse;
  const actionsCompleted = eventCount("action_card_completed");
  const repeatUsers7d = countRepeatUsers(events, 7);
  const activeLaunchers = new Set(events.map(getEventLauncher).filter(Boolean)).size;
  const dayCount = range === "24h" ? 1 : range === "30d" ? 30 : 7;
  const activeActors = new Set(events.map(getActorId).filter(Boolean));
  const avgInterventionsPerUser = round(totalInterruptions / Math.max(activeActors.size, 1), 1);
  const publishedPacks = adminPacks.filter((pack) => pack.published).length;
  const draftPacks = adminPacks.length - publishedPacks;
  const totalPackCards = adminPacks.reduce((total, pack) => total + (pack.entries?.length ?? 0), 0);

  const interventionsOverTime = bucketEvents(events, (bucket, event) => {
    if (["first_interruption_seen", "intercept_card_viewed"].includes(event.event_type)) bucket.interruptions += 1;
    if (event.event_type === "intercept_continue_to_app") bucket.continueToApp += 1;
    if (event.event_type === "intercept_do_something_else") bucket.doSomethingElse += 1;
  });

  const packActivationTrend = bucketEvents(events, (bucket, event) => {
    if (event.event_type === "pack_activated" || event.event_type === "interruption_pack_activated") bucket.activations += 1;
  }, { activations: 0 });

  const notificationTrend = bucketEvents(events, (bucket, event) => {
    if (event.event_type?.includes("notification")) {
      if (event.event_type.includes("open") || event.event_type.includes("toggle")) bucket.interactions += 1;
      else bucket.delivered += 1;
    }
  }, { delivered: 0, interactions: 0 });

  const heroMetrics = [
    metric("Total Signups", signups, 0, activeUsersSeries(events), "Accounts created", TELEMETRY_BLUE),
    metric("Onboarding Completion Rate", `${percent(onboardingCompleted, onboardingStarted || signups)}%`, 0, interventionsOverTime.map((item) => item.interruptions), "Completed / started", TELEMETRY_GREEN),
    metric("Instagram Launcher Install Rate", `${percent(instagramInstalled, instagramInstallViews || onboardingCompleted)}%`, 0, [instagramInstallViews, instagramInstalled], "Installs / install views", TELEMETRY_BLUE),
    metric("First Interruption Seen", firstInterruptionSeen, 0, interventionsOverTime.map((item) => item.interruptions), "First overlay reached", TELEMETRY_NAVY),
    metric("Do Something Else Rate", `${percent(doSomethingElse, resolved)}%`, 0, interventionsOverTime.map((item) => item.doSomethingElse), "Do Something Else / resolved", TELEMETRY_GREEN),
    metric("Repeat Users (7d)", repeatUsers7d, 0, activeUsersSeries(events), "Users active on 2+ days", TELEMETRY_BLUE),
    metric("Continue To App Rate", `${percent(continueToApp, resolved)}%`, 0, interventionsOverTime.map((item) => item.continueToApp), "Continue / resolved", TELEMETRY_AMBER),
    metric("Avg Interventions Per User", avgInterventionsPerUser, 0, interventionsOverTime.map((item) => item.interruptions), `Across active users in ${dayCount}d`, TELEMETRY_BLUE),
  ];

  const rawEventFrequency = rowsFromCounts(countBy(events, (event) => event.event_type || "unknown"));
  const eventFrequency = rawEventFrequency.map((row) => ({
    ...row,
    label: getEventDisplayLabel({ event_type: row.label }),
  }));
  const topLaunchers = rowsFromCounts(countBy(events, (event) => getEventLauncher(event) || "unknown"));
  const notificationRows = eventFrequency.filter((row) => row.label.includes("notification"));
  const deviceRows = rowsFromCounts(countBy(events, (event) => event.metadata?.deviceType || event.metadata?.platform || "not_reported"));
  const userStats = buildUserStats(events, testerReports);
  const packStats = buildPackStats(events, adminPacks, users.length);
  const activeUsersOverTime = bucketEvents(events, (bucket, event) => {
    if (event.user_id) bucket.usersSet.add(event.user_id);
  }, { usersSet: new Set() }).map((bucket) => ({ ...bucket, users: bucket.usersSet.size }));

  return {
    events,
    launcherEvents,
    launcherStats: buildLauncherStats(launcherEvents),
    eventTypes: Array.from(new Set(events.map((event) => event.event_type).filter(Boolean))).sort(),
    heroMetrics,
    interventionsOverTime,
    packActivationTrend,
    notificationTrend,
    eventFrequency,
    topLaunchers,
    notificationRows,
    deviceRows,
    userStats,
    packStats,
    meaningfulEvents: events.filter(isMeaningfulEvent).map((event) => ({ ...event, displayLabel: getEventDisplayLabel(event) })),
    funnel: buildRecruitmentFunnel({ waitlist, users, events }),
    retention: buildRetentionModel({ events, users }),
    instagramStats: {
      installViews: instagramInstallViews,
      installs: instagramInstalled,
    },
    hourlyHeatmap: buildHeatmap(events),
    interruptionsByHour: rowsFromCounts(countBy(events.filter((event) => ["first_interruption_seen", "intercept_card_viewed"].includes(event.event_type)), (event) => new Date(event.created_at).getHours().toString().padStart(2, "0"))).map((row) => ({ hour: `${row.label}:00`, count: row.count })),
    activeUsersOverTime,
    publishedPacks,
    draftPacks,
    totalPackCards,
    totalPacks: adminPacks.length,
    schemaSignals: buildSchemaSignals(events),
    libraryPacks,
    interruptionPacks,
  };
}

function normalizeEvents(events = []) {
  return Array.isArray(events) ? events : [];
}

function normalizeLauncherEvents(events = []) {
  return Array.isArray(events) ? events : [];
}

function buildLauncherStats(events) {
  const normalized = events.map(mapLauncherEventToOperationalEvent).map(normalizeOperationalEvent);
  const opens = normalized.filter((event) => event.event_type === "first_interruption_seen").length;
  const installPageViews = normalized.filter((event) => event.event_type === "launcher_install_viewed").length;
  const installs = normalized.filter((event) => ["launcher_installed", "launcher_install_clicked"].includes(event.event_type)).length;
  const continueToApp = events.filter((event) => event.event_type === "intercept_continue_to_app").length;
  const doSomethingElse = events.filter((event) => event.event_type === "intercept_do_something_else").length;
  const resolved = continueToApp + doSomethingElse;
  const actorIds = new Set(events.map((event) => event.user_id || event.anonymous_device_id).filter(Boolean));

  const activeUsersByLauncher = rowsFromCounts(countBy(events, (event) => {
    if (!event.launcher_id) return "unknown";
    return `${event.launcher_id}:${event.user_id || event.anonymous_device_id || event.session_id || event.id}`;
  })).reduce((rows, row) => {
    const launcherId = row.label.split(":")[0] || "unknown";
    const existing = rows.find((item) => item.label === launcherId);
    if (existing) existing.count += 1;
    else rows.push({ label: launcherId, count: 1 });
    return rows;
  }, []).sort((left, right) => right.count - left.count);

  return {
    opens,
    interruptionOpens: opens,
    installPageViews,
    installs,
    continueToApp,
    doSomethingElse,
    resolved,
    uniqueActors: actorIds.size,
    opensByLauncher: rowsFromCounts(countBy(normalized.filter((event) => event.event_type === "first_interruption_seen"), (event) => getEventLauncher(event) || "unknown")),
    activeUsersByLauncher,
    installViewsByLauncher: rowsFromCounts(countBy(normalized.filter((event) => event.event_type === "launcher_install_viewed"), (event) => getEventLauncher(event) || "unknown")),
    mostUsedVersions: rowsFromCounts(countBy(events, (event) => event.launcher_name || event.launcher_id || "unknown")),
  };
}

function buildRecruitmentFunnel({ waitlist, users, events }) {
  const count = (type) => events.filter((event) => event.event_type === type).length;
  const stages = [
    ["Waitlist", waitlist.length],
    ["Signup Started", count("signup_started")],
    ["Signup Completed", users.length || count("signup_completed")],
    ["Onboarding Started", count("onboarding_started")],
    ["Onboarding Completed", count("onboarding_completed")],
    ["Instagram Install Viewed", events.filter((event) => event.event_type === "launcher_install_viewed" && getEventLauncher(event) === "instagram").length],
    ["Instagram Installed", events.filter((event) => ["launcher_installed", "launcher_install_clicked"].includes(event.event_type) && getEventLauncher(event) === "instagram").length],
    ["First Interruption Seen", count("first_interruption_seen")],
    ["Do Something Else Clicked", count("intercept_do_something_else")],
    ["Action Card Completed", count("action_card_completed")],
  ];

  return stages.map(([label, stageCount], index) => {
    const previous = index === 0 ? stageCount : stages[index - 1][1];
    const conversion = index === 0 ? 100 : percent(stageCount, previous);
    return {
      label,
      count: stageCount,
      conversion,
      dropoff: index === 0 ? 0 : Math.max(0, 100 - conversion),
    };
  });
}

function buildRetentionModel({ events, users }) {
  const actors = new Set(events.map(getActorId).filter(Boolean));
  const today = new Date().toISOString().slice(0, 10);
  const dailyActiveUsers = new Set(events.filter((event) => event.created_at?.slice(0, 10) === today).map(getActorId).filter(Boolean)).size;
  const returnUsers7d = countRepeatUsers(events, 7);
  const interruptions = events.filter((event) => ["first_interruption_seen", "intercept_card_viewed"].includes(event.event_type));
  const actionsCompleted = events.filter((event) => event.event_type === "action_card_completed");
  const installedActors = new Set(events.filter((event) => ["launcher_installed", "launcher_install_clicked"].includes(event.event_type)).map(getActorId).filter(Boolean));
  const interruptedActors = new Set(interruptions.map(getActorId).filter(Boolean));
  const doSomethingElseActors = new Set(events.filter((event) => event.event_type === "intercept_do_something_else").map(getActorId).filter(Boolean));
  const topLauncher = rowsFromCounts(countBy(events, (event) => getEventLauncher(event) || "unknown"))[0]?.label ?? "None yet";

  return {
    dailyActiveUsers,
    returnUsers7d,
    repeatUsers7d: returnUsers7d,
    avgInterruptionsPerUser: round(interruptions.length / Math.max(actors.size || users.length, 1), 1),
    avgActionsCompleted: round(actionsCompleted.length / Math.max(actors.size || users.length, 1), 1),
    mostActiveLauncher: topLauncher,
    installedNoInterruption: Array.from(installedActors).filter((actor) => !interruptedActors.has(actor)).length,
    interruptionNoAction: Array.from(interruptedActors).filter((actor) => !doSomethingElseActors.has(actor)).length,
  };
}

function countRepeatUsers(events, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const daysByActor = new Map();
  events.forEach((event) => {
    const actor = getActorId(event);
    const time = new Date(event.created_at).getTime();
    if (!actor || Number.isNaN(time) || time < cutoff) return;
    const set = daysByActor.get(actor) ?? new Set();
    set.add(new Date(event.created_at).toISOString().slice(0, 10));
    daysByActor.set(actor, set);
  });
  return Array.from(daysByActor.values()).filter((daysSet) => daysSet.size >= 2).length;
}

function getActorId(event) {
  return event?.user_id || event?.anonymous_device_id || event?.session_id || null;
}

function getEventLauncher(event) {
  return event?.launcher_context || event?.launcher_id || event?.target_app || event?.app_id || null;
}

function isMeaningfulEvent(event) {
  return [
    "onboarding_completed",
    "launcher_installed",
    "launcher_install_clicked",
    "first_interruption_seen",
    "intercept_do_something_else",
    "intercept_continue_to_app",
    "action_card_completed",
    "return_session_24h",
    "return_session_7d",
  ].includes(event.event_type);
}

function getEventDisplayLabel(event) {
  const labels = {
    onboarding_completed: "User completed onboarding",
    launcher_installed: "Launcher installed",
    launcher_install_clicked: "Launcher install clicked",
    first_interruption_seen: "First interruption shown",
    intercept_do_something_else: "Do Something Else clicked",
    intercept_continue_to_app: "Continue to app clicked",
    action_card_completed: "Action card completed",
    pack_card_liked: "Really liked",
    pack_card_disliked: "Hidden card",
    pack_card_restored: "Restored card",
    intercept_card_disliked: "Hidden interruption card",
    intercept_card_restored: "Restored interruption card",
    return_session_24h: "User returned after 24h",
    return_session_7d: "User returned after 7d",
  };
  return labels[event.event_type] ?? event.event_type;
}

function mapLauncherEventToOperationalEvent(event) {
  if (!event) return null;
  const eventType = {
    fake_launcher_install_page_viewed: "launcher_install_viewed",
    fake_launcher_install_cta_clicked: "launcher_install_clicked",
    fake_launcher_opened: "first_interruption_seen",
  }[event.event_type] ?? event.event_type;

  return {
    ...event,
    event_type: eventType,
    launcher_context: event.launcher_id,
    target_app: event.launcher_id,
    app_name: event.launcher_name,
  };
}

function normalizeOperationalEvent(event) {
  const aliases = {
    action_card_accepted: "action_card_completed",
    action_card_viewed: "action_card_opened",
    intercept_card_viewed: "first_interruption_seen",
  };
  return {
    ...event,
    event_type: aliases[event.event_type] ?? event.event_type,
  };
}

function bucketEvents(events, reducer, defaults = { interruptions: 0, continueToApp: 0, doSomethingElse: 0 }) {
  const buckets = new Map();
  events.forEach((event) => {
    const date = new Date(event.created_at);
    const key = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:00`;
    if (!buckets.has(key)) {
      buckets.set(key, { label: key, ...cloneDefaults(defaults) });
    }
    reducer(buckets.get(key), event);
  });
  return Array.from(buckets.values()).reverse().slice(-24);
}

function cloneDefaults(defaults) {
  return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, value instanceof Set ? new Set() : value]));
}

function buildHeatmap(events) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const counts = new Map();
  events.forEach((event) => {
    const date = new Date(event.created_at);
    const key = `${days[date.getDay()]}-${date.getHours()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return days.flatMap((day) =>
    Array.from({ length: 12 }, (_, index) => {
      const hour = index * 2;
      return { day, hour, count: counts.get(`${day}-${hour}`) ?? 0 };
    }),
  );
}

function buildUserStats(events, testerReports = []) {
  const stats = new Map();
  function ensure(userId) {
    const current = stats.get(userId) ?? {
      interruptions: 0,
      launcherOpens: 0,
      continueToApp: 0,
      doSomethingElse: 0,
      actionsCompleted: 0,
      reportsSubmitted: 0,
      notifications: 0,
      activeDates: new Set(),
      launchers: new Set(),
      installedLaunchers: new Set(),
      packs: new Set(),
      eventTypes: new Set(),
      latestEvents: [],
      hourlyCounts: new Map(),
      lastEventAt: null,
      lastMeaningfulActivityAt: null,
      lastLauncherUsed: "",
      lastLauncherUsedAt: null,
    };
    stats.set(userId, current);
    return current;
  }

  events.forEach((event) => {
    if (!event.user_id) return;
    const current = ensure(event.user_id);
    if (event.event_type) current.eventTypes.add(event.event_type);
    if (event.event_type?.startsWith("intercept_")) current.interruptions += 1;
    if (event.event_type === "first_interruption_seen") current.launcherOpens += 1;
    if (event.event_type === "intercept_continue_to_app") current.continueToApp += 1;
    if (event.event_type === "intercept_do_something_else") current.doSomethingElse += 1;
    if (event.event_type === "bash_done" || event.event_type === "action_card_completed") current.actionsCompleted += 1;
    if (event.event_type?.includes("notification")) current.notifications += 1;
    current.activeDates.add(new Date(event.created_at).toISOString().slice(0, 10));
    const launcher = event.launcher_context || event.target_app || event.app_name;
    if (launcher) {
      current.launchers.add(launcher);
      if (!current.lastLauncherUsedAt || new Date(event.created_at).getTime() > new Date(current.lastLauncherUsedAt).getTime()) {
        current.lastLauncherUsed = launcher;
        current.lastLauncherUsedAt = event.created_at;
      }
    }
    if (["launcher_installed", "launcher_install_clicked"].includes(event.event_type) && launcher) {
      current.installedLaunchers.add(launcher);
    }
    if (event.pack_id) current.packs.add(event.pack_id);
    const hour = new Date(event.created_at).getHours();
    current.hourlyCounts.set(hour, (current.hourlyCounts.get(hour) ?? 0) + 1);
    current.latestEvents = [event, ...current.latestEvents].slice(0, 8);
    if (!current.lastEventAt || new Date(event.created_at).getTime() > new Date(current.lastEventAt).getTime()) {
      current.lastEventAt = event.created_at;
    }
    if (isMeaningfulEvent(event) && (!current.lastMeaningfulActivityAt || new Date(event.created_at).getTime() > new Date(current.lastMeaningfulActivityAt).getTime())) {
      current.lastMeaningfulActivityAt = event.created_at;
    }
  });

  testerReports.forEach((report) => {
    if (!report.user_id) return;
    const current = ensure(report.user_id);
    current.reportsSubmitted += 1;
    current.latestEvents = [
      {
        id: report.id,
        user_id: report.user_id,
        event_type: `tester_${report.report_type || "report"}_submitted`,
        created_at: report.created_at,
        launcher_context: report.launcher_context,
      },
      ...current.latestEvents,
    ].slice(0, 8);
  });
  return new Map(Array.from(stats.entries()).map(([key, value]) => [key, {
    ...value,
    activeDays: value.activeDates.size,
    launcherCount: value.launchers.size,
    installedLaunchers: Array.from(value.installedLaunchers),
    enabledPacks: value.packs.size,
    eventTypes: Array.from(value.eventTypes),
    latestEvents: [...(value.latestEvents ?? [])].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()).slice(0, 8),
    hourlyActivity: Array.from({ length: 24 }, (_, hour) => ({ hour, count: value.hourlyCounts.get(hour) ?? 0 })),
  }]));
}

function getUserUsageStatus(stats = {}) {
  const eventTypes = new Set(stats.eventTypes ?? []);
  if ((stats.actionsCompleted ?? 0) > 0) return "Completing actions";
  if ((stats.doSomethingElse ?? 0) > 0) return "Choosing alternatives";
  if ((stats.interruptions ?? 0) > 0) return "Seeing interruptions";
  if ((stats.installedLaunchers?.length ?? 0) > 0) return "Installed, not used";
  if (eventTypes.has("onboarding_completed")) return "Onboarded, no launcher use";
  if (eventTypes.has("onboarding_started")) return "Onboarding started";
  return "Signed up, no product use";
}

function getUserActivityBadge(timestamp) {
  const time = new Date(timestamp || 0).getTime();
  if (!time || Number.isNaN(time)) {
    return { label: "inactive", className: "bg-slate-100 text-slate-600" };
  }
  const age = Date.now() - time;
  if (age <= 24 * 60 * 60 * 1000) {
    return { label: "active today", className: "bg-emerald-50 text-emerald-700" };
  }
  if (age <= 7 * 24 * 60 * 60 * 1000) {
    return { label: "active this week", className: "bg-blue-50 text-blue-700" };
  }
  return { label: "inactive", className: "bg-slate-100 text-slate-600" };
}

function buildPackStats(events, packs, userCount) {
  const stats = new Map();
  packs.forEach((pack) => {
    const packEvents = events.filter((event) => event.pack_id === pack.id || event.pack_id === pack.sourceKey);
    const activeUsers = new Set(packEvents.map((event) => event.user_id).filter(Boolean)).size;
    const activationCount = packEvents.filter((event) => event.event_type === "pack_activated").length;
    stats.set(pack.id, {
      activeUsers,
      activationRate: percent(activeUsers, userCount),
      interactionCount: packEvents.length,
      trend: bucketEvents(packEvents, (bucket) => {
        bucket.value += 1;
      }, { value: 0 }),
      activationCount,
    });
  });
  return stats;
}

function buildSchemaSignals(events) {
  const fields = new Set();
  events.forEach((event) => {
    Object.entries(event).forEach(([key, value]) => {
      if (value != null && value !== "") fields.add(key);
    });
  });
  return Array.from(fields).sort();
}

function countBy(items, selector) {
  const counts = new Map();
  items.forEach((item) => {
    const key = selector(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}

function rowsFromCounts(counts) {
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count);
}

function activeUsersSeries(events) {
  return bucketEvents(events, (bucket, event) => {
    if (event.user_id) bucket.users.add(event.user_id);
    bucket.value = bucket.users.size;
  }, { users: new Set(), value: 0 }).map((item) => item.value);
}

function topLaunchersSeries(events) {
  return rowsFromCounts(countBy(events, (event) => event.launcher_context || event.target_app || "unknown")).map((row) => row.count);
}

function metric(label, value, trend, series, comparison, color) {
  const sparkline = (series.length ? series : [0, 0, 0, 0]).slice(-12).map((item, index) => ({
    label: index,
    value: typeof item === "number" ? item : 0,
  }));
  return { label, value, trend, sparkline, comparison, color };
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function round(value, precision = 0) {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function pseudoUser(userId) {
  if (!userId) return "anonymous";
  return `usr_${String(userId).replace(/-/g, "").slice(0, 10)}`;
}

function formatTime(timestamp) {
  if (!timestamp) return "unknown";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function formatDateTime(timestamp) {
  if (!timestamp) return "Not refreshed yet";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function parseImportedCards(rawText) {
  return rawText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [promptText, attribution = "", sourceTitle = "", sourceUrl = ""] = line.split("|");
      return {
        promptText: promptText.trim(),
        attribution: attribution.trim(),
        sourceTitle: sourceTitle.trim(),
        sourceUrl: sourceUrl.trim(),
        frequency: "once_daily",
        timingWindows: ["morning", "day", "evening"],
      };
    })
    .filter((entry) => entry.promptText);
}

function formatImportedCard(entry) {
  const parts = [entry.promptText, entry.attribution, entry.sourceTitle, entry.sourceUrl].filter(Boolean);
  return parts.join(" | ");
}

function formatDate(timestamp) {
  if (!timestamp) return "unknown";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}
