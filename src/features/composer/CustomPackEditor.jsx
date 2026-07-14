import { useState } from "react";

export default function CustomPackEditor({ initialPack, linkedVersionId, versions, onClose, onSave }) {
  const [name, setName] = useState(initialPack?.name ?? "");
  const initialMessages = initialPack?.messages ?? initialPack?.cards?.map((card) => card.text ?? card.title).filter(Boolean) ?? [""];
  const [messages, setMessages] = useState(initialMessages);
  const [selectedVersion, setSelectedVersion] = useState(initialPack?.targetApp ?? initialPack?.linkedVersionId ?? linkedVersionId ?? "");

  function updateMessage(index, value) {
    setMessages((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  function addMessage() {
    setMessages((current) => [...current, ""]);
  }

  function removeMessage(index) {
    setMessages((current) => (current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index)));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSave({
      id: initialPack?.id,
      name,
      linkedVersionId: selectedVersion,
      messages,
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="composer pack-editor" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className="composer-heading">
          <p className="eyebrow">{initialPack ? "Edit app pack" : "Create app pack"}</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        <label className="field">
          <span>Pack name</span>
          <input
            className="settings-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Instagram Interruptions"
          />
        </label>
        <label className="field">
          <span>Linked Home Screen version, optional</span>
          <select
            className="settings-input"
            value={selectedVersion}
            onChange={(event) => setSelectedVersion(event.target.value)}
          >
            <option value="">Not linked</option>
            {Object.values(versions).filter((version) => version.id !== "mybishbash").map((version) => (
              <option key={version.id} value={version.id}>
                {version.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Messages</span>
          <div className="custom-pack-message-grid">
            {messages.map((message, index) => (
              <div key={`${index}-${initialPack?.id ?? "new"}`} className="custom-pack-message-row">
                <textarea
                  value={message}
                  onChange={(event) => updateMessage(index, event.target.value)}
                  rows={3}
                  placeholder="Do you really want to go on Instagram right now?"
                />
                <button
                  type="button"
                  className="text-button danger-soft-button"
                  onClick={() => removeMessage(index)}
                >
                  Delete message
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="pack-button secondary" onClick={addMessage}>
            Add message
          </button>
        </div>
        <button type="submit" className="save-button">
            Save app pack
        </button>
      </form>
    </div>
  );
}
