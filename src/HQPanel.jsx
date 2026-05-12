import { useState, useEffect } from "react";
import { supabase } from "./lib/supabaseClient";

export default function HQPanel({ isAdmin, session, onBack }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [overviewData, setOverviewData] = useState(null);

  useEffect(() => {
    if (!isAdmin || !supabase) return;
    
    async function fetchOverview() {
      const { count: userCount } = await supabase.from("user_summary").select("*", { count: 'exact' });
      const { data: analytics } = await supabase.from("analytics_summary").select("*");
      const { count: pushCount } = await supabase.from("push_subscriptions").select("*", { count: 'exact' });
      
      let totalCards = 0;
      let totalIntercepts = 0;
      let totalOpens = 0;

      analytics?.forEach(row => {
        if (row.event_type.startsWith("bash_")) totalCards += row.event_count;
        if (row.event_type.startsWith("intercept_")) totalIntercepts += row.event_count;
        if (row.event_type === "notification_opened") totalOpens += row.event_count;
      });

      setOverviewData({
        totalUsers: userCount || 0,
        totalCards,
        totalIntercepts,
        totalPushSubs: pushCount || 0,
        totalOpens
      });
    }

    fetchOverview();
  }, [isAdmin]);

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
              <p>Admin control and global analytics.</p>
            </div>
            <button type="button" className="text-button" onClick={onBack}>Exit HQ</button>
          </div>
        </header>

        <nav className="timing-grid" style={{ marginBottom: "24px", gridTemplateColumns: "repeat(3, 1fr)" }}>
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

        {activeTab === "overview" && (
          <section className="panel-section">
            <div className="settings-card settings-compact">
              <div className="settings-version-heading">
                <p>System Overview</p>
                <span>High-level platform metrics.</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "16px" }}>
                <MetricBox label="Total Users" value={overviewData?.totalUsers ?? "..."} />
                <MetricBox label="Cards Completed" value={overviewData?.totalCards ?? "..."} />
                <MetricBox label="Interruptions" value={overviewData?.totalIntercepts ?? "..."} />
                <MetricBox label="Push Subs" value={overviewData?.totalPushSubs ?? "..."} />
              </div>
            </div>
          </section>
        )}

        {activeTab === "packs" && (
          <section className="panel-section">
            <div className="settings-card">
              <div className="settings-version-heading">
                <p>Global Packs</p>
                <span>Manage card packs distributed to all users.</span>
              </div>
              <div className="log-empty-state" style={{ minHeight: "120px", marginTop: "16px", background: "rgba(255,255,255,0.5)", borderRadius: "18px" }}>
                <p>Global Pack manager UI coming next iteration.</p>
                <button className="pack-button secondary" style={{ width: "fit-content", justifySelf: "center" }}>Create New Pack</button>
              </div>
            </div>
          </section>
        )}

        {activeTab === "analytics" && (
          <section className="panel-section">
            <div className="settings-card">
              <div className="settings-version-heading">
                <p>Event Analytics</p>
                <span>Raw event stream aggregation.</span>
              </div>
              <div className="log-empty-state" style={{ minHeight: "120px", marginTop: "16px", background: "rgba(255,255,255,0.5)", borderRadius: "18px" }}>
                <p>Detailed event charts coming next iteration.</p>
              </div>
            </div>
          </section>
        )}
        
        {activeTab === "users" && (
          <section className="panel-section">
            <div className="settings-card">
              <div className="settings-version-heading">
                <p>Active Users</p>
                <span>Recent user activity.</span>
              </div>
              <div className="log-empty-state" style={{ minHeight: "120px", marginTop: "16px", background: "rgba(255,255,255,0.5)", borderRadius: "18px" }}>
                <p>User directory coming next iteration.</p>
              </div>
            </div>
          </section>
        )}

      </div>
    </div>
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