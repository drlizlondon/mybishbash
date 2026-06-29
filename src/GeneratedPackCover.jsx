// Deterministic branded pack covers. HQ supplies title, optional description,
// and cards; the cover system handles typography, colour, badges, and copy.

import { getCoverModel } from "./lib/generatedCover";
import { rebase } from "./lib/basePath";

const LOGO_SRC = rebase("/mybishbash/icons/mybishbash-cover.png");
const FALLBACK_PALETTE = {
  name: "charcoal",
  bg: "#211f1d",
  bg2: "#3b3732",
  ink: "#fff8ec",
  muted: "#d8cab4",
};
const FALLBACK_MODEL = {
  titleLines: ["Untitled Pack"],
  template: 0,
  initial: "M",
  titleScale: "medium",
  titleSize: "9.00cqw",
  tagline: "",
  cardCountLabel: "",
  statusBadge: "",
  palette: FALLBACK_PALETTE,
  angle: 145,
  spotX: 45,
  spotY: 36,
};

function getSafeCoverModel(pack, options) {
  try {
    const model = getCoverModel(pack, options) ?? {};
    const palette = model.palette ?? FALLBACK_PALETTE;
    const titleLines = Array.isArray(model.titleLines) && model.titleLines.length > 0
      ? model.titleLines.map((line) => String(line || "").trim()).filter(Boolean)
      : FALLBACK_MODEL.titleLines;

    return {
      ...FALLBACK_MODEL,
      ...model,
      palette: { ...FALLBACK_PALETTE, ...palette },
      titleLines: titleLines.length > 0 ? titleLines : FALLBACK_MODEL.titleLines,
      titleScale: model.titleScale || FALLBACK_MODEL.titleScale,
      titleSize: model.titleSize || FALLBACK_MODEL.titleSize,
    };
  } catch {
    return FALLBACK_MODEL;
  }
}

export default function GeneratedPackCover({
  pack,
  variant = "grid",
  className = "",
  isActive = false,
  locked = false,
}) {
  const model = getSafeCoverModel(pack, { variant, isActive, locked });
  const variantClass = variant === "bare" ? "bare" : variant;

  return (
    <div
      className={[
        "generated-cover",
        `generated-cover-${variantClass}`,
        `generated-cover-template-${model.template ?? 0}`,
        `generated-cover-title-${model.titleScale}`,
        className,
      ].filter(Boolean).join(" ")}
      data-testid="generated-cover"
      data-cover-palette={model.palette.name}
      data-cover-template={model.template ?? 0}
      data-cover-title-scale={model.titleScale}
      data-cover-initial={model.initial || "M"}
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
      <span className="generated-cover-form generated-cover-form-one" aria-hidden="true" />
      <span className="generated-cover-form generated-cover-form-two" aria-hidden="true" />
      <span className="generated-cover-form generated-cover-form-three" aria-hidden="true" />
      <span className="generated-cover-copy">
        <span className="generated-cover-topline">
          <span className="generated-cover-brand">
            <img src={LOGO_SRC} alt="" aria-hidden="true" />
          </span>
          {model.cardCountLabel ? <span className="generated-cover-count">{model.cardCountLabel}</span> : null}
          {!model.cardCountLabel && model.statusBadge ? <span className="generated-cover-status">{model.statusBadge}</span> : null}
        </span>
        {model.cardCountLabel && model.statusBadge ? (
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
