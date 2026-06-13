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
        `generated-cover-layout-${model.layout}`,
        `generated-cover-texture-${model.texture}`,
        `generated-cover-accent-${model.accent}`,
        `generated-cover-title-${model.titleScale}`,
        className,
      ].filter(Boolean).join(" ")}
      data-testid="generated-cover"
      data-cover-palette={model.palette.name}
      data-cover-layout={model.layout}
      data-cover-texture={model.texture}
      data-cover-accent={model.accent}
      data-cover-title-scale={model.titleScale}
      style={{
        "--cover-bg": model.palette.bg,
        "--cover-bg-2": model.palette.bg2,
        "--cover-ink": model.palette.ink,
        "--cover-muted": model.palette.muted,
        "--cover-accent": model.palette.accent,
        "--cover-accent-2": model.palette.accent2,
        "--cover-angle": `${model.angle}deg`,
        "--cover-spot-x": `${model.spotX}%`,
        "--cover-spot-y": `${model.spotY}%`,
      }}
      aria-hidden="true"
    >
      <span className="generated-cover-accent-layer" aria-hidden="true" />
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
        {model.statusBadges.length > 0 ? (
          <span className="generated-cover-status-row">
            {model.statusBadges.map((badge) => (
              <span key={badge} className="generated-cover-status">{badge}</span>
            ))}
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
