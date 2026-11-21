// Build-time only (Vite SSR, `vite build --ssr`). Never shipped to browsers.
// Renders the first-time visitor's landing page to a string so dist/index.html
// carries real content in #root (MBB-28). No stored data, no consent state:
// the landing component reads neither when rendered in Node.
import { renderToString } from "react-dom/server";
import { EditableLandingPage } from "./features/marketing/LandingPage";

export function render(path) {
  if (path !== "/") return "";
  return renderToString(<EditableLandingPage />);
}
