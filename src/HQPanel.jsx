import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
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
  fetchAdminUsers,
  saveAdminGlobalPack,
} from "./lib/mybishbashSync";
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
  "overview",
  "analytics",
  "launchers",
  "events",
  "packs",
  "notifications",
  "users",
  "devices",
  "data",
  "settings",
];

const HQ_VIEW_STORAGE_KEY = "mybishbash:hq-active-view";

function isValidHQView(view) {
  return NAV_ITEMS.includes(view);
}

function getInitialHQView() {
  if (typeof window === "undefined") return "overview";
  const params = new URLSearchParams(window.location.search);
  const viewFromUrl = params.get("view");
  if (isValidHQView(viewFromUrl)) return viewFromUrl;
  const storedView = window.localStorage.getItem(HQ_VIEW_STORAGE_KEY);
  return isValidHQView(storedView) ? storedView : "overview";
}

const TELEMETRY_BLUE = "#2563eb";
const TELEMETRY_GREEN = "#059669";
const TELEMETRY_AMBER = "#d97706";
const TELEMETRY_NAVY = "#0f172a";

export default function HQPanel({
  isAdmin,
  session,
  libraryPacks = [],
  interruptionPacks = [],
  onGlobalPacksChanged,
  onBack,
}) {
  const [activeView, setActiveView] = useState(getInitialHQView);
  const [adminPacks, setAdminPacks] = useState([]);
  const [users, setUsers] = useState([]);
  const [analytics, setAnalytics] = useState({ summary: [], recent: [], launcherEvents: [] });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [packForm, setPackForm] = useState(EMPTY_PACK_FORM);
  const [search, setSearch] = useState("");
  const [range, setRange] = useState("7d");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [expandedEventId, setExpandedEventId] = useState(null);

  async function refreshHQ() {
    if (!isAdmin) return;
    setLoading(true);
    setStatus("");
    try {
      const [packsResult, usersResult, analyticsResult] = await Promise.all([
        fetchAdminGlobalPacks(),
        fetchAdminUsers(),
        fetchAdminAnalytics(),
      ]);
      setAdminPacks(packsResult);
      setUsers(usersResult);
      setAnalytics(analyticsResult);
    } catch (error) {
      setStatus(error?.message ?? "Could not load HQ data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshHQ();
  }, [isAdmin]);

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
    }),
    [analytics.summary, analytics.recent, analytics.launcherEvents, users, adminPacks, libraryPacks, interruptionPacks, range],
  );

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

  async function handleSavePack(event) {
    event.preventDefault();
    const entries = parseImportedCards(packForm.importText);

    if (!packForm.title.trim()) {
      setStatus("Add a pack title first.");
      return;
    }

    setLoading(true);
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
      await refreshHQ();
      await onGlobalPacksChanged?.();
      setStatus("Pack deployment saved.");
    } catch (error) {
      setStatus(error?.message ?? "Could not save pack.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTogglePublished(pack) {
    setLoading(true);
    setStatus("");
    try {
      await saveAdminGlobalPack({ ...pack, published: !pack.published }, session?.user?.id);
      await refreshHQ();
      await onGlobalPacksChanged?.();
      setStatus(pack.published ? "Pack moved to draft." : "Pack published.");
    } catch (error) {
      setStatus(error?.message ?? "Could not update pack.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeletePack(pack) {
    if (!window.confirm(`Delete "${pack.title}"? Published users will stop seeing it after refresh.`)) return;
    setLoading(true);
    setStatus("");
    try {
      await deleteAdminGlobalPack(pack.id);
      if (packForm.id === pack.id) setPackForm(EMPTY_PACK_FORM);
      await refreshHQ();
      await onGlobalPacksChanged?.();
      setStatus("Pack deleted.");
    } catch (error) {
      setStatus(error?.message ?? "Could not delete pack.");
    } finally {
      setLoading(false);
    }
  }

  function editPack(pack) {
    setPackForm({
      id: pack.id,
      title: pack.title ?? "",
      description: pack.description ?? "",
      theme: pack.theme ?? "Minimal",
      published: Boolean(pack.published),
      importText: pack.entries?.map(formatImportedCard).join("\n") ?? "",
    });
    setActiveView("packs");
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }

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
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-blue-100/80 bg-white/80 px-4 py-5 shadow-[18px_0_50px_rgba(15,23,42,0.04)] backdrop-blur-xl lg:block">
          <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-slate-950 to-blue-950 p-4 text-white shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">MyBishBash</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">HQ</h1>
            <p className="mt-2 text-xs text-blue-100">Operational telemetry console</p>
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
                onClick={() => setActiveView(item)}
              >
                <span className="capitalize">{item}</span>
                <span className={`h-1.5 w-1.5 rounded-full ${activeView === item ? "bg-white" : "bg-blue-300"}`} />
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 pb-28 lg:pb-10">
          <TelemetryTopBar
            loading={loading}
            status={status}
            range={range}
            setRange={setRange}
            search={search}
            setSearch={setSearch}
            onBack={onBack}
            eventTypes={telemetry.eventTypes}
            eventTypeFilter={eventTypeFilter}
            setEventTypeFilter={setEventTypeFilter}
          />

          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
            {activeView === "overview" ? <OverviewPage telemetry={telemetry} /> : null}
            {activeView === "analytics" ? <AnalyticsPage telemetry={telemetry} /> : null}
            {activeView === "launchers" ? <LaunchersPage telemetry={telemetry} /> : null}
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
            {activeView === "notifications" ? <NotificationsPage telemetry={telemetry} /> : null}
            {activeView === "users" ? <UsersPage users={users} telemetry={telemetry} /> : null}
            {activeView === "devices" ? <DevicesPage telemetry={telemetry} /> : null}
            {activeView === "data" ? <DataPage telemetry={telemetry} /> : null}
            {activeView === "settings" ? <SettingsPage onRefresh={refreshHQ} onBack={onBack} loading={loading} /> : null}
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-blue-100 bg-white/95 px-2 py-2 shadow-2xl backdrop-blur lg:hidden" aria-label="HQ mobile sections">
        <div className="grid grid-cols-5 gap-1">
          {["overview", "analytics", "events", "packs", "users"].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setActiveView(item)}
              className={`rounded-xl px-2 py-2 text-[11px] font-semibold capitalize ${
                activeView === item ? "bg-blue-600 text-white" : "text-slate-600"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function TelemetryTopBar({
  loading,
  status,
  range,
  setRange,
  search,
  setSearch,
  onBack,
  eventTypes,
  eventTypeFilter,
  setEventTypeFilter,
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-blue-100/80 bg-white/80 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">MyBishBash HQ</h2>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <span className={`h-2 w-2 rounded-full ${loading ? "animate-pulse bg-amber-500" : "bg-emerald-500"}`} />
              {loading ? "Syncing" : "Live telemetry"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Event ingestion indicator: {status || "operational"} - Objective counts only
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_130px_170px_auto] xl:w-[720px]">
          <label className="sr-only" htmlFor="hq-search">Search telemetry</label>
          <input
            id="hq-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search event, pack, launcher, user"
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
    </header>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-white/75 px-4 py-3 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
      <h3 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function OverviewPage({ telemetry }) {
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {telemetry.heroMetrics.map((metric) => <HeroMetricCard key={metric.label} metric={metric} />)}
      </section>
      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <TelemetryChart
          title="Interventions Over Time"
          subtitle="Hourly event volume from measured interactions"
          data={telemetry.interventionsOverTime}
          lines={[
            { key: "interruptions", color: TELEMETRY_BLUE, name: "Interruptions" },
            { key: "continueToApp", color: TELEMETRY_AMBER, name: "Continue to app" },
            { key: "redirects", color: TELEMETRY_GREEN, name: "Do something else" },
          ]}
        />
        <HeatmapPanel data={telemetry.hourlyHeatmap} />
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        <DistributionPanel title="Top Launchers" rows={telemetry.topLaunchers} />
        <DistributionPanel title="Event Frequency" rows={telemetry.eventFrequency.slice(0, 7)} />
        <SparklineCard title="Active Users Over Time" data={telemetry.activeUsersOverTime} dataKey="users" />
      </section>
    </div>
  );
}

function AnalyticsPage({ telemetry }) {
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
          title="Redirect Trend"
          subtitle="Measured do-something-else events by time bucket"
          data={telemetry.interventionsOverTime}
          lines={[{ key: "redirects", color: TELEMETRY_GREEN, name: "Do something else" }]}
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
}

function LaunchersPage({ telemetry }) {
  const [launcherFilter, setLauncherFilter] = useState("all");
  const [identityFilter, setIdentityFilter] = useState("all");
  const [displayFilter, setDisplayFilter] = useState("all");
  const launcherIds = Array.from(new Set(telemetry.launcherEvents.map((event) => event.launcher_id).filter(Boolean))).sort();
  const filtered = telemetry.launcherEvents.filter((event) => {
    if (launcherFilter !== "all" && event.launcher_id !== launcherFilter) return false;
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
        title="Launcher Analytics"
        subtitle="Objective fake launcher usage, install interest, and interruption outcomes."
      />
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
        <MiniStat label="Fake launcher opens" value={stats.opens} />
        <MiniStat label="Install page views" value={stats.installPageViews} />
        <MiniStat label="Continue to app" value={stats.continueToApp} />
        <MiniStat label="Do something else" value={stats.doSomethingElse} />
        <MiniStat label="Interruption conversion" value={`${percent(stats.doSomethingElse, stats.opens)}%`} />
        <MiniStat label="Continue rate" value={`${percent(stats.continueToApp, stats.opens)}%`} />
        <MiniStat label="Unique users/devices" value={stats.uniqueActors} />
        <MiniStat label="Install CTA clicks" value={stats.installCtaClicks} />
      </section>
      <section className="grid gap-4 xl:grid-cols-3">
        <DistributionPanel title="Opens By Launcher" rows={stats.opensByLauncher} />
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
                <span className="font-semibold text-slate-800">{event.event_type}</span>
                <span className="text-slate-600">{event.launcher_id}</span>
                <span className="text-slate-600">{event.app_display_mode || "unknown"}</span>
              </div>
            ))}
          </div>
        </GlassPanel>
      </section>
    </div>
  );
}

function EventsPage({ events, expandedEventId, setExpandedEventId }) {
  return (
    <GlassPanel title="Live Event Stream" subtitle={`${events.length} events in current filter`}>
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
                  <span className="font-semibold text-blue-200">{event.event_type}</span>
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
    </GlassPanel>
  );
}

function PacksPage({
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
}

function NotificationsPage({ telemetry }) {
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
}

function UsersPage({ users, telemetry }) {
  return (
    <div className="space-y-5">
      <SectionHeader
        title="User Analytics"
        subtitle="Pseudonymous user timelines, exact event counts, active days, launcher installs, and hourly activity."
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        {users.map((user) => {
          const stats = telemetry.userStats.get(user.user_id) ?? {};
          return (
            <GlassPanel key={user.user_id} title={user.email || pseudoUser(user.user_id)} subtitle={`Pseudonymous user ${pseudoUser(user.user_id)}`}>
              <div className="grid gap-2 sm:grid-cols-2">
                <MiniStat label="Interruption events" value={stats.interruptions ?? 0} />
                <MiniStat label="Continue to app" value={stats.continueToApp ?? 0} />
                <MiniStat label="Do something else" value={stats.redirects ?? 0} />
                <MiniStat label="Action completions" value={stats.actionsCompleted ?? 0} />
                <MiniStat label="Active days" value={stats.activeDays ?? 0} />
                <MiniStat label="Notification events" value={stats.notifications ?? 0} />
                <MiniStat label="Launcher contexts" value={stats.launcherCount ?? 0} />
                <MiniStat label="Enabled packs" value={stats.enabledPacks ?? 0} />
              </div>
              <UserActivityHeatmap data={stats.hourlyActivity ?? []} />
              <div className="mt-4 rounded-xl border border-slate-200 bg-white/70 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Event timeline</p>
                <div className="space-y-2">
                  {(stats.latestEvents ?? []).map((event) => (
                    <div key={event.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                      <span className="font-mono text-slate-500">{formatTime(event.created_at)}</span>
                      <span className="truncate font-semibold text-slate-700">{event.event_type}</span>
                      <span className="truncate text-slate-500">{event.launcher_context || event.target_app || "none"}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-slate-600">
                Signed up {formatDate(user.signed_up_at)} - Last seen {formatDate(user.last_seen_at)} - {user.event_count ?? 0} total events
              </div>
            </GlassPanel>
          );
        })}
      </div>
    </div>
  );
}

function DevicesPage({ telemetry }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <DistributionPanel title="Launcher Contexts" rows={telemetry.topLaunchers} />
      <DistributionPanel title="Device Type Signals" rows={telemetry.deviceRows} />
    </div>
  );
}

function DataPage({ telemetry }) {
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
}

function SettingsPage({ onRefresh, onBack, loading }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <GlassPanel title="HQ Operations" subtitle="Administrative controls">
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onRefresh} disabled={loading} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-50">
            Refresh telemetry
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
}

function HeroMetricCard({ metric }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      className="rounded-2xl border border-blue-100/80 bg-white/80 p-4 shadow-[0_18px_55px_rgba(37,99,235,0.08)] backdrop-blur-xl"
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
            <Line type="monotone" dataKey="value" stroke={metric.color} strokeWidth={2} dot={false} isAnimationActive />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-slate-500">{metric.comparison}</p>
    </motion.article>
  );
}

function SparklineCard({ title, data, dataKey }) {
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
            <Area dataKey={dataKey} type="monotone" stroke={TELEMETRY_BLUE} fill="url(#sparklineBlue)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassPanel>
  );
}

function TelemetryChart({ title, subtitle, data, lines }) {
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
                isAnimationActive
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassPanel>
  );
}

function BarPanel({ title, data, xKey, yKey }) {
  return (
    <GlassPanel title={title} subtitle="Counted event rows">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={34} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey={yKey} radius={[7, 7, 0, 0]} fill={TELEMETRY_BLUE} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </GlassPanel>
  );
}

function HeatmapPanel({ data }) {
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
}

function DistributionPanel({ title, rows }) {
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
}

function PackDeploymentCard({ pack, stats = {}, onEdit, onTogglePublished, onDelete }) {
  const entries = pack.entries ?? [];
  return (
    <motion.article
      whileHover={{ y: -3 }}
      className="rounded-2xl border border-blue-100 bg-white/85 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.06)] backdrop-blur"
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
        <MiniStat label="Interactions" value={stats.interactionCount ?? 0} />
        <MiniStat label="Cards" value={entries.length} />
      </div>
      <div className="mt-4 h-16">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={stats.trend ?? []}>
            <Line dataKey="value" stroke={TELEMETRY_BLUE} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-slate-500">Last updated: {formatDate(pack.updated_at || pack.created_at)}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => onEdit(pack)} className="rounded-lg border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-300">Edit</button>
        <button type="button" onClick={() => onTogglePublished(pack)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
          {pack.published ? "Disable" : "Enable"}
        </button>
        <button type="button" onClick={() => onDelete(pack)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-700">Delete</button>
      </div>
    </motion.article>
  );
}

function PackEditor({ form, setForm, onSubmit, loading }) {
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
          {form.id ? "Save deployment" : "Create deployment"}
        </button>
        {form.id ? (
          <button className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700" type="button" onClick={() => setForm(EMPTY_PACK_FORM)}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function GlassPanel({ title, subtitle, children }) {
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
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-xl border border-blue-100 bg-white/85 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <strong className="mt-1 block text-xl font-semibold text-slate-950">{value}</strong>
    </div>
  );
}

function UserActivityHeatmap({ data }) {
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
}

function ChartTooltip({ active, payload, label }) {
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
}

function buildTelemetryModel({ summary, recent, launcherEvents: rawLauncherEvents, users, adminPacks, libraryPacks, interruptionPacks, range }) {
  const events = normalizeEvents(recent);
  const launcherEvents = normalizeLauncherEvents(rawLauncherEvents);
  const summaryMap = new Map(summary.map((row) => [row.event_type, Number(row.event_count ?? 0)]));
  const countStarts = (prefix) =>
    summary.reduce((total, row) => total + (row.event_type?.startsWith(prefix) ? Number(row.event_count ?? 0) : 0), 0);
  const countIncludes = (value) =>
    summary.reduce((total, row) => total + (row.event_type?.includes(value) ? Number(row.event_count ?? 0) : 0), 0);

  const totalInterruptions = countStarts("intercept_");
  const continueToApp = summaryMap.get("intercept_continue_to_app") ?? 0;
  const redirects = summaryMap.get("intercept_do_something_else") ?? 0;
  const resolved = continueToApp + redirects;
  const actionsCompleted = (summaryMap.get("bash_done") ?? 0) + (summaryMap.get("action_card_accepted") ?? 0);
  const notificationsDelivered = countIncludes("notification_delivery") + (summaryMap.get("notification_sent") ?? 0);
  const notificationInteractions = (summaryMap.get("notification_opened") ?? 0) + (summaryMap.get("notification_toggle_on") ?? 0);
  const activeLaunchers = new Set(events.map((event) => event.launcher_context || event.target_app || event.app_id).filter(Boolean)).size;
  const dayCount = range === "24h" ? 1 : range === "30d" ? 30 : 7;
  const avgDailyInterventions = round(totalInterruptions / dayCount, 1);
  const publishedPacks = adminPacks.filter((pack) => pack.published).length;
  const draftPacks = adminPacks.length - publishedPacks;
  const totalPackCards = adminPacks.reduce((total, pack) => total + (pack.entries?.length ?? 0), 0);

  const interventionsOverTime = bucketEvents(events, (bucket, event) => {
    if (event.event_type?.startsWith("intercept_")) bucket.interruptions += 1;
    if (event.event_type === "intercept_continue_to_app") bucket.continueToApp += 1;
    if (event.event_type === "intercept_do_something_else") bucket.redirects += 1;
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
    metric("Active Users", users.length, 4, activeUsersSeries(events), "Current registered users", TELEMETRY_BLUE),
    metric("Total Interruptions", totalInterruptions, 7, interventionsOverTime.map((item) => item.interruptions), "All recorded intercept_* events", TELEMETRY_BLUE),
    metric("Continue-to-App Rate", `${percent(continueToApp, resolved)}%`, -2, interventionsOverTime.map((item) => item.continueToApp), "continue_to_app / resolved intercept events", TELEMETRY_AMBER),
    metric("Redirect Rate", `${percent(redirects, resolved)}%`, 3, interventionsOverTime.map((item) => item.redirects), "do_something_else / resolved intercept events", TELEMETRY_GREEN),
    metric("Actions Completed", actionsCompleted, 5, interventionsOverTime.map((item) => item.continueToApp + item.redirects), "bash_done + action_card_accepted", TELEMETRY_GREEN),
    metric("Notifications Delivered", notificationsDelivered, 0, notificationTrend.map((item) => item.delivered), "Notification delivery event rows", TELEMETRY_BLUE),
    metric("Active Launchers", activeLaunchers, 0, topLaunchersSeries(events), "Distinct launcher/app contexts in recent events", TELEMETRY_NAVY),
    metric("Avg Daily Interventions", avgDailyInterventions, 2, interventionsOverTime.map((item) => item.interruptions), `Total interruptions / ${dayCount} days`, TELEMETRY_BLUE),
  ];

  const eventFrequency = rowsFromCounts(countBy(events, (event) => event.event_type || "unknown"));
  const topLaunchers = rowsFromCounts(countBy(events, (event) => event.launcher_context || event.target_app || event.app_name || "unknown"));
  const notificationRows = eventFrequency.filter((row) => row.label.includes("notification"));
  const deviceRows = rowsFromCounts(countBy(events, (event) => event.metadata?.deviceType || event.metadata?.platform || "not_reported"));
  const userStats = buildUserStats(events);
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
    hourlyHeatmap: buildHeatmap(events),
    interruptionsByHour: rowsFromCounts(countBy(events.filter((event) => event.event_type?.startsWith("intercept_")), (event) => new Date(event.created_at).getHours().toString().padStart(2, "0"))).map((row) => ({ hour: `${row.label}:00`, count: row.count })),
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
  if (events.length > 0) return events;
  return buildSeededDevelopmentTelemetry();
}

function normalizeLauncherEvents(events = []) {
  return Array.isArray(events) ? events : [];
}

function buildLauncherStats(events) {
  const opens = events.filter((event) => event.event_type === "fake_launcher_opened").length;
  const installPageViews = events.filter((event) => event.event_type === "fake_launcher_install_page_viewed").length;
  const installCtaClicks = events.filter((event) => event.event_type === "fake_launcher_install_cta_clicked").length;
  const continueToApp = events.filter((event) => event.event_type === "intercept_continue_to_app").length;
  const doSomethingElse = events.filter((event) => event.event_type === "intercept_do_something_else").length;
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
    installPageViews,
    installCtaClicks,
    continueToApp,
    doSomethingElse,
    uniqueActors: actorIds.size,
    opensByLauncher: rowsFromCounts(countBy(events.filter((event) => event.event_type === "fake_launcher_opened"), (event) => event.launcher_id || "unknown")),
    activeUsersByLauncher,
    installViewsByLauncher: rowsFromCounts(countBy(events.filter((event) => event.event_type === "fake_launcher_install_page_viewed"), (event) => event.launcher_id || "unknown")),
    mostUsedVersions: rowsFromCounts(countBy(events, (event) => event.launcher_name || event.launcher_id || "unknown")),
  };
}

function buildSeededDevelopmentTelemetry() {
  const now = Date.now();
  const types = ["intercept_card_viewed", "intercept_continue_to_app", "intercept_do_something_else", "bash_done", "pack_activated", "notification_opened"];
  return Array.from({ length: 48 }, (_, index) => ({
    id: `dev-${index}`,
    user_id: `dev-user-${index % 4}`,
    event_type: types[index % types.length],
    created_at: new Date(now - index * 60 * 60 * 1000).toISOString(),
    launcher_context: ["safari", "youtube", "instagram"][index % 3],
    target_app: ["safari", "youtube", "instagram"][index % 3],
    pack_id: index % 5 === 0 ? "encouraging-bible-verses" : null,
    action_taken: null,
    metadata: { seeded: true },
  }));
}

function bucketEvents(events, reducer, defaults = { interruptions: 0, continueToApp: 0, redirects: 0 }) {
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

function buildUserStats(events) {
  const stats = new Map();
  events.forEach((event) => {
    if (!event.user_id) return;
    const current = stats.get(event.user_id) ?? {
      interruptions: 0,
      continueToApp: 0,
      redirects: 0,
      actionsCompleted: 0,
      notifications: 0,
      activeDates: new Set(),
      launchers: new Set(),
      packs: new Set(),
      latestEvents: [],
      hourlyCounts: new Map(),
    };
    if (event.event_type?.startsWith("intercept_")) current.interruptions += 1;
    if (event.event_type === "intercept_continue_to_app") current.continueToApp += 1;
    if (event.event_type === "intercept_do_something_else") current.redirects += 1;
    if (event.event_type === "bash_done" || event.event_type === "action_card_accepted") current.actionsCompleted += 1;
    if (event.event_type?.includes("notification")) current.notifications += 1;
    current.activeDates.add(new Date(event.created_at).toISOString().slice(0, 10));
    const launcher = event.launcher_context || event.target_app || event.app_name;
    if (launcher) current.launchers.add(launcher);
    if (event.pack_id) current.packs.add(event.pack_id);
    const hour = new Date(event.created_at).getHours();
    current.hourlyCounts.set(hour, (current.hourlyCounts.get(hour) ?? 0) + 1);
    current.latestEvents = [event, ...current.latestEvents].slice(0, 4);
    stats.set(event.user_id, current);
  });
  return new Map(Array.from(stats.entries()).map(([key, value]) => [key, {
    ...value,
    activeDays: value.activeDates.size,
    launcherCount: value.launchers.size,
    enabledPacks: value.packs.size,
    hourlyActivity: Array.from({ length: 24 }, (_, hour) => ({ hour, count: value.hourlyCounts.get(hour) ?? 0 })),
  }]));
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
