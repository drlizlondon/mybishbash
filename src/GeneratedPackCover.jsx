// Deterministic branded pack covers. HQ supplies title, optional description,
// and cards; the cover system handles typography, colour, badges, and copy.

import { getCoverModel } from "./lib/generatedCover";

const LOGO_SRC = "/mybishbash/icons/mybishbash-cover.png";

export default function GeneratedPackCover({
  pack,
  variant = "grid",
  className = "",
  isActive = false,
  locked = false,
}) {
  const model = getCoverModel(pack, { variant, isActive, locked });
  const variantClass = variant === "bare" ? "bare" : variant;

  return (
    <div
      className={[
        "generated-cover",
        `generated-cover-${variantClass}`,
        `generated-cover-title-${model.titleScale}`,
        className,
      ].filter(Boolean).join(" ")}
      data-testid="generated-cover"
      data-cover-palette={model.palette.name}
      data-cover-title-scale={model.titleScale}
      style={{
        "--cover-bg": model.palette.bg,
        "--cover-bg-2": model.palette.bg2,
        "--cover-ink": model.palette.ink,
        "--cover-muted": model.palette.muted,
        "--cover-angle": `${model.angle}deg`,
        "--cover-spot-x": `${model.spotX}%`,
        "--cover-spot-y": `${model.spotY}%`,
        "--cover-title-size": model.titleSize,
      }}
      aria-hidden="true"
    >
      <img
        src={LOGO_SRC}
        alt=""
        className="generated-cover-logo-watermark"
        data-testid="generated-cover-logo"
        aria-hidden="true"
      />
      <span className="generated-cover-copy">
        <span className="generated-cover-topline">
          <span className="generated-cover-brand">
            <img src={LOGO_SRC} alt="" aria-hidden="true" />
            <span>MyBishBash</span>
          </span>
          {model.cardCountLabel ? <span className="generated-cover-count">{model.cardCountLabel}</span> : null}
        </span>
        {model.statusBadge ? (
          <span className="generated-cover-status-row">
            <span className="generated-cover-status">{model.statusBadge}</span>
          </span>
        ) : null}
        <span className="generated-cover-title" data-testid="generated-cover-title">
          {model.titleLines.map((line, index) => (
            <span key={`${line}-${index}`}>{line}</span>
          ))}
        </span>
        {model.tagline ? <span className="generated-cover-tagline">{model.tagline}</span> : null}
      </span>
    </div>
  );
}
