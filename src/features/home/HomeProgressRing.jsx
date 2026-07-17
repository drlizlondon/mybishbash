export default function HomeProgressRing({ percent }) {
  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <svg
      viewBox="0 0 94 94"
      className="home-progress-ring"
      data-testid="home-progress-ring"
      aria-hidden="true"
      style={{
        "--home-ring-circumference": circumference,
        "--home-ring-offset": offset,
      }}
    >
      <circle className="home-progress-ring-track" cx="47" cy="47" r={radius} />
      <circle className="home-progress-ring-value" cx="47" cy="47" r={radius} />
    </svg>
  );
}

