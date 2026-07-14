import { useEffect, useRef, useState } from "react";
import CardIcon from "../../components/CardIcon";

// ─── ExpandableCollection ────────────────────────────────────────────────────
// Reusable animated collection component for the Library page.
// Shows a header (icon, title, description, count pill, add button, chevron)
// and an animated body that reveals up to `maxPreview` items when open.
// When more items exist than the preview cap, a "View all" footer appears.
// If `onViewAll` is provided it is called; otherwise all items expand inline.

export default function ExpandableCollection({
  id,
  icon,
  title,
  description,
  countLabel,
  items = [],
  maxPreview = 5,
  isOpen,
  onToggle,
  onAdd,
  addLabel,
  onViewAll,
  testId,
  renderRow,
  emptyLabel = "Nothing here yet",
}) {
  const [showAll, setShowAll] = useState(false);

  // Collapse "show all" when the section closes
  const prevIsOpen = useRef(isOpen);
  useEffect(() => {
    if (!isOpen && prevIsOpen.current) setShowAll(false);
    prevIsOpen.current = isOpen;
  }, [isOpen]);

  const displayItems = showAll ? items : items.slice(0, maxPreview);
  const hasMore = items.length > maxPreview && !showAll;

  function handleViewAll() {
    if (onViewAll) {
      onViewAll();
    } else {
      setShowAll(true);
    }
  }

  return (
    <div className={`expandable-collection${isOpen ? " open" : ""}`} data-testid={testId}>
      {/* Header ─ the toggle button covers the icon + copy; add + chevron are independent */}
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
          <span
            className={`library-section-chevron${isOpen ? " open" : ""}`}
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </span>
      </div>

      {/* Animated body ─ CSS grid-template-rows trick for smooth height animation */}
      <div
        className={`expandable-collection-body-wrap${isOpen ? " open" : ""}`}
        id={id}
        aria-hidden={!isOpen}
      >
        <div className="expandable-collection-body-inner">
          <div className="library-list-card">
            {items.length === 0 ? (
              <article className="library-list-empty">
                <h3>{emptyLabel}</h3>
              </article>
            ) : null}
            {displayItems.map((item) => renderRow(item))}
            {items.length > 0 && hasMore ? (
              <button
                type="button"
                className="collection-view-all"
                onClick={handleViewAll}
              >
                View all {items.length} {items.length === 1 ? "item" : "items"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
