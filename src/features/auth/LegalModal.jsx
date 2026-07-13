import { useEffect, useState } from "react";
import { BASE_PATH } from "../../app/router/routes";

export default function LegalModal({ docType, onClose }) {
  const docUrl = `${BASE_PATH}/${docType === 'terms' ? 'terms-of-use.md' : 'privacy-policy.md'}`;
  const title = docType === 'terms' ? 'Terms of Use' : 'Privacy Policy';
  const [content, setContent] = useState("Loading...");

  useEffect(() => {
    fetch(docUrl)
      .then((res) => res.text())
      .then((text) => {
        const parsed = text
          .replace(/^# (.*$)/gim, "<h1>$1</h1>")
          .replace(/^## (.*$)/gim, "<h2>$1</h2>")
          .replace(/^### (.*$)/gim, "<h3>$1</h3>")
          .replace(/\*\*(.*)\*\*/gim, "<strong>$1</strong>")
          .replace(/^- (.*$)/gim, "<li>$1</li>")
          .replace(/^---$/gim, "<hr />");

        const lines = parsed.split("\n");
        let inList = false;
        const formatted = lines
          .map((line) => {
            if (line.startsWith("<li>")) {
              if (!inList) {
                inList = true;
                return "<ul>" + line;
              }
              return line;
            } else {
              let out = line;
              if (inList) {
                inList = false;
                out = "</ul>" + line;
              }
              if (!line.startsWith("<h") && !line.startsWith("<u") && !line.startsWith("<hr") && line.trim().length > 0) {
                return "<p>" + out + "</p>";
              }
              return out;
            }
          })
          .join("");

        setContent(formatted + (inList ? "</ul>" : ""));
      })
      .catch(() => setContent("<p>Failed to load document.</p>"));
  }, [docUrl]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="composer pack-editor" style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="composer-heading" style={{ flexShrink: 0 }}>
          <p className="eyebrow">{title}</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: '0 24px 24px' }}>
          <div className="legal-content" style={{ lineHeight: "1.6", color: "var(--charcoal)", fontSize: "16px" }} dangerouslySetInnerHTML={{ __html: content }} />
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: "\n" +
        "  .legal-content h1 { font-size: 24px; font-weight: bold; margin-bottom: 16px; margin-top: 0; }\n" +
        "  .legal-content h1:first-child { margin-top: 0; }\n" +
        "  .legal-content h2 { font-size: 20px; font-weight: bold; margin-bottom: 12px; margin-top: 24px; }\n" +
        "  .legal-content h3 { font-size: 16px; font-weight: bold; margin-bottom: 12px; margin-top: 24px; }\n" +
        "  .legal-content p { margin-bottom: 16px; }\n" +
        "  .legal-content ul { margin-bottom: 16px; padding-left: 20px; list-style-type: disc; }\n" +
        "  .legal-content li { margin-bottom: 8px; }\n" +
        "  .legal-content hr { border: none; border-top: 1px solid rgba(0,0,0,0.1); margin: 32px 0; }\n"
      }} />
    </div>
  );
}
