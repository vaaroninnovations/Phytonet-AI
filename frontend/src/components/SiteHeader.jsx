import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Search, User, LogOut, LayoutDashboard, FolderOpen, Download, Settings, Menu, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import NodeBadge from "@/components/nodes/NodeBadge";
import SaveProjectMenu from "@/components/SaveProjectMenu";
import BrandLogo from "@/components/BrandLogo";

const NAV = [
  { label: "Home", to: "/" },
  { label: "AI Assistant", to: "/ai-assistant" },
  { label: "Resources", to: "/#resources" },
  { label: "Pricing", to: "/#pricing" },
  { label: "Docs", to: "/#docs" },
];

export default function SiteHeader() {
  const { pathname, hash } = useLocation();
  const isActive = (p) => (p.startsWith("/#") ? false : pathname === p);
  const { user, openModal, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname, hash]);

  const initials = user ? (
    (user.first_name?.[0] || user.email?.[0] || "U").toUpperCase() +
    (user.last_name?.[0] || "").toUpperCase()
  ).slice(0, 2) : "";

  return (
    <header
      data-testid="site-header"
      className={`sticky top-0 z-40 transition-all duration-300 ${
        scrolled
          ? "border-b border-[#E7E7F3]/80 bg-white/70 backdrop-blur-xl shadow-[0_1px_0_rgba(11,11,24,0.03)]"
          : "border-b border-transparent bg-white/60 backdrop-blur-md"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-6">
        <Link to="/" data-testid="brand-link" className="flex items-center gap-2.5 shrink-0">
          <BrandLogo className="h-8 w-8" />
          <span className="font-headline text-[17px] font-extrabold tracking-tight text-[#111827]">
            PhytoNet<span className="text-[#5139ED]"> AI</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.label}
              to={n.to}
              data-testid={`nav-${n.label.toLowerCase().replace(/\s/g, "-")}`}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                isActive(n.to)
                  ? "bg-[#5139ED]/8 text-[#5139ED]"
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
            className="hidden items-center gap-2 rounded-full border border-[#E7E7F3] bg-white/70 px-3 py-1.5 text-[12px] font-medium text-[#6B7280] hover:border-[#5139ED]/30 hover:text-[#5139ED] md:inline-flex"
            aria-label="Search"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Search</span>
            <span className="ml-2 hidden rounded border border-[#E7E7F3] px-1.5 py-0.5 text-[10px] font-semibold text-[#9CA3AF] md:inline">⌘K</span>
          </button>

          {user && <SaveProjectMenu />}

          {!user ? (
            <button
              data-testid="header-signin"
              onClick={() => openModal("signin")}
              className="inline-flex items-center rounded-full border border-[#E7E7F3] bg-white px-4 py-1.5 text-[13px] font-semibold text-[#111827] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
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
                className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white px-2 py-1.5 text-xs font-bold text-[#111827] hover:border-[#5139ED]/40"
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
                  <MenuItem icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" testid="menu-dashboard" onClick={() => setMenuOpen(false)} />
                  <MenuItem icon={<FolderOpen className="h-4 w-4" />} label="My Projects" testid="menu-projects" onClick={() => { setMenuOpen(false); navigate("/projects"); }} />
                  <MenuItem icon={<Download className="h-4 w-4" />} label="Downloads" testid="menu-downloads" onClick={() => setMenuOpen(false)} />
                  <MenuItem icon={<User className="h-4 w-4" />} label="Profile" testid="menu-profile" onClick={() => setMenuOpen(false)} />
                  <MenuItem icon={<Settings className="h-4 w-4" />} label="Settings" testid="menu-settings" onClick={() => setMenuOpen(false)} />
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
            className="grid h-9 w-9 place-items-center rounded-full border border-[#E7E7F3] bg-white text-[#111827] lg:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div data-testid="mobile-nav" className="border-t border-[#E7E7F3] bg-white lg:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-6 py-4">
            {NAV.map((n) => (
              <Link key={n.label} to={n.to} className="rounded-lg px-3 py-2 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC]">
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
