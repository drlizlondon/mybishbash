import CardIcon from "../../components/CardIcon";

export default function LibrarySectionHeader({ id, icon, title, description, countLabel, isOpen, onToggle, onAdd, addLabel, testId }) {
  return (
    <div className="library-section-header">
      <button
        type="button"
        className="library-section-toggle"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={id}
        data-testid={`${testId}-toggle`}
      >
        <span className="tile library-section-icon">
          <CardIcon icon={icon} />
        </span>
        <span className="library-section-copy">
          <span className="library-section-title">{title}</span>
          <span className="library-section-description">{description}</span>
        </span>
      </button>
      <span className="library-section-meta">
        <span className="library-section-count">{countLabel}</span>
        <button
          type="button"
          className="library-section-add"
          onClick={onAdd}
          aria-label={addLabel}
          data-testid={`${testId}-add`}
        >
          +
        </button>
        <span className={`library-section-chevron ${isOpen ? "open" : ""}`} aria-hidden="true">
          ›
        </span>
      </span>
    </div>
  );
}

