export default function TodayPersonalCardsPanel({ todayPersonalLibrary, onCreatePersonal, onBackToLibrary, onOpenCard }) {
  const completed = todayPersonalLibrary.completed ?? [];
  const outstanding = todayPersonalLibrary.outstanding ?? [];
  const hasAnyPersonalCards = todayPersonalLibrary.totalCount > 0;
  const hasTodayCards = completed.length > 0 || outstanding.length > 0;

  function renderTodayCard(card, status) {
    return (
      <button
        key={card.id}
        type="button"
        className="today-personal-card-row"
        data-testid={`today-personal-card-${card.id}`}
        onClick={() => onOpenCard(card.id)}
      >
        <span className={`today-personal-status ${status}`}>{status === "completed" ? "Completed" : "Outstanding"}</span>
        <strong>{card.promptText}</strong>
      </button>
    );
  }

  return (
    <section className="library today-personal-library" data-testid="today-personal-library">
      <div className="section-heading solo">
        <div>
          <h2>Today’s Personal Cards</h2>
          <p>Completed today at the top. Outstanding cards below.</p>
        </div>
        <button type="button" className="text-button" onClick={onBackToLibrary}>
          All Library
        </button>
      </div>

      {!hasAnyPersonalCards ? (
        <div className="today-personal-empty" data-testid="today-personal-empty">
          <h3>No Personal Cards yet.</h3>
          <button type="button" className="save-button" onClick={onCreatePersonal}>
            Create Personal Card
          </button>
        </div>
      ) : null}

      {hasAnyPersonalCards && !hasTodayCards ? (
        <div className="today-personal-empty" data-testid="today-personal-clear">
          <h3>You’re all clear today.</h3>
          <p>Nothing needs your attention right now.</p>
        </div>
      ) : null}

      {completed.length > 0 ? (
        <section className="today-personal-section" aria-labelledby="today-personal-completed">
          <h3 id="today-personal-completed">Completed today</h3>
          <div className="today-personal-list">
            {completed.map((card) => renderTodayCard(card, "completed"))}
          </div>
        </section>
      ) : null}

      {outstanding.length > 0 ? (
        <section className="today-personal-section" aria-labelledby="today-personal-outstanding">
          <h3 id="today-personal-outstanding">Outstanding today</h3>
          <div className="today-personal-list">
            {outstanding.map((card) => renderTodayCard(card, "outstanding"))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
