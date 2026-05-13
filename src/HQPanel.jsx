import { useEffect, useMemo, useState } from "react";
import {
  deleteAdminGlobalPack,
  fetchAdminAnalytics,
  fetchAdminGlobalPacks,
  fetchAdminUsers,
  saveAdminGlobalPack,
} from "./lib/bishbashSync";
import { THEMES } from "./utils";

const EMPTY_PACK_FORM = {
  id: null,
  title: "",
  description: "",
  theme: "Minimal",
  published: false,
  importText: "",
};

export default function HQPanel({
  isAdmin,
  session,
  libraryPacks = [],
  interruptionPacks = [],
  onGlobalPacksChanged,
  onBack,
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [adminPacks, setAdminPacks] = useState([]);
  const [users, setUsers] = useState([]);
  const [analytics, setAnalytics] = useState({ summary: [], recent: [] });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [packForm, setPackForm] = useState(EMPTY_PACK_FORM);

  const publishedAdminPacks = useMemo(() => adminPacks.filter((pack) => pack.published), [adminPacks]);
  const draftAdminPacks = useMemo(() => adminPacks.filter((pack) => !pack.published), [adminPacks]);
  const overviewData = useMemo(() => {
    let totalCards = 0;
    let totalIntercepts = 0;
    let totalOpens = 0;

    analytics.summary.forEach((row) => {
      if (row.event_type?.startsWith("bash_")) totalCards += Number(row.event_count ?? 0);
      if (row.event_type?.startsWith("intercept_")) totalIntercepts += Number(row.event_count ?? 0);
      if (row.event_type === "notification_opened") totalOpens += Number(row.event_count ?? 0);
    });

    return {
      totalUsers: users.length,
      totalCards,
      totalIntercepts,
      totalPushSubs: analytics.summary.find((row) => row.event_type === "push_subscription")?.event_count ?? 0,
      totalOpens,
      publishedPacks: publishedAdminPacks.length,
    };
  }, [analytics.summary, publishedAdminPacks.length, users.length]);

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

  async function handleSavePack(event) {
    event.preventDefault();
    const entries = parseImportedCards(packForm.importText);

    if (!packForm.title.trim()) {
      setStatus("Add a pack title first.");
      return;
    }

    if (entries.length === 0) {
      setStatus("Paste at least one card line before saving.");
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
      setStatus("Pack saved.");
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
      setStatus(pack.published ? "Pack moved to draft." : "Pack published for users.");
    } catch (error) {
      setStatus(error?.message ?? "Could not update pack.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeletePack(pack) {
    if (!window.confirm(`Delete "${pack.title}"? This removes it from users after their next refresh.`)) return;
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
    setStatus("");
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }

  if (!isAdmin) {
    return (
      <div className="overlay-screen empty-state">
        <div className="caught-up-content">
          <p className="eyebrow">BishBash HQ</p>
          <h2>Not authorised.</h2>
          <p className="caught-up-copy">You must be an admin to view this area.</p>
          <button className="action-button solid" onClick={onBack} style={{ marginTop: "24px" }}>
            Back home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell" style={{ background: "var(--sand)", minHeight: "100vh" }}>
      <div className="app-inner">
        <header className="hero" style={{ textAlign: "left", paddingLeft: "4px" }}>
          <div className="section-heading">
            <div>
              <h2>BishBash HQ</h2>
              <p>Admin control, global packs, users, and analytics.</p>
            </div>
            <button type="button" className="text-button" onClick={onBack}>Exit HQ</button>
          </div>
        </header>

        <nav className="timing-grid" style={{ marginBottom: "24px", gridTemplateColumns: "repeat(4, 1fr)" }}>
          {["overview", "packs", "analytics", "users"].map((tab) => (
            <button
              key={tab}
              type="button"
              className={`frequency-option ${activeTab === tab ? "selected" : ""}`}
              onClick={() => setActiveTab(tab)}
              style={{ minHeight: "44px", fontSize: "14px", textTransform: "capitalize" }}
            >
              {tab}
            </button>
          ))}
        </nav>

        {status ? <p className="save-status" style={{ marginBottom: "16px" }}>{status}</p> : null}
        {loading ? <p className="save-status" style={{ marginBottom: "16px" }}>Updating HQ...</p> : null}

        {activeTab === "overview" && (
          <section className="panel-section">
            <div className="settings-card settings-compact">
              <div className="settings-version-heading">
                <p>System Overview</p>
                <span>Live Supabase metrics.</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "16px" }}>
                <MetricBox label="Users" value={overviewData.totalUsers} />
                <MetricBox label="Cards Completed" value={overviewData.totalCards} />
                <MetricBox label="Interruptions" value={overviewData.totalIntercepts} />
                <MetricBox label="Published Packs" value={overviewData.publishedPacks} />
              </div>
            </div>
          </section>
        )}

        {activeTab === "packs" && (
          <section className="panel-section">
            <AccordionSection title={packForm.id ? "Edit Global Pack" : "Create Global Pack"} meta="Import or amend cards">
              <PackEditor form={packForm} setForm={setPackForm} onSubmit={handleSavePack} loading={loading} />
            </AccordionSection>

            <div className="settings-card">
              <div className="settings-version-heading">
                <p>Admin Global Packs</p>
                <span>Published packs appear in users' pack library.</span>
              </div>
              <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
                <PackSummaryRow label="Published" count={publishedAdminPacks.length} />
                <PackSummaryRow label="Draft" count={draftAdminPacks.length} />
                <PackSummaryRow label="Visible ready-made" count={libraryPacks.length} />
                <PackSummaryRow label="Built-in interruption" count={interruptionPacks.length} />
              </div>
            </div>

            <AccordionSection title="Admin Global Packs" meta={`${adminPacks.length} packs`} defaultOpen>
              <PackList
                packs={adminPacks}
                emptyLabel="No admin-created global packs yet."
                admin
                onEdit={editPack}
                onTogglePublished={handleTogglePublished}
                onDelete={handleDeletePack}
              />
            </AccordionSection>

            <AccordionSection title="User Library Preview" meta={`${libraryPacks.length} visible packs`}>
              <PackList packs={libraryPacks} emptyLabel="No ready-made packs found." />
            </AccordionSection>

            <AccordionSection title="Interruption Packs" meta={`${interruptionPacks.length} launcher folders`}>
              <PackList packs={interruptionPacks} emptyLabel="No interruption packs found." />
            </AccordionSection>
          </section>
        )}

        {activeTab === "analytics" && (
          <section className="panel-section">
            <AccordionSection title="Event Analytics" meta={`${analytics.summary.length} event types`} defaultOpen>
              <DataRows
                rows={analytics.summary}
                emptyLabel="No event analytics yet."
                renderRow={(row) => (
                  <>
                    <span>{row.event_type}</span>
                    <strong>{row.event_count}</strong>
                  </>
                )}
              />
            </AccordionSection>

            <AccordionSection title="Recent Events" meta={`${analytics.recent.length} latest events`}>
              <DataRows
                rows={analytics.recent}
                emptyLabel="No recent events yet."
                renderRow={(row) => (
                  <>
                    <span>{row.event_type}</span>
                    <small>{row.card_title || row.card_text || row.target_app || row.launcher_context || "No detail"}</small>
                    <strong>{formatDate(row.created_at)}</strong>
                  </>
                )}
              />
            </AccordionSection>
          </section>
        )}

        {activeTab === "users" && (
          <section className="panel-section">
            <AccordionSection title="Users" meta={`${users.length} signed up`} defaultOpen>
              <DataRows
                rows={users}
                emptyLabel="No users found yet."
                renderRow={(user) => (
                  <>
                    <span>{user.email || user.user_id}</span>
                    <small>Signed up {formatDate(user.signed_up_at)} - Last seen {formatDate(user.last_seen_at)}</small>
                    <strong>{user.event_count ?? 0} events</strong>
                  </>
                )}
              />
            </AccordionSection>
          </section>
        )}
      </div>
    </div>
  );
}

function PackEditor({ form, setForm, onSubmit, loading }) {
  return (
    <form onSubmit={onSubmit}>
      <p style={{ margin: "0 0 14px", color: "var(--ink-muted)" }}>Paste one card per line. Use "card text | attribution" when you have a source.</p>
      <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
        <input
          className="text-input"
          value={form.title}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          placeholder="Pack title"
        />
        <textarea
          className="text-input"
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          placeholder="Short description"
          rows={2}
        />
        <select
          className="text-input"
          value={form.theme}
          onChange={(event) => setForm((current) => ({ ...current, theme: event.target.value }))}
        >
          {THEMES.map((theme) => <option key={theme} value={theme}>{theme}</option>)}
        </select>
        <textarea
          className="text-input"
          value={form.importText}
          onChange={(event) => setForm((current) => ({ ...current, importText: event.target.value }))}
          placeholder={"Be still, and know that I am God. | Psalm 46:10\nStart where you are. Use what you have. Do what you can. | Arthur Ashe"}
          rows={8}
        />
        <label style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--charcoal)", fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={form.published}
            onChange={(event) => setForm((current) => ({ ...current, published: event.target.checked }))}
          />
          Publish to users
        </label>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button className="action-button solid" type="submit" disabled={loading}>
            {form.id ? "Save Pack" : "Create Pack"}
          </button>
          {form.id ? (
            <button className="pack-button secondary" type="button" onClick={() => setForm(EMPTY_PACK_FORM)}>
              Cancel Edit
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function AccordionSection({ title, meta, defaultOpen = false, children }) {
  return (
    <details className="settings-card" open={defaultOpen} style={{ overflow: "hidden" }}>
      <summary style={{ cursor: "pointer", listStyle: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div className="settings-version-heading">
            <p>{title}</p>
            <span>{meta}</span>
          </div>
          <span aria-hidden="true" style={{ color: "var(--ink-muted)", fontWeight: 800 }}>Open</span>
        </div>
      </summary>
      <div style={{ marginTop: "16px" }}>{children}</div>
    </details>
  );
}

function MetricBox({ label, value }) {
  return (
    <div style={{ padding: "16px", background: "rgba(255,255,255,0.7)", borderRadius: "16px", border: "1px solid rgba(0,0,0,0.05)" }}>
      <span style={{ display: "block", fontSize: "13px", color: "var(--ink-muted)", marginBottom: "4px" }}>{label}</span>
      <strong style={{ fontSize: "24px", color: "var(--charcoal)" }}>{value}</strong>
    </div>
  );
}

function PackSummaryRow({ label, count }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "rgba(255,255,255,0.65)", borderRadius: "14px", border: "1px solid rgba(0,0,0,0.05)" }}>
      <span style={{ color: "var(--ink-muted)", fontWeight: 700 }}>{label}</span>
      <strong style={{ color: "var(--charcoal)" }}>{count}</strong>
    </div>
  );
}

function PackList({ packs, emptyLabel, admin = false, onEdit, onTogglePublished, onDelete }) {
  if (packs.length === 0) {
    return (
      <div className="log-empty-state" style={{ minHeight: "96px", background: "rgba(255,255,255,0.5)", borderRadius: "18px" }}>
        <p>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {packs.map((pack) => {
        const entries = pack.entries ?? pack.cards ?? pack.messages ?? [];
        const title = pack.title ?? pack.name ?? pack.id;
        const description = pack.description ?? pack.targetApp ?? pack.type ?? "BishBash pack";
        const defaultOpen = admin && entries.length > 0 && entries.length <= 5;

        return (
          <details key={pack.id} open={defaultOpen} style={{ padding: "14px 16px", background: "rgba(255,255,255,0.72)", border: "1px solid rgba(0,0,0,0.06)", borderRadius: "14px" }}>
            <summary style={{ cursor: "pointer", listStyle: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
              <div>
                <strong style={{ color: "var(--charcoal)", fontSize: "18px" }}>{title}</strong>
                {admin ? (
                  <p style={{ margin: "4px 0 0", color: "var(--ink-muted)", fontWeight: 700 }}>
                    {pack.published ? "Published" : "Draft"}
                  </p>
                ) : null}
              </div>
              <span style={{ color: "var(--ink-muted)", fontSize: "13px", fontWeight: 700, whiteSpace: "nowrap" }}>{entries.length} cards</span>
              </div>
            </summary>
            <p style={{ margin: "12px 0 0", color: "var(--ink-muted)", lineHeight: 1.4 }}>{description}</p>
            {entries.length > 0 ? (
              <ul style={{ margin: "6px 0 0", paddingLeft: "18px", color: "var(--charcoal)", display: "grid", gap: "6px" }}>
                {entries.map((entry, index) => (
                  <li key={`${pack.id}-${index}`}>{entry.promptText ?? entry.text ?? entry.title ?? entry}</li>
                ))}
              </ul>
            ) : null}
            {admin ? (
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "8px" }}>
                <button className="pack-button secondary" type="button" onClick={() => onEdit(pack)}>Edit</button>
                <button className="pack-button secondary" type="button" onClick={() => onTogglePublished(pack)}>
                  {pack.published ? "Unpublish" : "Publish"}
                </button>
                <button className="text-button" type="button" onClick={() => onDelete(pack)}>Delete</button>
              </div>
            ) : null}
          </details>
        );
      })}
    </div>
  );
}

function DataRows({ rows, emptyLabel, renderRow }) {
  if (!rows.length) {
    return (
      <div className="log-empty-state" style={{ minHeight: "96px", marginTop: "16px", background: "rgba(255,255,255,0.5)", borderRadius: "18px" }}>
        <p>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "10px", marginTop: "16px" }}>
      {rows.map((row, index) => (
        <div key={row.id ?? row.user_id ?? row.event_type ?? index} style={{ display: "grid", gap: "4px", padding: "14px 16px", background: "rgba(255,255,255,0.65)", borderRadius: "14px", border: "1px solid rgba(0,0,0,0.05)" }}>
          {renderRow(row)}
        </div>
      ))}
    </div>
  );
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
