import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { landingContent } from "../content/landingContent";

const ContentEditContext = createContext(null);
const STORAGE_KEY = "bishbash.landingContentDraft.v8";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getAtPath(source, path) {
  return path.split(".").reduce((current, key) => current?.[key], source);
}

function setAtPath(source, path, value) {
  const next = clone(source);
  const keys = path.split(".");
  let current = next;

  keys.slice(0, -1).forEach((key) => {
    current = current[key];
  });

  current[keys.at(-1)] = value;
  return next;
}

function isLandingContentCompatible(value) {
  return (
    Array.isArray(value?.hero?.headline) &&
    value.hero.headline.length === landingContent.hero.headline.length &&
    value.hero.headline[4] === landingContent.hero.headline[4]
  );
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function ContentEditProvider({ children }) {
  const isDev = import.meta.env.DEV;
  const [content, setContent] = useState(() => {
    if (!isDev || typeof window === "undefined") return landingContent;

    try {
      const draft = window.localStorage.getItem(STORAGE_KEY);
      if (!draft) return landingContent;

      const parsed = JSON.parse(draft);
      return isLandingContentCompatible(parsed) ? parsed : landingContent;
    } catch {
      return landingContent;
    }
  });
  const [editMode, setEditMode] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!isDev) return;
    if (!isLandingContentCompatible(content)) {
      window.localStorage.removeItem(STORAGE_KEY);
      setContent(landingContent);
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
  }, [content, isDev]);

  const getValue = useCallback((path) => getAtPath(content, path), [content]);

  const updateValue = useCallback((path, value) => {
    setContent((current) => setAtPath(current, path, value));
  }, []);

  const resetDraft = useCallback(() => {
    setContent(landingContent);
    window.localStorage.removeItem(STORAGE_KEY);
    setStatus("Draft reset");
  }, []);

  const copyJson = useCallback(async () => {
    await copyToClipboard(JSON.stringify(content, null, 2));
    setStatus("JSON copied");
  }, [content]);

  const saveToFile = useCallback(async () => {
    const response = await fetch("/__save-landing-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    setStatus("Saved to src/content/landingContent.js");
  }, [content]);

  const value = useMemo(
    () => ({
      content,
      copyJson,
      editMode,
      getValue,
      isDev,
      resetDraft,
      saveToFile,
      setEditMode,
      setStatus,
      status,
      updateValue,
    }),
    [content, copyJson, editMode, getValue, isDev, resetDraft, saveToFile, status, updateValue],
  );

  return <ContentEditContext.Provider value={value}>{children}</ContentEditContext.Provider>;
}

export function useContentEdit() {
  const context = useContext(ContentEditContext);

  if (!context) {
    throw new Error("useContentEdit must be used within ContentEditProvider");
  }

  return context;
}

export function EditableText({ as: Component = "span", path, className, children }) {
  const { editMode, getValue, isDev, updateValue } = useContentEdit();
  const value = getValue(path) ?? children ?? "";

  if (!isDev || !editMode) {
    return <Component className={className}>{value}</Component>;
  }

  return (
    <Component
      className={className}
      contentEditable
      suppressContentEditableWarning
      data-editable-text
      onBlur={(event) => updateValue(path, event.currentTarget.textContent)}
      onClick={(event) => event.stopPropagation()}
    >
      {value}
    </Component>
  );
}

export function EditPanel() {
  const { copyJson, editMode, isDev, resetDraft, saveToFile, setEditMode, setStatus, status } =
    useContentEdit();

  if (!isDev) return null;

  async function handleSave() {
    try {
      await saveToFile();
    } catch (error) {
      setStatus(`Save failed: ${error.message}`);
    }
  }

  async function handleCopy() {
    try {
      await copyJson();
    } catch (error) {
      setStatus(`Copy failed: ${error.message}`);
    }
  }

  return (
    <aside className="edit-panel" aria-label="Local content editor">
      <label className="edit-toggle">
        <input
          checked={editMode}
          onChange={(event) => setEditMode(event.target.checked)}
          type="checkbox"
        />
        Edit Mode
      </label>
      <div className="edit-actions">
        <button onClick={handleSave} type="button">
          Save to content file
        </button>
        <button onClick={handleCopy} type="button">
          Copy updated JSON
        </button>
        <button onClick={resetDraft} type="button">
          Reset local draft
        </button>
      </div>
      <p>Editing: src/content/landingContent.js</p>
      {status ? <strong>{status}</strong> : null}
    </aside>
  );
}
