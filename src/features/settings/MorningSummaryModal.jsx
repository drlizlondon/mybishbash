import { BrandMark } from "../../components/BrandMark";

export default function MorningSummaryModal({ summary, onClose }) {
  const sections = [];
  const personal = summary.personal ?? {};
  const commitments = summary.commitments ?? {};
  const interruptions = summary.interruptions ?? {};
  const plural = (count, singular, pluralLabel = `${singular}s`) => `${count} ${count === 1 ? singular : pluralLabel}`;

  if (personal.completedCount > 0 || personal.availableCount > 0) {
    const completionCopy = personal.availableCount > 0
      ? `Yesterday, you completed ${personal.completedCount} of your ${plural(personal.availableCount, "personal card")}.`
      : `Yesterday, you completed ${plural(personal.completedCount, "personal card")}.`;
    sections.push({
      id: "personal",
      title: "Personal Cards",
      body: completionCopy,
      details: personal.isCompletionPercentageReliable && personal.completionPercentage != null
        ? [`That is ${personal.completionPercentage}% of the personal cards shown yesterday.`]
        : [],
    });
  }

  if (
    commitments.madeCount > 0 ||
    commitments.declinedCount > 0 ||
    commitments.checkInGeneratedCount > 0 ||
    commitments.checkInCompletedCount > 0
  ) {
    const details = [];
    const commitmentBody = commitments.madeCount > 0
      ? `You made ${plural(commitments.madeCount, "commitment")} yesterday.`
      : commitments.declinedCount > 0
        ? `You chose not this time for ${plural(commitments.declinedCount, "commitment")} yesterday.`
        : "Your commitment check-ins were active yesterday.";
    if (commitments.declinedCount > 0) details.push(`${commitments.declinedCount} not this time`);
    if (commitments.checkInGeneratedCount > 0) details.push(`${commitments.checkInGeneratedCount} check-in shown`);
    if (commitments.checkInCompletedCount > 0) details.push(`${commitments.checkInCompletedCount} check-in answered`);
    if (commitments.outcomes?.goingPerfectly) details.push(`${commitments.outcomes.goingPerfectly} going perfectly`);
    if (commitments.outcomes?.couldBeBetter) details.push(`${commitments.outcomes.couldBeBetter} could be better`);
    if (commitments.outcomes?.notGoingWell) details.push(`${commitments.outcomes.notGoingWell} not going well`);
    sections.push({
      id: "commitments",
      title: "Commitments",
      body: commitmentBody,
      details,
    });
  }

  if (interruptions.interruptedCount > 0 || interruptions.continueToAppCount > 0 || interruptions.choseAlternativeCount > 0) {
    const topApp = interruptions.byApp?.[0];
    const body = topApp
      ? `${topApp.appName} was interrupted ${topApp.count} times. You chose something else ${interruptions.choseAlternativeCount} times.`
      : `myBishBash appeared before your apps ${plural(interruptions.interruptedCount, "time")}. You chose something else ${plural(interruptions.choseAlternativeCount, "time")}.`;
    sections.push({
      id: "interruptions",
      title: "Interruptions",
      body: topApp
        ? `${topApp.appName} was interrupted ${plural(topApp.count, "time")}. You chose something else ${plural(interruptions.choseAlternativeCount, "time")}.`
        : body,
      details: [
        interruptions.continueToAppCount > 0 ? `${plural(interruptions.continueToAppCount, "time")} continued to app` : null,
        ...(interruptions.byApp ?? []).slice(1, 4).map((row) => `${row.appName}: ${row.count}`),
      ].filter(Boolean),
    });
  }

  return (
    <div className="modal-backdrop morning-summary-backdrop" onClick={onClose}>
      <div className="composer morning-summary-card" data-testid="morning-summary" onClick={(event) => event.stopPropagation()}>
        <div className="composer-heading">
          <p className="eyebrow">Morning Summary</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="morning-summary-hero">
          <span className="morning-summary-icon" aria-hidden="true"><BrandMark /></span>
          <h2>Yesterday’s reflection</h2>
          <p>{summary.dateKey}</p>
        </div>
        {sections.length === 0 ? (
          <div className="morning-summary-section">
            <h3>A quiet day in the log.</h3>
            <p>There is not much to reflect back from yesterday yet. You can just keep going gently today.</p>
          </div>
        ) : (
          <div className="morning-summary-sections">
            {sections.map((section) => (
              <section key={section.id} className="morning-summary-section">
                <h3>{section.title}</h3>
                <p>{section.body}</p>
                {section.details.length > 0 ? (
                  <div className="morning-summary-detail-list">
                    {section.details.map((detail) => (
                      <span key={detail}>{detail}</span>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        )}
        <button type="button" className="save-button morning-summary-cta" onClick={onClose}>
          Continue to myBishBash
        </button>
      </div>
    </div>
  );
}
