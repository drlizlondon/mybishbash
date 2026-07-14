export default function CardIcon({ icon = "heart", sourcePackId }) {
  if (sourcePackId === "encouraging-bible-verses" || icon === "book") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
        <path d="M12 16h18c6 0 10 4 10 10v24H22c-6 0-10-4-10-10V16z" />
        <path d="M52 16H34c-6 0-10 4-10 10v24h18c6 0 10-4 10-10V16z" />
        <path d="M24 20h12" />
        <path d="M28 28h8" />
      </svg>
    );
  }

  if (sourcePackId === "motivational-quotes" || icon === "quote") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
        <path d="M20 24c0 8-4 14-12 18 1-6 3-10 7-13-5-1-8-4-8-9 0-5 4-9 9-9 5 0 9 4 9 13z" />
        <path d="M48 24c0 8-4 14-12 18 1-6 3-10 7-13-5-1-8-4-8-9 0-5 4-9 9-9 5 0 9 4 9 13z" />
      </svg>
    );
  }

  if (icon === "water") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
        <path d="M22 18h20l-3 32H25l-3-32z" />
        <path d="M24 30c2-2 5-3 8-3s6 1 8 3" />
        <path d="M28 13c0-3 2-5 4-5s4 2 4 5" />
      </svg>
    );
  }

  if (icon === "moon") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
        <path d="M37 10c-9 3-15 12-15 22 0 14 11 24 25 24 4 0 7-1 10-2-4 4-10 6-16 6-14 0-26-11-26-26 0-11 7-21 17-24 2-1 4-1 5 0z" />
        <path d="M46 17l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
        <path d="M52 27l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
      </svg>
    );
  }

  if (icon === "leaf") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration earthy" aria-hidden="true">
        <path d="M32 50V23" />
        <path d="M32 31c-7 0-12-4-12-11 7 0 12 4 12 11z" />
        <path d="M32 36c7 0 12-4 12-11-7 0-12 4-12 11z" />
        <path d="M32 44c-5 0-9 4-9 9 5 0 9-4 9-9z" />
      </svg>
    );
  }

  if (icon === "flower") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration bloom" aria-hidden="true">
        <circle cx="32" cy="28" r="4" />
        <path d="M32 51V32" />
        <path d="M32 24c0-7 5-12 12-12 0 7-5 12-12 12z" />
        <path d="M32 24c0-7-5-12-12-12 0 7 5 12 12 12z" />
        <path d="M28 28c-7 0-12-5-12-12 7 0 12 5 12 12z" />
        <path d="M36 28c7 0 12-5 12-12-7 0-12 5-12 12z" />
        <path d="M32 42c-5 0-9 4-9 9 5 0 9-4 9-9z" />
        <path d="M32 42c5 0 9 4 9 9-5 0-9-4-9-9z" />
      </svg>
    );
  }

  if (icon === "star") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
        <path d="M32 10l4 12 12 4-12 4-4 12-4-12-12-4 12-4z" />
      </svg>
    );
  }

  if (icon === "heart") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
        <path d="M20 18c0-4 3-7 7-7 2 0 4 1 5 3 1-2 3-3 5-3 4 0 7 3 7 7 0 10-12 16-12 16s-12-6-12-16z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
      <path d="M20 18c0-4 3-7 7-7 2 0 4 1 5 3 1-2 3-3 5-3 4 0 7 3 7 7 0 10-12 16-12 16s-12-6-12-16z" />
    </svg>
  );
}
