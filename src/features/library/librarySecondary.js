import { getStatusMeta } from "../../utils";

export function getLibraryPersonalSecondary(card, timezone) {
  const status = getStatusMeta(card, new Date(), timezone);
  return status.badge;
}

export function getLibraryCommitmentSecondary(card) {
  if (card.commitmentCheckInEnabled && card.commitmentCheckInTime) {
    return `check-in ${card.commitmentCheckInTime}`;
  }
  return card.commitmentTimingMode === "custom" ? "custom timing" : "commitment";
}

export function getLibraryPackSecondary(item) {
  const count = item.count ?? 0;
  return `${count} ${count === 1 ? "card" : "cards"}`;
}
