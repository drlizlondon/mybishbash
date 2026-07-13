import { useEffect, useMemo, useState } from "react";
import { BASE_PATH, getRouteFromLocation, parseRoute } from "./routes";

// navigateTo stays in App(): it mutates non-route state (shell settings
// version id, launcher context, active protected app context) alongside the
// route change, and splitting those mutations out would change ordering
// semantics. This hook owns only the route state itself — routePath,
// initialRoute, route, and the history-sync effect — plus setRoutePath,
// which App() (including navigateTo) uses directly at its many existing
// call sites.
export function useRoute(setupComplete) {
  const [routePath, setRoutePath] = useState(() => getRouteFromLocation(setupComplete));
  const initialRoute = useMemo(() => parseRoute(routePath), []);
  const route = useMemo(() => parseRoute(routePath), [routePath]);

  useEffect(() => {
    if (!route.fallbackFrom && route.path === routePath) return;
    const nextPath = route.path || "/home";
    if (routePath !== nextPath) {
      setRoutePath(nextPath);
    }
    if (typeof window !== "undefined") {
      const nextUrl = `${BASE_PATH}${nextPath === "/" ? "" : nextPath}`;
      if (window.location.pathname !== nextUrl) {
        window.history.replaceState({}, "", nextUrl);
      }
    }
  }, [route.fallbackFrom, route.path, routePath]);

  return { routePath, setRoutePath, route, initialRoute };
}
