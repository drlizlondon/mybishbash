import { formatTwentyFourHourTime } from "../../eventLog";

export default function MorningSummaryDebugLog({ summary }) {
  const events = summary?.debugEvents ?? [];

  return (
    <div className="morning-summary-debug-log" data-testid="morning-summary-debug-log">
      <div className="morning-summary-debug-header">
        <strong>Raw summary/debug log</strong>
        <span>{summary?.dateKey ?? "No date"} · {events.length} events</span>
      </div>
      {events.length === 0 ? (
        <p className="tiny-note">No summary events found for this date yet.</p>
      ) : (
        <div className="morning-summary-debug-list">
          {events.map((event) => (
            <div key={`${event.id}:${event.type}:${event.at}`} className="morning-summary-debug-row">
              <span>{formatTwentyFourHourTime(event.at)}</span>
              <strong>{event.label}</strong>
              <p>{[event.card, event.app, event.action].filter(Boolean).join(" · ")}</p>
              <code>{event.type}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
