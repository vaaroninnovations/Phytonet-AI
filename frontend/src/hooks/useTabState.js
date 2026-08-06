// Tab state hook — persists tabs + panel sizes + scroll positions to
// localStorage per authenticated user (keyed on user.id or "guest").
// Tabs shape: { id, type: 'home'|'project'|'module', title, projectId?, modulePath? }.
import { useCallback, useEffect, useState } from "react";

const KEY = (uid) => `phytonet.app.tabs.v1.${uid || "guest"}`;
const MAX_TABS = 12;

const HOME_TAB = { id: "home", type: "home", title: "Home", closable: false };

function load(uid) {
  try {
    const raw = localStorage.getItem(KEY(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.tabs || !Array.isArray(parsed.tabs)) return null;
    // Sanitize: always ensure Home is first + non-closable.
    const rest = parsed.tabs.filter((t) => t?.id && t.id !== "home");
    return {
      tabs:       [HOME_TAB, ...rest].slice(0, MAX_TABS),
      activeId:   parsed.activeId && (parsed.tabs.some((t) => t.id === parsed.activeId))
                    ? parsed.activeId : "home",
      panelSizes: parsed.panelSizes || {},
      scrollPos:  parsed.scrollPos  || {},
    };
  } catch { return null; }
}

export function useTabState(userId) {
  const [state, setState] = useState(() => load(userId) || {
    tabs: [HOME_TAB], activeId: "home", panelSizes: {}, scrollPos: {},
  });

  // Reload on user change
  useEffect(() => {
    const s = load(userId);
    if (s) setState(s);
  }, [userId]);

  // Persist
  useEffect(() => {
    try { localStorage.setItem(KEY(userId), JSON.stringify(state)); } catch {}
  }, [userId, state]);

  const openTab = useCallback((tab) => {
    setState((s) => {
      const exists = s.tabs.find((t) => t.id === tab.id);
      const tabs = exists ? s.tabs : [...s.tabs, tab].slice(0, MAX_TABS);
      return { ...s, tabs, activeId: tab.id };
    });
  }, []);

  const closeTab = useCallback((id) => {
    setState((s) => {
      if (id === "home") return s;   // cannot close Home
      const idx = s.tabs.findIndex((t) => t.id === id);
      const tabs = s.tabs.filter((t) => t.id !== id);
      const activeId = s.activeId === id
        ? (tabs[Math.max(0, idx - 1)]?.id || "home")
        : s.activeId;
      const { [id]: _p, ...panelSizes } = s.panelSizes;
      const { [id]: _sc, ...scrollPos } = s.scrollPos;
      return { tabs, activeId, panelSizes, scrollPos };
    });
  }, []);

  const activate = useCallback((id) => {
    setState((s) => s.tabs.some((t) => t.id === id)
                        ? { ...s, activeId: id } : s);
  }, []);

  const setPanelSize = useCallback((id, ratio) => {
    setState((s) => ({ ...s, panelSizes: { ...s.panelSizes, [id]: ratio } }));
  }, []);

  const setScrollPos = useCallback((id, key, pos) => {
    setState((s) => ({
      ...s,
      scrollPos: { ...s.scrollPos,
                   [id]: { ...(s.scrollPos[id] || {}), [key]: pos } },
    }));
  }, []);

  return {
    tabs: state.tabs,
    activeId: state.activeId,
    panelSizes: state.panelSizes,
    scrollPos: state.scrollPos,
    openTab, closeTab, activate, setPanelSize, setScrollPos,
  };
}
