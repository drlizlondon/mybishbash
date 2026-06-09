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
    return `You completed: ${event.bash_title || "a MyBishBash"}`;
  }
  if (event.event_type === "bash_do_now") {
    return `You chose to do: ${event.bash_title || "a MyBishBash"}`;
  }
  if (event.event_type === "bash_not_done") {
    return `You left this MyBishBash for later: ${event.bash_title || "a MyBishBash"}`;
  }
  return "A little MyBishBash moment was recorded.";
}

function getLogEventDisplayLabel(event) {
  const labels = {
    commitment_made: "Commitment made",
    commitment_declined: "Commitment declined",
    pack_card_liked: "Really liked",
    pack_card_disliked: "Hidden card",
    pack_card_restored: "Restored card",
    intercept_card_disliked: "Hidden interruption card",
    intercept_card_restored: "Restored interruption card",
  };
  return labels[event.event_type] ?? event.event_type;
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
                <dt>MyBishBash</dt>
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
 * @param {object} props
 * @param {Array}  props.events            - Filtered events to display.
 * @param {string} props.timezone          - User's IANA timezone.
 * @param {number} props.weeklyShiftCount  - Shift count for the hero growth card.
 * @param {string} props.filter            - "all" | "intercepts"
 * @param {Function} [props.onShowSummary] - Opens yesterday's daily reflection overlay.
 */
export function LogPanel({ events, timezone, weeklyShiftCount, filter, onShowSummary }) {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const filledDots = Math.min(weeklyShiftCount, 14);

  return (
    <section className="log-screen">
      <header className="log-header">
        <span className="log-heart" aria-hidden="true">
          <HeartGlyph />
        </span>
        <h2>MyBishBash Log</h2>
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

      {onShowSummary ? (
        <article className="log-summary-card">
          <h3>Daily reflection</h3>
          <p>See how yesterday's little choices added up.</p>
          <button type="button" className="log-summary-btn" onClick={onShowSummary}>
            View yesterday's reflection
          </button>
        </article>
      ) : null}

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

      {selectedEvent ? (
        <EventDetailModal event={selectedEvent} timezone={timezone} onClose={() => setSelectedEvent(null)} />
      ) : null}
    </section>
  );
}
