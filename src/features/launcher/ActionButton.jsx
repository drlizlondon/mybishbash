import { PremiumActionButton } from "./CardRevealTemplate";

export default function ActionButton({ label, onClick, tone = "ghost", href }) {
  return (
    <PremiumActionButton
      label={label}
      variant={tone === "solid" ? "primary" : "secondary"}
      onClick={onClick}
      href={href}
    />
  );
}

