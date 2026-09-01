/**
 * Small, stateless SVG glyph components shared across panels.
 * Extracted from App.jsx so that page-level components (LogPanel, etc.)
 * can import them without pulling in the full monolith.
 */

export function HeartGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="heart-glyph" aria-hidden="true">
      <path d="M16 27s-9-6-12-11c-3-5 0-11 6-11 3 0 5 1 6 4 1-3 3-4 6-4 6 0 9 6 6 11-3 5-12 11-12 11z" />
    </svg>
  );
}

export function LogGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="nav-glyph" aria-hidden="true">
      <path d="M16 24V12" />
      <path d="M16 12c4 0 7-3 7-7-4 0-7 3-7 7z" />
      <path d="M16 15c-4 0-7 3-7 7 4 0 7-3 7-7z" />
      <path d="M16 18c4 0 7 3 7 7-4 0-7-3-7-7z" />
    </svg>
  );
}
