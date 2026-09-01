import { useState } from "react";
import { FREQUENCY_OPTIONS, TIME_WINDOWS } from "../../utils";

export default function PackEditor({ packTitle, initialCard, onClose, onSave }) {
  const [frequency, setFrequency] = useState(initialCard?.frequency ?? "once_daily");
  const [timingWindows, setTimingWindows] = useState(initialCard?.timingWindows ?? ["morning", "day", "evening"]);

  function handleSubmit(event) {
    event.preventDefault();
    onSave({ frequency, timingWindows });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="composer pack-editor" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className="composer-heading">
          <p className="eyebrow">Edit pack</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="field">
          <span>{packTitle}</span>
          <p className="pack-editor-copy">Choose when this pack can appear and how often it can come back.</p>
        </div>
        <div className="field">
          <span>How often can this show up?</span>
          <div className="frequency-grid">
            {FREQUENCY_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`frequency-option ${frequency === option.id ? "selected" : ""}`}
                onClick={() => setFrequency(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>When should this pack appear?</span>
          <div className="timing-grid">
            {TIME_WINDOWS.map((windowOption) => (
              <label key={windowOption.id} className="timing-option">
                <input
                  type="checkbox"
                  checked={timingWindows.includes(windowOption.id)}
                  onChange={() => {
                    setTimingWindows((current) => {
                      if (current.includes(windowOption.id)) {
                        const next = current.filter((item) => item !== windowOption.id);
                        return next.length === 0 ? current : next;
                      }
                      return [...current, windowOption.id];
                    });
                  }}
                />
                <span>{windowOption.label}</span>
              </label>
            ))}
          </div>
        </div>
        <button type="submit" className="save-button">
          Save pack
        </button>
      </form>
    </div>
  );
}
