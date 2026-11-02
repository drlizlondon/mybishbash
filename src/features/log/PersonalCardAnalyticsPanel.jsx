import { useState, useMemo } from "react";
import { ALL_TIME, computePersonalCardAnalytics, formatSinceDate } from "../../lib/personalCardAnalytics";
import { HeartGlyph } from "../../components/Glyphs";

function describeDay(day) {
  const parts = [];
  if (day.completedCount > 0) parts.push(`Done ${day.completedCount}x`);
  if (day.onTrackCount > 0) parts.push("On track");
  if (day.partialCount > 0) parts.push("Partly on track");
  if (day.closedCount > 0) parts.push("Left for another day");
  if (day.ignoredCount > 0) parts.push(`Skipped ${day.ignoredCount}x`);
  return parts.length > 0 ? parts.join(", ") : "No activity";
}

function describeWeek(week) {
  const parts = [];
  if (week.completedCount > 0) parts.push(`Done ${week.completedCount}x`);
  if (week.onTrackCount > 0) parts.push(`On track ${week.onTrackCount}x`);
  if (week.partialCount > 0) parts.push(`Partly ${week.partialCount}x`);
  if (week.closedCount > 0) parts.push(`Left for another day ${week.closedCount}x`);
  if (week.ignoredCount > 0) parts.push(`Skipped ${week.ignoredCount}x`);
  return `Week of ${week.label}: ${parts.length > 0 ? parts.join(", ") : "No activity"}`;
}

