import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Search, User, LogOut, LayoutDashboard, FolderOpen, Download, Settings, Menu, X, Sun, Moon, Type, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import NodeBadge from "@/components/nodes/NodeBadge";
import SaveProjectMenu from "@/components/SaveProjectMenu";
import BrandLogo from "@/components/BrandLogo";
import { useCommandPalette } from "@/context/CommandPaletteContext";

const NAV = [
  { label: "Home", to: "/" },
  { label: "Resources", to: "/resources" },
  { label: "Pricing", to: "/pricing" },
  { label: "Docs", to: "/documentation" },
];

export default function SiteHeader() {
  const { pathname, hash } = useLocation();
  const isActive = (p) => (p.startsWith("/#") ? false : pathname === p);
  const { user, openModal, logout } = useAuth();
  const { isDark, toggleTheme, fontSize, setFontSize, fontSizes } = useTheme();
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const fontMenuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const { open: openPalette } = useCommandPalette();
  // The whole app now responds to the theme toggle — the header simply
  // follows the global theme on every route.
  const dark = isDark;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname, hash]);

  // Close the font-size menu on any click outside it (capture phase so it
  // fires before the toggle button's own click re-opens it).
  useEffect(() => {
    if (!fontMenuOpen) return;
    const onDown = (e) => {
      if (fontMenuRef.current && !fontMenuRef.current.contains(e.target)) {
        setFontMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [fontMenuOpen]);

  // Robust smooth-scroll for hash nav links (Home ▾ Pricing/Docs/Resources).
  //   • Same-page hash click → scroll immediately.
  //   • Cross-route → let react-router navigate, then scroll after mount.
  // Handled here so it works regardless of whether Home's own effect fires.
  const handleNav = (to) => (e) => {
    if (!to.startsWith("/#")) return;              // regular route link
    const id = to.slice(2);
    e.preventDefault();
    setMobileOpen(false);
    const doScroll = () => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    if (pathname === "/") {
      // Push the hash for URL clarity; then scroll on the current mount.
      if (hash !== `#${id}`) navigate(to, { replace: false });
      // Two rAFs so React commits the hash before we scroll.
      requestAnimationFrame(() => requestAnimationFrame(doScroll));
    } else {
      navigate(to);
      // Home will mount fresh — retry until the target exists.
      let tries = 0;
      const tick = () => {
        if (document.getElementById(id)) return doScroll();
        if (++tries < 20) setTimeout(tick, 80);
      };
      setTimeout(tick, 120);
    }
  };

  const initials = user ? (
    (user.first_name?.[0] || user.email?.[0] || "U").toUpperCase() +
    (user.last_name?.[0] || "").toUpperCase()
  ).slice(0, 2) : "";

  return (
    <header
      data-testid="site-header"
      className={`sticky top-0 z-40 transition-all duration-300 ${
        dark
          ? scrolled
            ? "border-b border-[#FAFAFF]/10 bg-[#0F0E24]/40 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent"
          : scrolled
            ? "border-b border-[#E7E7F3]/60 bg-white/40 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-6">
        <Link to="/" data-testid="brand-link" className="flex items-center gap-2.5 shrink-0">
          <BrandLogo className="h-8 w-8" />
          <span className={`font-headline text-[17px] font-extrabold tracking-tight ${dark ? "text-[#FAFAFF]" : "text-[#111827]"}`}>
            PhytoNet<span className={dark ? "text-[#c4b5fd]" : "text-[#5139ED]"}> AI</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.label}
              to={n.to}
              onClick={handleNav(n.to)}
              data-testid={`nav-${n.label.toLowerCase().replace(/\s/g, "-")}`}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                isActive(n.to)
                  ? dark
                    ? "bg-[#5139ED]/25 text-white"
                    : "bg-[#5139ED]/8 text-[#5139ED]"
                  : dark
                    ? "text-[#E7E7F3]/80 hover:text-white"
                    : "text-[#374151] hover:text-[#5139ED]"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            data-testid="header-search"
            type="button"
            onClick={openPalette}
            className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium md:inline-flex ${
              dark
                ? "border-[#FAFAFF]/10 bg-[#FAFAFF]/[0.04] text-[#E7E7F3]/70 hover:border-[#c4b5fd]/40 hover:text-[#FAFAFF]"
                : "border-[#E7E7F3] bg-white/70 text-[#6B7280] hover:border-[#5139ED]/30 hover:text-[#5139ED]"
            }`}
            aria-label="Search"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Search</span>
            <span className={`ml-2 hidden rounded border px-1.5 py-0.5 text-[10px] font-semibold md:inline ${
              dark ? "border-[#FAFAFF]/15 text-[#E7E7F3]/60" : "border-[#E7E7F3] text-[#9CA3AF]"
            }`}>⌘K</span>
          </button>

          {user && <SaveProjectMenu />}

          {/* Appearance controls — theme toggle + font-size modifier */}
          <button
            data-testid="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className={`grid h-9 w-9 place-items-center rounded-full border transition-colors ${
              dark
                ? "border-[#FAFAFF]/15 bg-[#FAFAFF]/[0.05] text-[#FAFAFF] hover:border-[#c4b5fd]/50"
                : "border-[#E7E7F3] bg-white text-[#111827] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
            }`}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <div className="relative" ref={fontMenuRef}>
            <button
              data-testid="font-size-toggle"
              type="button"
              onClick={() => setFontMenuOpen((v) => !v)}
              aria-label="Adjust text size"
              aria-expanded={fontMenuOpen}
              title="Adjust text size"
              className={`grid h-9 w-9 place-items-center rounded-full border transition-colors ${
                dark
                  ? "border-[#FAFAFF]/15 bg-[#FAFAFF]/[0.05] text-[#FAFAFF] hover:border-[#c4b5fd]/50"
                  : "border-[#E7E7F3] bg-white text-[#111827] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
              }`}
            >
              <Type className="h-4 w-4" />
            </button>
            {fontMenuOpen && (
              <div
                data-testid="font-size-menu"
                className={`absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border shadow-lg ${
                  dark ? "border-[#2A2745] bg-[#151230]" : "border-[#E7E7F3] bg-white"
                }`}
              >
                  <div className={`border-b px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest ${
                    dark ? "border-[#2A2745] text-[#9B94B8]" : "border-[#F1F1FA] text-[#6B7280]"
                  }`}>
                    Text size
                  </div>
                  {fontSizes.map((f) => (
                    <button
                      key={f.id}
                      data-testid={`font-size-${f.id}`}
                      onClick={() => { setFontSize(f.id); setFontMenuOpen(false); }}
                      aria-pressed={fontSize === f.id}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        dark
                          ? "text-[#EDEAFB] hover:bg-[#1B1838]"
                          : "text-[#111827] hover:bg-[#F8FAFC]"
                      }`}
                    >
                      <span
                        className={`font-headline font-extrabold leading-none ${
                          fontSize === f.id ? "text-[#5139ED]" : dark ? "text-[#c4b5fd]" : "text-[#374151]"
                        }`}
                        style={{ fontSize: `${12 + f.px - 14}px` }}
                      >
                        Aa
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-bold">{f.label}</span>
                        <span className={`block text-[10.5px] ${dark ? "text-[#9B94B8]" : "text-[#6B7280]"}`}>{f.hint}</span>
                      </span>
                      {fontSize === f.id && <Check className="h-3.5 w-3.5 text-[#5139ED]" />}
                    </button>
                  ))}
                </div>
            )}
          </div>

          {!user ? (
            <button
              data-testid="header-signin"
              onClick={() => openModal("signin")}
              className={`inline-flex items-center rounded-full border px-4 py-1.5 text-[13px] font-semibold ${
                dark
                  ? "border-[#FAFAFF]/15 bg-[#FAFAFF]/[0.05] text-[#FAFAFF] hover:border-[#c4b5fd]/50 hover:bg-[#FAFAFF]/[0.1]"
                  : "border-[#E7E7F3] bg-white text-[#111827] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
              }`}
            >
              Sign In
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <NodeBadge />
              <div className="relative">
              <button
                data-testid="header-avatar"
                onClick={() => setMenuOpen((v) => !v)}
                className={`inline-flex items-center gap-2 rounded-full border px-2 py-1.5 text-xs font-bold ${
                  dark
                    ? "border-[#FAFAFF]/15 bg-[#FAFAFF]/[0.05] text-[#FAFAFF] hover:border-[#c4b5fd]/50"
                    : "border-[#E7E7F3] bg-white text-[#111827] hover:border-[#5139ED]/40"
                }`}
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-[#5139ED] to-[#8139ED] text-white text-[11px]">
                  {initials || <User className="h-3.5 w-3.5" />}
                </span>
                <span className="hidden max-w-[110px] truncate lg:inline">{user.first_name || user.email}</span>
              </button>
              {menuOpen && (
                <div data-testid="header-menu" className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-[#E7E7F3] bg-white shadow-lg">
                  <div className="border-b border-[#F1F1FA] px-4 py-3">
                    <p className="text-xs font-bold text-[#111827]">{user.first_name} {user.last_name}</p>
                    <p className="text-[10px] text-[#6B7280]">{user.email}</p>
                    {!user.email_verified && <p className="mt-1 text-[10px] text-amber-600">Email not yet verified</p>}
                  </div>
                  <MenuItem icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" testid="menu-dashboard" onClick={() => { setMenuOpen(false); navigate("/dashboard"); }} />
                  <MenuItem icon={<FolderOpen className="h-4 w-4" />} label="My Projects" testid="menu-projects" onClick={() => { setMenuOpen(false); navigate("/my-projects"); }} />
                  <MenuItem icon={<Download className="h-4 w-4" />} label="Downloads" testid="menu-downloads" onClick={() => { setMenuOpen(false); navigate("/dashboard#downloads"); }} />
                  <MenuItem icon={<User className="h-4 w-4" />} label="Profile" testid="menu-profile" onClick={() => { setMenuOpen(false); navigate("/profile"); }} />
                  <MenuItem icon={<Settings className="h-4 w-4" />} label="Settings" testid="menu-settings" onClick={() => { setMenuOpen(false); navigate("/settings"); }} />
                  <MenuItem icon={<LogOut className="h-4 w-4" />} label="Logout" testid="menu-logout" onClick={() => { setMenuOpen(false); logout(); }} />
                </div>
              )}
              </div>
            </div>
          )}

          <button
            data-testid="mobile-menu-toggle"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
            className={`grid h-9 w-9 place-items-center rounded-full border lg:hidden ${
              dark
                ? "border-[#FAFAFF]/15 bg-[#FAFAFF]/[0.05] text-[#FAFAFF]"
                : "border-[#E7E7F3] bg-white text-[#111827]"
            }`}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div data-testid="mobile-nav" className="border-t border-[#E7E7F3] bg-white lg:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-6 py-4">
            {NAV.map((n) => (
              <Link key={n.label} to={n.to} onClick={handleNav(n.to)} className="rounded-lg px-3 py-2 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC]">
                {n.label}
              </Link>
            ))}
            {!user && (
              <button onClick={() => openModal("signin")} className="mt-2 rounded-full border border-[#E7E7F3] bg-white px-3 py-2 text-sm font-semibold text-[#111827] hover:border-[#5139ED]/40">
                Sign In
              </button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

function MenuItem({ icon, label, testid, onClick }) {
  return (
    <button data-testid={testid} onClick={onClick}
            className="flex w-full items-center gap-2 px-4 py-2 text-xs font-semibold text-[#111827] hover:bg-[#F8FAFC] hover:text-[#5139ED]">
      {icon}{label}
    </button>
  );
}
