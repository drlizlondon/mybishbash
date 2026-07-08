import React, { useState } from "react";
import { formatTwentyFourHourTime } from "../eventLog";
import { HeartGlyph, LogGlyph } from "./Glyphs";

// ── Pure helpers ──────────────────────────────────────────────────────────────

function describeLogEvent(event) {
  if (event.event_type === "commitment_made") {
    return `You committed to: ${event.card_text || event.card_title || "today's commitment"}`;
  }
  if (event.event_type === "commitment_declined") {
    return `You did not commit to: ${event.card_text || event.card_title || "today's commitment"}`;
  }
  if (event.event_type === "pack_card_liked") {
    return `Really liked: ${event.card_title || event.card_text || "a pack card"}`;
  }
  if (event.event_type === "intercept_do_something_else") {
    return `You chose something else instead of opening ${event.app_name || "that app"}.`;
  }
  if (event.event_type === "intercept_continue_to_app") {
    return `You continued to ${event.app_name || "the app"} after pausing.`;
  }
  if (event.event_type === "bash_done") {
    return `You completed: ${event.bash_title || "a myBishBash"}`;
  }
  if (event.event_type === "bash_do_now") {
    return `You chose to do: ${event.bash_title || "a myBishBash"}`;
  }
  if (event.event_type === "bash_not_done") {
    return `You left this myBishBash for later: ${event.bash_title || "a myBishBash"}`;
  }
  return "A little myBishBash moment was recorded.";
}

function getLogEventDisplayLabel(event) {
  const labels = {
    commitment_made: "Commitment made",
    commitment_declined: "Commitment declined",
    pack_card_liked: "Really liked",
    pack_card_disliked: "Hidden card",
    pack_card_restored: "Restored card",
    intercept_card_disliked: "Hidden App Prompt",
    intercept_card_restored: "Restored App Prompt",
  };
  return labels[event.event_type] ?? event.event_type;
}

