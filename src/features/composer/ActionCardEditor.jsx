import { useState } from "react";

export default function ActionCardEditor({ onClose, onSave }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [launchUrl, setLaunchUrl] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      body: body.trim(),
      category: category.trim(),
      launchUrl: launchUrl.trim(),
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="composer pack-editor" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className="composer-heading">
          <p className="eyebrow">New Action Card</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        <label className="field">
          <span>Title</span>
          <input className="settings-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Call a family member" required />
        </label>
        <label className="field">
          <span>Body</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="A quick catch-up might feel better..." />
        </label>
        <label className="field">
          <span>Category</span>
          <input className="settings-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Connection" />
        </label>
        <label className="field">
          <span>Launch URL (optional)</span>
          <input type="url" className="settings-input" value={launchUrl} onChange={(e) => setLaunchUrl(e.target.value)} placeholder="https://..." />
        </label>
        <button type="submit" className="save-button">
          Save Action Card
        </button>
      </form>
    </div>
  );
}

