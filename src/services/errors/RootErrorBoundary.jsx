import React from "react";
import { reportError } from "./reporter.js";

// Last-resort boundary above <App/>. The AppShellErrorBoundary inside App.jsx
// still handles shell-level recovery; this one catches everything above it
// (App() itself, providers, route parsing on boot). The fallback is
// deliberately dependency-free — inline styles only — so it renders even if
// styles.css or the rest of the app failed to load.
export class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ROOT_ERROR]", error, info);
    reportError(error, "boundary");
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main
        data-testid="root-error-fallback"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "24px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: "#F7F2EE",
          color: "#2D2A26",
          textAlign: "center",
        }}
      >
        <strong style={{ fontSize: "20px" }}>myBishBash</strong>
        <p style={{ margin: 0 }}>Something went wrong.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: "10px 24px",
            borderRadius: "999px",
            border: "1px solid #2D2A26",
            backgroundColor: "#2D2A26",
            color: "#F7F2EE",
            fontSize: "16px",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </main>
    );
  }
}
