// ThemeContext — app-wide appearance controls.
// • theme: "light" | "dark" — applied as data-theme on <html>; dark-mode CSS
//   overrides in index.css re-skin the light module pages.
// • fontSize: "sm" | "md" | "lg" — scales the root rem so Tailwind's
//   rem-based utilities (and body text) grow/shrink together.
import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext(null);

const THEME_KEY = "phytonet.theme";
const FONT_KEY = "phytonet.fontSize";

export const FONT_SIZES = [
  { id: "sm", label: "Compact",     px: 15,   hint: "Smaller text, more on screen" },
  { id: "md", label: "Default",     px: 16,   hint: "Recommended reading size" },
  { id: "lg", label: "Comfortable", px: 17.5, hint: "Larger text, easier to read" },
];

function safeGet(key, fallback, allowed) {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => safeGet(THEME_KEY, "light", ["light", "dark"]));
  const [fontSize, setFontSize] = useState(() => safeGet(FONT_KEY, "md", FONT_SIZES.map((f) => f.id)));

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.classList.toggle("dark", theme === "dark");
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
  }, [theme]);

  useEffect(() => {
    const px = (FONT_SIZES.find((f) => f.id === fontSize) || FONT_SIZES[1]).px;
    document.documentElement.style.fontSize = `${px}px`;
    try { localStorage.setItem(FONT_KEY, fontSize); } catch { /* private mode */ }
  }, [fontSize]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark: theme === "dark", fontSize, setFontSize, fontSizes: FONT_SIZES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
