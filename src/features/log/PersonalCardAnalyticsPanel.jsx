import { useState, useMemo } from "react";
import { computePersonalCardAnalytics } from "../../lib/personalCardAnalytics";
import { HeartGlyph } from "../../components/Glyphs";

export function PersonalCardAnalyticsPanel({
  cards = [],
  allEvents = [],
  timezone = "Europe/London",
  onNavigateToLibrary,
  onMakeCommitment,
  onPauseCard,
}) {
  const [timeframeDays, setTimeframeDays] = useState(30);
  const [activeTooltip, setActiveTooltip] = useState(null);

  const analytics = useMemo(() => {
    return computePersonalCardAnalytics(cards, allEvents, timezone, { days: timeframeDays });
  }, [cards, allEvents, timezone, timeframeDays]);

  const {
    cards: cardTrends,
    avoidedCards,
    superstarCards,
    totalPersonalCards,
    totalCompletions30d,
    overallCompletionRate,
    doorwaySwitchesCount,
    estimatedMinutesSaved,
    overallAvgDwellCompletedMs,
    overallAvgDwellIgnoredMs,
    totalReflexSkips,
    reflexSkipPercentage,
    spicedCardsCount,
  } = analytics;

  return (
    <div className="card-analytics-container">
      {/* Executive Scorecard with 14d / 30d Toggle */}
      <article className="card-analytics-hero">
        <header className="card-analytics-hero-header">
          <div className="card-analytics-header-row">
            <p className="card-analytics-eyebrow">{timeframeDays}-day personal overview</p>
            <div className="timeframe-toggle-pill" role="group" aria-label="Timeline window">
              <button
                type="button"
                className={`timeframe-toggle-btn ${timeframeDays === 14 ? "active" : ""}`}
                onClick={() => setTimeframeDays(14)}
              >
                14 Days
              </button>
              <button
                type="button"
                className={`timeframe-toggle-btn ${timeframeDays === 30 ? "active" : ""}`}
                onClick={() => setTimeframeDays(30)}
              >
                30 Days
              </button>
            </div>
          </div>
          <h3>
            {totalCompletions30d > 0 ? (
              <>
                You turned <span>{totalCompletions30d}</span> moments into real life.
              </>
            ) : (
              `Your ${timeframeDays}-day card journey begins here.`
            )}
          </h3>
        </header>

        <div className="card-analytics-metric-grid">
          <div className="analytics-stat-pill">
            <span className="stat-value">{overallCompletionRate !== null ? `${overallCompletionRate}%` : "—"}</span>
            <span className="stat-label">Follow-through rate</span>
          </div>
          <div className="analytics-stat-pill">
            <span className="stat-value">{totalCompletions30d}</span>
            <span className="stat-label">Bishes completed</span>
          </div>
          <div className="analytics-stat-pill">
            <span className="stat-value">{doorwaySwitchesCount}</span>
            <span className="stat-label">Doorway pauses</span>
          </div>
          <div className="analytics-stat-pill">
            <span className="stat-value">{estimatedMinutesSaved}m</span>
            <span className="stat-label">Doomscroll reclaimed</span>
          </div>
        </div>

        {/* Card Retention & Attention Dwell Time (Psychology & Behavioral Change Data) */}
        {(overallAvgDwellCompletedMs !== null || overallAvgDwellIgnoredMs !== null || totalReflexSkips > 0) && (
          <div className="retention-dwell-panel">
            <div className="retention-dwell-heading">
              <span className="retention-badge-tag">Attention & Dwell Retention ⏱️</span>
              <span className="retention-subtag">Sociology Experiment: Active</span>
            </div>
            <div className="retention-stat-columns">
              <div className="dwell-stat-card">
                <span className="dwell-stat-num">
                  {overallAvgDwellCompletedMs !== null ? `${(overallAvgDwellCompletedMs / 1000).toFixed(1)}s` : "—"}
                </span>
                <span className="dwell-stat-title">Glance before completing</span>
                <span className="dwell-stat-desc">Time spent absorbing card before saying yes</span>
              </div>
              <div className="dwell-stat-card">
                <span className="dwell-stat-num">
                  {overallAvgDwellIgnoredMs !== null ? `${(overallAvgDwellIgnoredMs / 1000).toFixed(1)}s` : "—"}
                </span>
                <span className="dwell-stat-title">Glance before skipping</span>
                <span className="dwell-stat-desc">
                  {reflexSkipPercentage !== null
                    ? `${reflexSkipPercentage}% reflex skips (<1.5s muscle memory)`
                    : "Passes vs thoughtful skips"}
                </span>
              </div>
            </div>
            {spicedCardsCount > 0 && (
              <p className="retention-spiced-callout">
                🌶️ <strong>{spicedCardsCount} {spicedCardsCount === 1 ? "card is" : "cards are"} spiced:</strong> Dynamic warm terracotta salience is active on cards with $\ge 3$ consecutive skips to break sensory habituation and interrupt automatic bypass.
              </p>
            )}
          </div>
        )}

        <p className="card-analytics-hero-caption">
          {doorwaySwitchesCount > 0
            ? `Every pause before Instagram or Safari gave you a choice. You chose yourself ${doorwaySwitchesCount} times.`
            : "Whenever you reach for your phone, your personal cards step in to offer you an intentional micro-choice."}
        </p>
      </article>

      {/* The Honest Mirror (Avoided / Skipped Cards with Salience & Coaching Forks) */}
      {avoidedCards.length > 0 && (
        <article className="honest-mirror-card">
          <div className="honest-mirror-header">
            <div className="honest-mirror-badge">The Honest Mirror 🙈</div>
            <h4>Cards you might be secretly dodging</h4>
            <p className="honest-mirror-subtitle">
              No guilt here. Noticing what you bypass is how you adapt habits to real life instead of fighting yourself.
            </p>
          </div>

          <div className="avoided-cards-list">
            {avoidedCards.map((card) => (
              <div key={card.cardId} className={`avoided-card-item ${card.isSpiced ? "is-spiced-card" : ""}`}>
                <div className="avoided-card-top">
                  <div className="avoided-card-title-line">
                    <span className="avoided-card-title">{card.promptText}</span>
                    {card.isSpiced && (
                      <span className="spiced-pill-badge" title="Dynamic salience to interrupt autopilot">
                        🌶️ Spiced for Attention
                      </span>
                    )}
                  </div>
                  <span className="avoided-card-skip-pill">
                    Skipped {card.totalIgnored} of {card.totalSurfaced} times ({card.ignoreRate}%)
                  </span>
                </div>

                {/* Behavioral Metadata Chips */}
                <div className="avoided-card-chips">
                  {card.consecutiveSkips >= 2 && (
                    <span className="chip-warn">⚠️ {card.consecutiveSkips} skips in a row</span>
                  )}
                  {card.avgDwellIgnoredMs !== null && (
                    <span className="chip-dwell">
                      ⏱️ {(card.avgDwellIgnoredMs / 1000).toFixed(1)}s glance {card.avgDwellIgnoredMs < 1500 ? "(Reflex bypass)" : "(Considered pass)"}
                    </span>
                  )}
                  {card.topDoorway && (
                    <span className="chip-app">📱 Bypassed before {card.topDoorway}</span>
                  )}
                </div>

                <div className="honest-mirror-nudges">
                  <span className="nudge-title">Empathetic tweak suggestions:</span>
                  <ul>
                    <li>
                      <strong>Make it smaller:</strong> If this feels too heavy when you're about to open an app, cut it to a 30-second version.
                    </li>
                    <li>
                      <strong>Check your timing:</strong> Are you seeing this during your busiest hours? Try moving it to evening.
                    </li>
                    <li>
                      <strong>Take a breather:</strong> Habits should serve you. If this one isn't right for this season, feel free to pause or archive it.
                    </li>
                  </ul>
                </div>

                {/* The Two-Fork Behavioral Action Choice */}
                <div className="honest-mirror-fork-actions">
                  <button
                    type="button"
                    className="fork-btn fork-btn-commitment"
                    onClick={() => {
                      if (onMakeCommitment) {
                        onMakeCommitment(card);
                      } else if (onNavigateToLibrary) {
                        onNavigateToLibrary();
                      }
                    }}
                  >
                    🎯 Make it a Commitment
                  </button>
                  <button
                    type="button"
                    className="fork-btn fork-btn-pause"
                    onClick={() => {
                      if (onPauseCard) {
                        onPauseCard(card);
                      } else if (onNavigateToLibrary) {
                        onNavigateToLibrary();
                      }
                    }}
                  >
                    ⏸️ Pause for this Season
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>
      )}

      {/* Superstars / Second Nature */}
      {superstarCards.length > 0 && (
        <article className="superstar-card">
          <div className="superstar-header">
            <span className="superstar-badge">Second Nature ⭐</span>
            <h4>Your highest momentum cards</h4>
            <p>You follow through on these almost every single time they pop up.</p>
          </div>
          <div className="superstar-list">
            {superstarCards.map((card) => (
              <div key={card.cardId} className="superstar-item">
                <span className="superstar-title">{card.promptText}</span>
                <div className="superstar-stats">
                  <span className="superstar-winrate">{card.completionRate}% win rate</span>
                  {card.currentStreak > 1 && (
                    <span className="superstar-streak">🔥 {card.currentStreak}-day streak</span>
                  )}
                  {card.avgDwellCompletedMs !== null && (
                    <span className="superstar-dwell">⏱️ {(card.avgDwellCompletedMs / 1000).toFixed(1)}s glance</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </article>
      )}

      {/* Activity Trail Grid for Every Personal Card (14d or 30d) */}
      <article className="all-cards-trends-card">
        <div className="trends-card-header">
          <h4>{timeframeDays}-Day Activity Trail</h4>
          <p>Every personal card you've created and how you've handled it over the past {timeframeDays} days.</p>
          
          <div className="legend-strip">
            <span className="legend-item"><span className="legend-dot completed" /> Completed</span>
            <span className="legend-item"><span className="legend-dot ignored" /> Bypassed / Skipped</span>
            <span className="legend-item"><span className="legend-dot idle" /> Quiet day</span>
          </div>
        </div>

        {totalPersonalCards === 0 ? (
          <div className="empty-trends-state">
            <HeartGlyph />
            <h5>No personal cards created yet</h5>
            <p>Create your first personal card (like "Water the plant" or "Stretch for 2 mins") in your Library.</p>
            {onNavigateToLibrary && (
              <button type="button" className="btn-create-card" onClick={onNavigateToLibrary}>
                Go to Library
              </button>
            )}
          </div>
        ) : (
          <div className="card-trends-list">
            {cardTrends.map((card) => {
              return (
                <div key={card.cardId} className="card-trend-row">
                  <div className="card-trend-meta">
                    <div className="card-trend-title-line">
                      <span className="card-trend-title">{card.promptText}</span>
                      <span className={`card-status-badge ${card.statusTag}`}>{card.statusLabel}</span>
                      {card.isSpiced && <span className="spiced-mini-badge" title="Spiced card">🌶️</span>}
                    </div>

                    <div className="card-trend-submetrics">
                      {card.completionRate !== null ? (
                        <span className="metric-tag winrate"><strong>{card.completionRate}%</strong> completed</span>
                      ) : (
                        <span className="metric-tag unseen">Never surfaced</span>
                      )}
                      <span className="metric-tag">
                        <strong>{card.totalCompleted}</strong> done · <strong>{card.totalIgnored}</strong> skipped
                      </span>
                      {card.currentStreak > 0 && (
                        <span className="metric-tag streak">🔥 {card.currentStreak}d streak</span>
                      )}
                      {card.topDoorway && (
                        <span className="metric-tag doorway">📱 Intercepts {card.topDoorway}</span>
                      )}
                    </div>
                  </div>

                  {/* Dot Matrix */}
                  <div
                    className="timeline-dots-wrapper"
                    role="group"
                    aria-label={`${timeframeDays}-day activity for ${card.promptText}`}
                  >
                    <div className="timeline-dots-track">
                      {card.dailyEntries.map((day, idx) => {
                        const tooltipText = `${day.dayLabel}, ${day.shortLabel}: ${
                          day.status === "completed"
                            ? `Done ${day.completedCount}x 🎉`
                            : day.status === "ignored"
                            ? `Skipped ${day.ignoredCount}x`
                            : "No activity"
                        }`;

                        return (
                          <div
                            key={day.dateKey}
                            className={`timeline-dot-col ${day.isToday ? "is-today" : ""}`}
                            onMouseEnter={() =>
                              setActiveTooltip({ cardId: card.cardId, index: idx, text: tooltipText })
                            }
                            onMouseLeave={() => setActiveTooltip(null)}
                            onClick={() =>
                              setActiveTooltip({ cardId: card.cardId, index: idx, text: tooltipText })
                            }
                            tabIndex={0}
                            role="button"
                            aria-label={tooltipText}
                          >
                            <span className={`timeline-dot ${day.status}`} />
                            {day.isToday && <span className="today-marker">T</span>}
                          </div>
                        );
                      })}
                    </div>

                    {activeTooltip?.cardId === card.cardId && (
                      <div className="active-dot-tooltip">
                        {activeTooltip.text}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>
    </div>
  );
}
