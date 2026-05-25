import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { collectTestPilotDiagnostics, shouldShowTesterTools } from "./testPilotDiagnostics";

const TestPilotContext = createContext(null);

const DEFAULT_CONFIG = {
  productName: "Product",
  uiLabel: "Tester Mode",
  accent: "#D9654C",
  appVersion: "",
};

export function TestPilotProvider({
  children,
  config = {},
  session,
  testerStatus,
  diagnosticsContext = {},
  getDisplayMode,
}) {
  const [activePanel, setActivePanel] = useState(null);
  const resolvedConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);
  const visible = shouldShowTesterTools({ session, testerStatus });

  const collectDiagnostics = useCallback((extra = {}) => collectTestPilotDiagnostics({
    ...diagnosticsContext,
    ...extra,
    appVersion: diagnosticsContext.appVersion ?? resolvedConfig.appVersion,
    getDisplayMode,
  }), [diagnosticsContext, getDisplayMode, resolvedConfig.appVersion]);

  const value = useMemo(() => ({
    activePanel,
    closePanel: () => setActivePanel(null),
    collectDiagnostics,
    config: resolvedConfig,
    openPanel: setActivePanel,
    session,
    testerStatus,
    visible,
  }), [activePanel, collectDiagnostics, resolvedConfig, session, testerStatus, visible]);

  return <TestPilotContext.Provider value={value}>{children}</TestPilotContext.Provider>;
}

export function useTestPilot() {
  const context = useContext(TestPilotContext);
  if (!context) throw new Error("useTestPilot must be used inside TestPilotProvider.");
  return context;
}
