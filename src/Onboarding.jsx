import { useState, useRef } from "react";

export default function Onboarding({ onCreate }) {
  const slides = [
    {
      id: "future-self",
      message: "Your earlier self left a quiet note for right now.",
      support: "BishBash lets a clearer version of you cut through the noise.",
    },
    {
      id: "tiny-actions",
      message: "Small caring actions are easier to hear than big promises.",
      support: "Drink water. Stretch. Read your Bible. Tiny nudges still count.",
    },
    {
      id: "one-at-a-time",
      message: "One gentle interruption. One moment of attention.",
      support: "Every time BishBash opens, it shows one soft message instead of a pile.",
    },
    {
      id: "private-ritual",
      message: "Private, synced, and just for future-you.",
      support: "Use your sync code to connect every launcher, browser, and device to the same BishBash.",
    },
  ];
  const [activeSlide, setActiveSlide] = useState(0);
  const touchStartX = useRef(null);

  function goToSlide(index) {
    const total = slides.length;
    setActiveSlide((index + total) % total);
  }

  function handleTouchStart(event) {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event) {
    if (touchStartX.current == null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;

    if (Math.abs(delta) < 36) return;
    if (delta < 0) {
      goToSlide(activeSlide + 1);
      return;
    }
    goToSlide(activeSlide - 1);
  }

  return (
    <div className="overlay-screen onboarding-screen">
      <div className="onboarding-shell">
        <header className="onboarding-brand">
          <span className="onboarding-heart" aria-hidden="true">
            <HeartGlyph />
          </span>
          <h1>BishBash</h1>
          <p>private little messages from your earlier self</p>
        </header>

        <div
          className="onboarding-carousel"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            type="button"
            className="onboarding-arrow onboarding-arrow-left"
            onClick={() => goToSlide(activeSlide - 1)}
            aria-label="Show previous welcome card"
          >
            <ChevronLeftGlyph />
          </button>
          <div
            className="onboarding-track"
            style={{ transform: `translateX(-${activeSlide * 100}%)` }}
          >
            {slides.map((slide) => (
              <article className="onboarding-feature-card" key={slide.id}>
                <span className="feature-mini-heart" aria-hidden="true">
                  <HeartGlyph />
                </span>
                <h2>{slide.message}</h2>
                <p className="feature-support">{slide.support}</p>
                <div className="feature-scene" aria-hidden="true">
                  <span className="feature-star feature-star-one" />
                  <span className="feature-star feature-star-two" />
                  <span className="feature-star feature-star-three" />
                  <span className="feature-sun" />
                  <span className="feature-horizon" />
                  <span className="feature-reflection" />
                  <span className="feature-stone" />
                </div>
              </article>
            ))}
          </div>
          <button
            type="button"
            className="onboarding-arrow onboarding-arrow-right"
            onClick={() => goToSlide(activeSlide + 1)}
            aria-label="Show next welcome card"
          >
            <ChevronRightGlyph />
          </button>
        </div>

        <div className="onboarding-pagination">
          {slides.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`pagination-dot ${index === activeSlide ? "active" : ""}`}
              aria-label={`Show onboarding card ${index + 1}`}
              aria-pressed={index === activeSlide}
              onClick={() => goToSlide(index)}
            />
          ))}
        </div>

        <div className="onboarding-actions">
          <button type="button" className="save-button" onClick={onCreate}>
            Make your first BishBash
          </button>
        </div>
      </div>
    </div>
  );
}

function ChevronLeftGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
  );
}

function ChevronRightGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9.5 5.5 16 12l-6.5 6.5" />
    </svg>
  );
}

function HeartGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="heart-glyph" aria-hidden="true">
      <path d="M16 27s-9-6-12-11c-3-5 0-11 6-11 3 0 5 1 6 4 1-3 3-4 6-4 6 0 9 6 6 11-3 5-12 11-12 11z" />
    </svg>
  );
}