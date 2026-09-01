import { useEffect, useState } from "react";

export default function AuthDiagnostics({ session }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const configured = !!import.meta.env.VITE_SUPABASE_URL;
    const hasKey = typeof window !== "undefined" ? !!window.localStorage.getItem("mybishbash.supabase.auth.v1") : false;
    const isStandalone = typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone);
    const route = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
    
    setStatus({
      configured, hasKey, isStandalone, route
    });
  }, [session]);

  if (!status) return null;

  return (
    <div style={{ padding: "12px", background: "rgba(0,0,0,0.03)", borderRadius: "12px", fontSize: "12px", fontFamily: "monospace", color: "var(--charcoal)", border: "1px solid rgba(0,0,0,0.06)", marginTop: "12px" }}>
      <strong style={{ display: "block", marginBottom: 6 }}>Auth Diagnostics</strong>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Configured:</span> <span>{status.configured ? "True" : "False"}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Session:</span> <span>{session ? "Present" : "Missing"}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Email:</span> <span>{session?.user?.email || "N/A"}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Storage Key:</span> <span>{status.hasKey ? "Present" : "Missing"}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Expires:</span> <span>{session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : "N/A"}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Route:</span> <span>{status.route}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Standalone:</span> <span>{status.isStandalone ? "True" : "False"}</span></div>
    </div>
  );
}
