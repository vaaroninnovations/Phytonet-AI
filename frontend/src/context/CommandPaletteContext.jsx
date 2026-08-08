// CommandPaletteContext — mounts one <CommandPalette/> at the app root,
// wires the global ⌘K / Ctrl+K keyboard shortcut, and exposes an `open()`
// function to descendants so any UI (header search button, empty states,
// etc.) can trigger the palette without duplicating instances.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import CommandPalette from "@/components/CommandPalette";

const Ctx = createContext({ open: () => {} });

export function CommandPaletteProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const onKey = (e) => {
      // Meta = Cmd on macOS. Also match Ctrl for Linux/Windows.
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const open = useCallback(() => setIsOpen(true), []);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <CommandPalette open={isOpen} onOpenChange={setIsOpen} />
    </Ctx.Provider>
  );
}

export function useCommandPalette() {
  return useContext(Ctx);
}
