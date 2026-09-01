export default function LibraryListRow({
  item,
  title,
  secondary,
  menuOpenId,
  setMenuOpenId,
  onOpen,
  menuActions,
}) {
  return (
    <article
      className={`library-list-row ${menuOpenId === item.id ? "menu-open" : ""}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="library-list-copy">
        <h3>{title}</h3>
        {secondary ? <p>{secondary}</p> : null}
      </div>
      <div className="menu-wrap">
        <button
          type="button"
          className="menu-trigger library-list-menu-trigger"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpenId((current) => (current === item.id ? null : item.id));
          }}
          aria-label="Card menu"
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
                onClick={(event) => {
                  event.stopPropagation();
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
