import CardIcon from "../../components/CardIcon";
import { getStatusMeta } from "../../utils";
import { getHomeCardTitle } from "./homeState";

export default function HomeReminderCard({
  item,
  timezone,
  menuOpenId,
  setMenuOpenId,
  openSpecificReveal,
  openPackReveal,
  openEditor,
  openPackEditor,
  handleResetItem,
  handleTogglePause,
  handleDeleteCard,
  handleDuplicateCard,
  deactivatePack,
}) {
  const status = getStatusMeta(item.representative, new Date(), timezone);
  const openCard = () => {
    if (item.type === "pack") {
      openPackReveal(item.id);
      return;
    }
    openSpecificReveal(item.id);
  };

  return (
    <article
      className={`reminder-card ${menuOpenId === item.id ? "menu-open" : ""}`}
      onClick={openCard}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openCard();
        }
      }}
    >
      <div className="reminder-top">
        <div className="reminder-icon-bubble">
          <CardIcon icon={item.representative.icon} sourcePackId={item.representative.sourcePackId} />
        </div>
        <div className="menu-wrap">
          <button
            type="button"
            className="menu-trigger reminder-menu-trigger"
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
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (item.type === "pack") {
                    openPackEditor(item.id);
                    return;
                  }
                  openEditor(item.id);
                }}
              >
                {item.type === "pack" ? "Edit pack" : "Edit"}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (item.type === "pack") return;
                  handleDuplicateCard(item.id);
                }}
                disabled={item.type === "pack"}
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleResetItem(item);
                }}
              >
                Reset for today
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleTogglePause(item);
                }}
              >
                {item.representative.paused ? "Unpause" : "Pause"}
              </button>
              <button
                type="button"
                className="danger-soft"
                onClick={(event) => {
                  event.stopPropagation();
                  if (item.type === "pack") {
                    deactivatePack(item.id);
                    return;
                  }
                  handleDeleteCard(item.id);
                }}
              >
                {item.type === "pack" ? "Remove pack" : "Delete"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <h3>{getHomeCardTitle(item.representative)}</h3>
      <span className={`reminder-status-pill ${status.badge}`}>{status.badge}</span>
    </article>
  );
}