// One column per week: done (green) at the bottom, then partly on track, then
// left for another day, then skipped on top. Column height is the week's total
// relative to the busiest week for this card. An empty week is a thin baseline.
function WeeklyTrack({ card, onSelect, onClear }) {
  const weeks = card.weeklyEntries;
  if (weeks.length === 0) {
    return <p className="weekly-track-empty">No activity yet</p>;
  }
  const maxTotal = Math.max(1, ...weeks.map((week) => week.total));
  return (
    <div className="weekly-track">
      {weeks.map((week, idx) => {
        const text = describeWeek(week);
        const segment = (count, className) =>
          count > 0 ? (
            <span className={`weekly-seg ${className}`} style={{ flexGrow: count }} />
          ) : null;
        return (
          <div
            key={week.weekStartKey}
            className={`weekly-col ${week.isCurrent ? "is-current" : ""} ${week.total === 0 ? "is-empty" : ""}`}
            onMouseEnter={() => onSelect(idx, text)}
            onMouseLeave={onClear}
            onClick={() => onSelect(idx, text)}
            tabIndex={0}
            role="button"
            aria-label={text}
          >
            <span className="weekly-bar" style={{ height: week.total === 0 ? undefined : `${Math.max(12, Math.round((week.total / maxTotal) * 100))}%` }}>
              {segment(week.ignoredCount, "ignored")}
              {segment(week.closedCount, "closed")}
              {segment(week.partialCount, "partial")}
              {segment(week.completedCount + week.onTrackCount, "completed")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

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

  // The local log keeps only the newest events, so when it is full "All time"
  // really means "since the oldest event we still have".
  const sinceLabel = analytics.eventLogCapped && analytics.oldestEventAt
    ? `Since ${formatSinceDate(analytics.oldestEventAt, timezone)}`
    : null;
  const allTimeLabel = sinceLabel ?? "All time";
  const isAllTime = timeframeDays === ALL_TIME;
  const isWeekly = analytics.granularity === "weekly";
  const timeframeNoun = isAllTime ? null : `${timeframeDays}-day`;
  const overviewEyebrow = isAllTime
    ? (sinceLabel ? `Personal overview, ${sinceLabel.toLowerCase()}` : "All-time personal overview")
    : `${timeframeNoun} personal overview`;
  const journeyName = isAllTime ? "card" : `${timeframeNoun} card`;

  const {
    cards: cardTrends,
    avoidedCards,
    superstarCards,
    totalPersonalCards,
    totalCompletions30d,
    overallCompletionRate,
    doorwaySwitchesCount,
    estimatedMinutesSaved,
    readProperlyThisWeek,
  } = analytics;
  const skippedThreeInARowCount = cardTrends.filter((card) => !card.isCommitment && card.consecutiveSkips >= 3).length;
  const hasCommitments = cardTrends.some((card) => card.isCommitment);

  return (
    <div className="card-analytics-container">
      {/* Executive Scorecard with 14d / 30d Toggle */}
      <article className="card-analytics-hero">
        <header className="card-analytics-hero-header">
          <div className="card-analytics-header-row">
            <p className="card-analytics-eyebrow">{overviewEyebrow}</p>
            <div className="timeframe-toggle-pill" role="group" aria-label="Timeline window">
              {[
                { value: 14, label: "14 days" },
                { value: 30, label: "30 days" },
                { value: 90, label: "90 days" },
                { value: ALL_TIME, label: allTimeLabel },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`timeframe-toggle-btn ${timeframeDays === option.value ? "active" : ""}`}
                  aria-pressed={timeframeDays === option.value}
                  onClick={() => {
                    setActiveTooltip(null);
                    setTimeframeDays(option.value);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <h3>
            {totalCompletions30d > 0 ? (
              <>
                You turned <span>{totalCompletions30d}</span> moments into real life.
              </>
            ) : (
              `Your ${journeyName} journey begins here.`
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

        {/* How much of each card was actually read (reading time counts the words on the card) */}
        {(readProperlyThisWeek.total > 0 || skippedThreeInARowCount > 0) && (
          <div className="retention-dwell-panel">
            <div className="retention-dwell-heading">
              <span className="retention-badge-tag">How you read your cards</span>
            </div>
            {readProperlyThisWeek.total > 0 && (
              <div className="retention-stat-columns">
                <div className="dwell-stat-card">
                  <span className="dwell-stat-title">Read properly: {readProperlyThisWeek.read} of {readProperlyThisWeek.total} cards this week</span>
                  <span className="dwell-stat-desc">A card counts as read when you stayed on it for at least half the time its words take to read.</span>
                </div>
              </div>
            )}
            {skippedThreeInARowCount > 0 && (
              <p className="retention-spiced-callout">
                <strong>{skippedThreeInARowCount} {skippedThreeInARowCount === 1 ? "card" : "cards"} skipped 3 times in a row.</strong> The next skip will offer to make {skippedThreeInARowCount === 1 ? "it" : "them"} a commitment or pause {skippedThreeInARowCount === 1 ? "it" : "them"}.</p>
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
            <div className="honest-mirror-badge">The Honest Mirror</div>
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
                      <span className="spiced-pill-badge" title="Skipped a lot">
                        Skipped a lot
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
                    <span className="chip-warn">{card.consecutiveSkips} skips in a row</span>
                  )}
                  {card.avgDwellIgnoredMs !== null && (
                    <span className="chip-dwell">
                      {(card.avgDwellIgnoredMs / 1000).toFixed(1)}s on the card
                    </span>
                  )}
                  {card.topDoorway && (
                    <span className="chip-app">Bypassed before {card.topDoorway}</span>
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
                    Make it a Commitment
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
                    Pause for this Season
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
            <span className="superstar-badge">Second Nature</span>
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
                    <span className="superstar-streak">{card.currentStreak}-day streak</span>
                  )}
                  {card.avgDwellCompletedMs !== null && (
                    <span className="superstar-dwell">{(card.avgDwellCompletedMs / 1000).toFixed(1)}s glance</span>
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
          <h4>{isWeekly ? "Week-by-week activity" : `${timeframeDays}-Day Activity Trail`}</h4>
          <p>
            {isWeekly
              ? `Every personal card and commitment, week by week (weeks start on Monday)${isAllTime && sinceLabel ? `, ${sinceLabel.toLowerCase()}` : ""}.`
              : `Every personal card and commitment you've created and how you've handled it over the past ${timeframeDays} days.`}
          </p>

          <div className="legend-strip">
            <span className="legend-item"><span className="legend-dot completed" /> {hasCommitments ? "Done or on track" : "Completed"}</span>
            {hasCommitments && (
              <span className="legend-item"><span className="legend-dot partial" /> Partly on track</span>
            )}
            {hasCommitments && (
              <span className="legend-item"><span className="legend-dot closed" /> Left for another day</span>
            )}
            <span className="legend-item"><span className="legend-dot ignored" /> Bypassed / Skipped</span>
            <span className="legend-item"><span className="legend-dot idle" /> {isWeekly ? "Empty week" : "Quiet day"}</span>
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
                    </div>

                    <div className="card-trend-submetrics">
                      {card.isCommitment && (
                        card.checkIns.total > 0 ? (
                          <span className="metric-tag winrate">{card.checkInSummary}</span>
                        ) : (
                          <span className="metric-tag unseen">No check-ins yet</span>
                        )
                      )}
                      {!card.isCommitment && (
                        card.completionRate !== null ? (
                          <span className="metric-tag winrate"><strong>{card.completionRate}%</strong> completed</span>
                        ) : (
                          <span className="metric-tag unseen">Never surfaced</span>
                        )
                      )}
                      {(!card.isCommitment || card.totalSurfaced > 0) && (
                        <span className="metric-tag">
                          <strong>{card.totalCompleted}</strong> done · <strong>{card.totalIgnored}</strong> skipped
                        </span>
                      )}
                      {card.currentStreak > 0 && (
                        <span className="metric-tag streak">{card.currentStreak}d streak</span>
                      )}
                      {card.topDoorway && (
                        <span className="metric-tag doorway">Intercepts {card.topDoorway}</span>
                      )}
                    </div>
                    <p className={`card-trend-insight trend-${card.trend.state}`}>{card.trend.label}</p>
                    {card.usuallyDoneOn && (
                      <p className="card-trend-insight">Usually done on {card.usuallyDoneOn}</p>
                    )}
                  </div>

                  {/* Daily dots (14/30 days) or weekly columns (90 days / all time) */}
                  <div
                    className="timeline-dots-wrapper"
                    role="group"
                    aria-label={`${isWeekly ? "Weekly" : `${timeframeDays}-day`} activity for ${card.promptText}`}
                  >
                    {isWeekly ? (
                      <WeeklyTrack
                        card={card}
                        onSelect={(index, text) => setActiveTooltip({ cardId: card.cardId, index, text })}
                        onClear={() => setActiveTooltip(null)}
                      />
                    ) : (
                    <div className="timeline-dots-track">
                      {card.dailyEntries.map((day, idx) => {
                        const tooltipText = `${day.dayLabel}, ${day.shortLabel}: ${describeDay(day)}`;

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
                    )}

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
