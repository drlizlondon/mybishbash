import { useMemo } from "react";
import { LogPanel } from "../../components/LogPanel";
import { useEventsStore } from "../../stores/eventsStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { getStartOfWeek } from "../../eventLog";

function isRecentMomentEvent(event) {
  return [
    "bash_done",
    "bash_do_now",
    "intercept_do_something_else",
    "intercept_continue_to_app",
  ].includes(event.event_type);
}

function getWeeklyShiftCount(events, now = new Date()) {
  const weekStart = getStartOfWeek(now).getTime();
  const shiftTypes = new Set(["bash_done", "bash_do_now", "intercept_do_something_else"]);
  return events.filter((event) => {
    if (!shiftTypes.has(event.event_type)) return false;
    return new Date(event.created_at).getTime() >= weekStart;
  }).length;
}

/**
 * Store container for the log screen (Phase 4 D4).
 *
 * Reads the event log and timezone from the stores and derives everything
 * LogPanel needs. `filter` stays App-owned (transient UI state per D1) and
 * arrives through `props`, as does `onShowSummary` (it opens the morning
 * summary modal, which App owns). LogPanel's body is unchanged.
 */
export default function LogScreen(props) {
  const { filter } = props;
  const events = useEventsStore((state) => state.events);
  const timezone = useSettingsStore((state) => state.profile.timezone);

  const recentMeaningfulEvents = useMemo(
    () => events.filter(isRecentMomentEvent).slice(0, 5),
    [events],
  );
  const logEventsForPanel = useMemo(() => {
    if (filter === "intercepts") {
      return recentMeaningfulEvents.filter((event) => event.event_type.startsWith("intercept_"));
    }
    return recentMeaningfulEvents;
  }, [filter, recentMeaningfulEvents]);
  const weeklyShiftCount = useMemo(() => getWeeklyShiftCount(events), [events]);

  return (
    <LogPanel
      {...props}
      events={logEventsForPanel}
      allEvents={events}
      timezone={timezone}
      weeklyShiftCount={weeklyShiftCount}
    />
  );
}
