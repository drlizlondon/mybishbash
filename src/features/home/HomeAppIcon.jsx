import { useState } from "react";
import { AppsGlyph } from "../../app/shell/glyphs";

export default function HomeAppIcon({ src }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="home-app-icon-fallback" aria-hidden="true">
        <AppsGlyph />
      </span>
    );
  }
  return <img src={src} alt="" className="home-app-icon" onError={() => setFailed(true)} />;
}

