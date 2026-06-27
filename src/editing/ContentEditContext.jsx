import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { landingContent } from "../content/landingContent";

const ContentEditContext = createContext(null);
const DEFAULT_STORAGE_KEY = "mybishbash.landingContentDraft.v10";

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

function isDefaultContentCompatible(value) {
  return (
    Array.isArray(value?.hero?.headline) &&
    value.hero.headline.length === landingContent.hero.headline.length &&
    typeof value?.hero?.gold === "string" &&
    Array.isArray(value?.proof) &&
    value.proof.length === landingContent.proof.length
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

export function ContentEditProvider({
  children,
  initialContent = landingContent,
  storageKey = DEFAULT_STORAGE_KEY,
  saveEndpoint = "/__save-landing-content",
  saveLabel = "src/content/landingContent.js",
  isContentCompatible = isDefaultContentCompatible,
}) {
  const isLocalPreview = typeof window !== "undefined" && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const isDev = import.meta.env.DEV || isLocalPreview;
  const [content, setContent] = useState(() => {
    if (!isDev || typeof window === "undefined") return initialContent;

    try {
      const draft = window.localStorage.getItem(storageKey);
      if (!draft) return initialContent;

      const parsed = JSON.parse(draft);
      return isContentCompatible(parsed) ? parsed : initialContent;
    } catch {
      return initialContent;
    }
  });
  const [editMode, setEditMode] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!isDev) return;
    if (!isContentCompatible(content)) {
      window.localStorage.removeItem(storageKey);
      setContent(initialContent);
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(content));
  }, [content, initialContent, isContentCompatible, isDev, storageKey]);

  const getValue = useCallback((path) => getAtPath(content, path), [content]);

  const updateValue = useCallback((path, value) => {
    setContent((current) => setAtPath(current, path, value));
  }, []);

  const resetDraft = useCallback(() => {
    setContent(initialContent);
    window.localStorage.removeItem(storageKey);
    setStatus("Draft reset");
  }, [initialContent, storageKey]);

  const copyJson = useCallback(async () => {
    await copyToClipboard(JSON.stringify(content, null, 2));
    setStatus("JSON copied");
  }, [content]);

  const saveToFile = useCallback(async () => {
    const response = await fetch(saveEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    setStatus(`Saved to ${saveLabel}`);
  }, [content, saveEndpoint, saveLabel]);

  const value = useMemo(
    () => ({
      content,
      copyJson,
      editMode,
      getValue,
      isDev,
      resetDraft,
      saveLabel,
      saveToFile,
      setEditMode,
      setStatus,
      status,
      updateValue,
    }),
    [content, copyJson, editMode, getValue, isDev, resetDraft, saveLabel, saveToFile, status, updateValue],
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
  const { copyJson, editMode, isDev, resetDraft, saveLabel, saveToFile, setEditMode, setStatus, status } =
    useContentEdit();
  const panelRef = useRef(null);
  const moveOffsetRef = useRef({ x: 0, y: 0 });
  const clampPosition = useCallback((nextPosition, panel = null) => {
    if (typeof window === "undefined" || nextPosition.x == null || nextPosition.y == null) {
      return nextPosition;
    }

    const width = panel?.offsetWidth ?? Math.min(300, window.innerWidth - 24);
    const height = panel?.offsetHeight ?? 320;
    return {
      x: Math.min(Math.max(8, nextPosition.x), Math.max(8, window.innerWidth - width - 8)),
      y: Math.min(Math.max(8, nextPosition.y), Math.max(8, window.innerHeight - height - 8)),
    };
  }, []);
  const [position, setPosition] = useState(() => {
    if (typeof window === "undefined") return { x: null, y: null };
    try {
      const stored = window.localStorage.getItem("mybishbash.editPanelPosition.v1");
      return stored ? clampPosition(JSON.parse(stored)) : { x: null, y: null };
    } catch {
      return { x: null, y: null };
    }
  });
  const positionRef = useRef(position);
  const [isMoving, setIsMoving] = useState(false);

  const storePosition = useCallback((nextPosition, panel = panelRef.current) => {
    const next = clampPosition(nextPosition, panel);
    positionRef.current = next;
    setPosition(next);
    window.localStorage.setItem("mybishbash.editPanelPosition.v1", JSON.stringify(next));
    return next;
  }, [clampPosition]);

  useEffect(() => {
    if (!isDev) return undefined;

    function handleResize() {
      setPosition((current) => {
        if (current.x == null || current.y == null) return current;
        const next = clampPosition(current);
        positionRef.current = next;
        window.localStorage.setItem("mybishbash.editPanelPosition.v1", JSON.stringify(next));
        return next;
      });
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPosition, isDev]);

  useEffect(() => {
    if (!isDev || !isMoving) return undefined;

    function handlePointerMove(event) {
      const panel = panelRef.current;
      if (!panel) return;
      storePosition({
        x: event.clientX - moveOffsetRef.current.x,
        y: event.clientY - moveOffsetRef.current.y,
      }, panel);
    }

    function handlePointerDown(event) {
      if (panelRef.current?.contains(event.target)) return;
      setIsMoving(false);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        setIsMoving(false);
        return;
      }

      const keyDeltas = {
        ArrowDown: { x: 0, y: 10 },
        ArrowLeft: { x: -10, y: 0 },
        ArrowRight: { x: 10, y: 0 },
        ArrowUp: { x: 0, y: -10 },
      };
      const delta = keyDeltas[event.key];
      if (!delta) return;
      event.preventDefault();
      const fallback = panelRef.current?.getBoundingClientRect();
      const current = positionRef.current;
      const start = current.x == null || current.y == null
        ? { x: fallback?.left ?? 12, y: fallback?.top ?? 12 }
        : current;
      storePosition({ x: start.x + delta.x, y: start.y + delta.y });
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    document.body.classList.add("edit-panel-moving");
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("edit-panel-moving");
    };
  }, [isDev, isMoving, storePosition]);

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

  function startDrag(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    if (isMoving) {
      setIsMoving(false);
      return;
    }
    const panel = event.currentTarget.closest(".edit-panel");
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    moveOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    storePosition({ x: rect.left, y: rect.top }, panel);
    setIsMoving(true);
  }

  const style = position.x == null || position.y == null
    ? undefined
    : { "--edit-panel-x": `${position.x}px`, "--edit-panel-y": `${position.y}px` };

  return (
    <aside
      className={`edit-panel${style ? " edit-panel-positioned" : ""}${isMoving ? " is-moving" : ""}`}
      ref={panelRef}
      style={style}
      aria-label="Local content editor"
    >
      <button type="button" aria-pressed={isMoving} className="edit-panel-handle" onPointerDown={startDrag}>
        {isMoving ? "Lock editor" : "Move editor"}
      </button>
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
      <p>Editing: {saveLabel}</p>
      {status ? <strong>{status}</strong> : null}
    </aside>
  );
}
