import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { Slash, User, LogOut, LayoutDashboard, FolderOpen, Download, Settings } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function SiteHeader() {
  const { pathname } = useLocation();
  const isActive = (p) => pathname === p;
  const { user, openModal, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const initials = user ? (
    (user.first_name?.[0] || user.email?.[0] || "U").toUpperCase() +
    (user.last_name?.[0] || "").toUpperCase()
  ).slice(0, 2) : "";

  return (
    <header
      data-testid="site-header"
      className="sticky top-0 z-40 border-b border-[#E7E7F3] bg-white/80 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" data-testid="brand-link" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED] text-white shadow-[0_6px_20px_-6px_rgba(81,57,237,0.65)]">
            <Slash className="h-4 w-4" strokeWidth={3} />
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-[#0B0B18]">
            Dr. <span className="text-[#5139ED]">/</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          <Link to="/" data-testid="nav-home" className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${isActive("/") ? "bg-[#5139ED]/8 text-[#5139ED]" : "text-[#1E1E33] hover:text-[#5139ED]"}`}>Home</Link>
          <Link to="/phytonet-ai" data-testid="nav-plant-database" className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${isActive("/phytonet-ai") ? "bg-[#5139ED]/8 text-[#5139ED]" : "text-[#1E1E33] hover:text-[#5139ED]"}`}>PhytoNet AI</Link>
          <a href="#agents" data-testid="nav-agents" className="rounded-full px-4 py-2 text-sm font-medium text-[#1E1E33] transition-colors hover:text-[#5139ED]">Agents</a>
        </nav>

        <div className="flex items-center gap-2">
          {!user ? (
            <>
              <button data-testid="header-signin" onClick={() => openModal("signin")}
                      className="hidden rounded-full border border-[#E7E7F3] bg-white px-4 py-2 text-sm font-semibold text-[#0B0B18] hover:border-[#5139ED]/50 hover:text-[#5139ED] md:inline-flex">
                Sign In
              </button>
              <button data-testid="header-signup" onClick={() => openModal("signup")}
                      className="rounded-full bg-[#0B0B18] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:-translate-y-0.5 hover:bg-[#1E1E33] md:inline-flex">
                Sign Up
              </button>
            </>
          ) : (
            <div className="relative">
              <button data-testid="header-avatar" onClick={() => setMenuOpen((v) => !v)}
                      className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white px-2 py-1.5 text-xs font-bold text-[#0B0B18] hover:border-[#5139ED]/40">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-[#5139ED] to-[#8139ED] text-white text-[11px]">
                  {initials || <User className="h-3.5 w-3.5" />}
                </span>
                <span className="hidden max-w-[120px] truncate md:inline">{user.first_name || user.email}</span>
              </button>
              {menuOpen && (
                <div data-testid="header-menu" className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-[#E7E7F3] bg-white shadow-lg">
                  <div className="px-4 py-3 border-b border-[#F1F1FA]">
                    <p className="text-xs font-bold text-[#0B0B18]">{user.first_name} {user.last_name}</p>
                    <p className="text-[10px] text-[#64748B]">{user.email}</p>
                    {!user.email_verified && <p className="mt-1 text-[10px] text-amber-600">Email not yet verified</p>}
                  </div>
                  <MenuItem icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" testid="menu-dashboard" onClick={() => setMenuOpen(false)} />
                  <MenuItem icon={<FolderOpen className="h-4 w-4" />} label="My Projects" testid="menu-projects" onClick={() => setMenuOpen(false)} />
                  <MenuItem icon={<Download className="h-4 w-4" />} label="Downloads" testid="menu-downloads" onClick={() => setMenuOpen(false)} />
                  <MenuItem icon={<User className="h-4 w-4" />} label="Profile" testid="menu-profile" onClick={() => setMenuOpen(false)} />
                  <MenuItem icon={<Settings className="h-4 w-4" />} label="Settings" testid="menu-settings" onClick={() => setMenuOpen(false)} />
                  <MenuItem icon={<LogOut className="h-4 w-4" />} label="Logout" testid="menu-logout" onClick={() => { setMenuOpen(false); logout(); }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({ icon, label, testid, onClick }) {
  return (
    <button data-testid={testid} onClick={onClick}
            className="flex w-full items-center gap-2 px-4 py-2 text-xs font-semibold text-[#0B0B18] hover:bg-[#FAFAFF] hover:text-[#5139ED]">
      {icon}{label}
    </button>
  );
}
