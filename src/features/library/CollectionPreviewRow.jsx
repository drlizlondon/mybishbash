import CardIcon from "../../components/CardIcon";

// ─── CollectionPreviewRow ────────────────────────────────────────────────────
// A richer list row for use inside ExpandableCollection.
// Unlike LibraryListRow it includes an item icon column and an optional status
// badge, giving the "drawer glimpse" feel described in the design spec.

export default function CollectionPreviewRow({
  item,
  icon = "heart",
  art = null,
  title,
  secondary,
  statusBadge,
  menuOpenId,
  setMenuOpenId,
  onOpen,
  menuActions = [],
}) {
  return (
    <article
      className={`collection-preview-row${menuOpenId === item.id ? " menu-open" : ""}`}
      data-testid={`library-row-${item.id}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span className="collection-preview-icon">
        {art ?? <CardIcon icon={icon} />}
      </span>
      <div className="collection-preview-copy">
        <h3>{title}</h3>
        {secondary ? <p>{secondary}</p> : null}
      </div>
      {statusBadge ? (
        <span className={`collection-preview-status ${statusBadge}`}>
          {statusBadge}
        </span>
      ) : null}
      <div className="menu-wrap">
        <button
          type="button"
          className="menu-trigger collection-preview-menu-trigger"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpenId((current) => (current === item.id ? null : item.id));
          }}
          aria-label="Card options"
        >
          •••
        </button>
        {menuOpenId === item.id ? (
          <div className="menu">
            {menuActions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={action.danger ? "danger-soft" : ""}
                disabled={action.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick();
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
