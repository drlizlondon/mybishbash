// The local event log keeps only the newest events (see mergeEventsById in
// eventLog.js). Stats screens read this to say honestly how far back the
// history goes.
export const EVENT_LOG_MAX = 500;