function getDailyMomentData(events, timezone, days = 14) {
  const today = new Date();
  const buckets = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD
    const shortLabel = d.toLocaleDateString("en-GB", { timeZone: timezone, day: "numeric", month: "short" });
    const dayLabel = d.toLocaleDateString("en-GB", { timeZone: timezone, weekday: "short" });
    buckets.push({ key, shortLabel, dayLabel, count: 0 });
  }

  const bucketMap = new Map(buckets.map((b) => [b.key, b]));

  for (const event of events) {
    const dateKey = new Date(event.created_at).toLocaleDateString("en-CA", { timeZone: timezone });
    const bucket = bucketMap.get(dateKey);
    if (bucket) bucket.count++;
  }

  return buckets;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DailyMomentChart({ data }) {
  const width = 320;
  const height = 120;
  const margin = { top: 4, right: 4, bottom: 20, left: 24 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const domainMax = maxCount + 1;
  const barGap = 6;
  const barWidth = Math.max(4, (plotWidth - barGap * (data.length - 1)) / data.length);
  const tickCount = Math.min(domainMax + 1, 5);
  const yTicks = Array.from(
    { length: tickCount },
    (_, index) => Math.round((domainMax / Math.max(tickCount - 1, 1)) * index),
  );

  return (
    <svg className="log-inline-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Moments logged over the last 14 days" preserveAspectRatio="none">
      {yTicks.map((tick) => {
        const y = margin.top + plotHeight - (tick / domainMax) * plotHeight;
        return (
          <g key={tick} className="log-inline-chart-y-tick">
            <text x={margin.left - 8} y={y + 4} textAnchor="end">{tick}</text>
          </g>
        );
      })}
      {data.map((entry, index) => {
        const barHeight = (entry.count / domainMax) * plotHeight;
        const x = margin.left + index * (barWidth + barGap);
        const y = margin.top + plotHeight - barHeight;
        const labelY = margin.top + plotHeight + 15;
        const label = `${entry.shortLabel}: ${entry.count} ${entry.count === 1 ? "moment" : "moments"}`;
        const tooltipX = Math.min(Math.max(x - 24, margin.left), width - 92);
        const tooltipY = Math.max(y - 38, margin.top);
        return (
          <g key={entry.key} className="log-inline-chart-bar-group">
            <rect
              className={entry.count > 0 ? "log-inline-chart-bar is-active" : "log-inline-chart-bar"}
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, 2)}
              rx="4"
            >
              <title>{label}</title>
            </rect>
            {index % 2 === 0 ? (
              <text x={x + barWidth / 2} y={labelY} textAnchor="middle">{entry.dayLabel}</text>
            ) : null}
            <g className="log-inline-chart-tooltip" transform={`translate(${tooltipX} ${tooltipY})`} aria-hidden="true">
              <rect width="88" height="32" rx="8" />
              <text className="log-inline-chart-tooltip-date" x="8" y="13">{entry.shortLabel}</text>
              <text className="log-inline-chart-tooltip-count" x="8" y="26">
                {entry.count} {entry.count === 1 ? "moment" : "moments"}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function GrowthFlower({ count }) {
  const stage = count >= 15 ? "full" : count >= 10 ? "partial" : count >= 6 ? "stem" : count >= 3 ? "leaves" : "sprout";
  return (
    <svg viewBox="0 0 180 180" className={`growth-flower stage-${stage}`} aria-hidden="true">
      <defs>
        <linearGradient id="petalGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F0A08E" />
          <stop offset="100%" stopColor="#E87661" />
        </linearGradient>
      </defs>
      <path d="M90 144c0-18 0-34 1-52" className="stem-path" />
      {stage !== "sprout" ? (
        <>
          <path d="M91 110c16-3 26-14 26-28-14 1-24 11-26 28z" className="leaf-path" />
          <path d="M89 122c-15-3-25-13-25-28 14 1 24 11 25 28z" className="leaf-path" />
        </>
      ) : null}
      {stage === "stem" || stage === "partial" || stage === "full" ? (
        <circle cx="91" cy="78" r="10" className="bud-core" />
      ) : null}
      {stage === "partial" || stage === "full" ? (
        <>
          <path d="M91 52c9 0 16 9 16 18-9 0-16-9-16-18z" className="petal-path" />
          <path d="M67 78c0-9 9-16 18-16 0 9-9 16-18 16z" className="petal-path" />
          <path d="M115 78c0-9-9-16-18-16 0 9 9 16 18 16z" className="petal-path" />
        </>
      ) : null}
      {stage === "full" ? (
        <>
          <path d="M91 102c-9 0-16-9-16-18 9 0 16 9 16 18z" className="petal-path" />
          <path d="M75 60c8-5 20-3 25 5-8 5-20 3-25-5z" className="petal-path" />
          <path d="M107 60c-8-5-20-3-25 5 8 5 20 3 25-5z" className="petal-path" />
        </>
      ) : null}
      {stage === "sprout" ? <path d="M90 124c6-12 14-18 22-21-2 12-10 20-22 21z" className="sprout-path" /> : null}
    </svg>
  );
}

function EventDetailModal({ event, timezone, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="composer event-detail-card" onClick={(e) => e.stopPropagation()}>
        <div className="composer-heading">
          <p className="eyebrow">Moment detail</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="event-detail-body">
          <h3>{describeLogEvent(event)}</h3>
          <dl className="event-detail-list">
            <div>
              <dt>Time</dt>
              <dd>{formatTwentyFourHourTime(event.created_at, timezone)}</dd>
            </div>
            {event.bash_title ? (
              <div>
                <dt>myBishBash</dt>
                <dd>{event.bash_title}</dd>
              </div>
            ) : null}
            {event.app_name ? (
              <div>
                <dt>App source</dt>
                <dd>{event.app_name}</dd>
              </div>
            ) : null}
            <div>
              <dt>Launcher</dt>
              <dd>{event.launcher_context ?? "normal"}</dd>
            </div>
            {event.target_app ? (
              <div>
                <dt>Target app</dt>
                <dd>{event.target_app}</dd>
              </div>
            ) : null}
            {event.pack_id ? (
              <div>
                <dt>Pack</dt>
                <dd>{event.metadata?.packTitle ?? event.pack_id}</dd>
              </div>
            ) : null}
            <div>
              <dt>Event type</dt>
              <dd>{getLogEventDisplayLabel(event)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

// ── LogPanel ──────────────────────────────────────────────────────────────────

/**
 * @param {object}   props
 * @param {Array}    props.events            - Filtered events for the list.
 * @param {Array}    [props.allEvents]       - Full unfiltered events for the chart.
 * @param {string}   props.timezone          - User's IANA timezone.
 * @param {number}   props.weeklyShiftCount  - Shift count for the hero growth card.
 * @param {string}   props.filter            - "all" | "intercepts"
 * @param {Function} [props.onShowSummary]   - Opens yesterday's daily reflection overlay.
 */
export function LogPanel({ events, allEvents, timezone, weeklyShiftCount, filter, onShowSummary }) {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const filledDots = Math.min(weeklyShiftCount, 14);

  const chartData = getDailyMomentData(allEvents ?? events, timezone);

  return (
    <section className="log-screen">
      <header className="log-header">
        <span className="log-heart" aria-hidden="true">
          <HeartGlyph />
        </span>
        <h2>myBishBash Log</h2>
        <p>{filter === "intercepts" ? "the little pauses before the pull." : "tiny choices. real change."}</p>
      </header>

      <article className="log-hero-card">
        {weeklyShiftCount > 0 ? (
          <>
            <h3>
              You chose <span>yourself</span> {weeklyShiftCount} {weeklyShiftCount === 1 ? "time" : "times"} this week.
            </h3>
            <div className="growth-visual">
              <GrowthFlower count={weeklyShiftCount} />
            </div>
            <div className="growth-dots" aria-hidden="true">
              {Array.from({ length: 14 }).map((_, index) => (
                <span key={index} className={`growth-dot ${index < filledDots ? "filled" : ""}`} />
              ))}
            </div>
            <p className="growth-caption">Every little shift adds up.</p>
          </>
        ) : (
          <div className="log-empty-state">
            <h3>Your first little shift will appear here.</h3>
            <p>Every quiet choice begins somewhere.</p>
          </div>
        )}
      </article>

      <article className="recent-moments-card">
        <h3>Recent moments</h3>
        {events.length > 0 ? (
          <div className="recent-event-list">
            {events.map((event, index) => (
              <button
                key={event.id}
                type="button"
                className={`event-row ${index === events.length - 1 ? "last" : ""}`}
                onClick={() => setSelectedEvent(event)}
                aria-label={`Open details for ${describeLogEvent(event)}`}
              >
                <span className="event-icon-bubble" aria-hidden="true">
                  {event.event_type.startsWith("intercept_") ? <LogGlyph /> : <HeartGlyph />}
                </span>
                <span className="event-copy">{describeLogEvent(event)}</span>
                <span className="event-time">{formatTwentyFourHourTime(event.created_at, timezone)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="recent-empty-copy">Your recent moments will begin to gather here.</p>
        )}
      </article>

      {onShowSummary ? (
        <article className="log-summary-card">
          <h3>Daily reflection</h3>
          <p>See how yesterday's little choices added up.</p>
          <button type="button" className="log-summary-btn" onClick={onShowSummary}>
            View yesterday's reflection
          </button>
        </article>
      ) : null}

      <article className="log-chart-card">
        <h3>Your last 14 days</h3>
        <div className="log-chart-wrap">
          <DailyMomentChart data={chartData} />
        </div>
      </article>

      {selectedEvent ? (
        <EventDetailModal event={selectedEvent} timezone={timezone} onClose={() => setSelectedEvent(null)} />
      ) : null}
    </section>
  );
}
