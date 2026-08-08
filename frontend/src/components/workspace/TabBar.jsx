// Unified /app header — brand on the left, tabs in the middle, and the
// main-site right-side controls (Search · Save Project · Nodes · Avatar
// menu) on the right. Replaces both the standalone SiteHeader and the
// previous secondary TabBar.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Home as HomeIcon, X, Sparkles, LayoutGrid, Beaker, FlaskConical,
  Dna, Atom, Microscope, FileText, Database, Waves,
  Search, User, LogOut, LayoutDashboard, FolderOpen, Download, Settings,
  Zap,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNodes } from "@/context/NodeContext";
import NodeBadge from "@/components/nodes/NodeBadge";
import SaveProjectMenu from "@/components/SaveProjectMenu";
import BrandLogo from "@/components/BrandLogo";

const TYPE_ICONS = {
  home:    HomeIcon,
  project: Sparkles,
  module:  LayoutGrid,
};

const MODULE_ICONS = {
  "/phytonet-ai":                Sparkles,
  "/plant-database":             Beaker,
  "/compound-target-prediction": Atom,
  "/disease-target-identification": Dna,
  "/admet":                       FlaskConical,
  "/molecular-docking":           Microscope,
  "/molecular-dynamics":          Waves,
  "/ai-scientific-report":        FileText,
  "/network-analysis":            LayoutGrid,
  "/resources":                   Database,
};

function AvatarMenu({ user, navigate, logout }) {
  const [open, setOpen] = useState(false);
  const { isPro } = useNodes();
  useEffect(() => {
    const onDoc = (e) => {
      if (!e.target.closest("[data-testid='header-avatar']") &&
          !e.target.closest("[data-testid='header-menu']"))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const initials = user ? (
    (user.first_name?.[0] || user.email?.[0] || "U").toUpperCase() +
    (user.last_name?.[0] || "").toUpperCase()
  ).slice(0, 2) : "";
  return (
    <div className="relative">
      <button
        data-testid="header-avatar"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-bold text-white hover:bg-white/10"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-[#5139ED] to-[#8139ED] text-white text-[11px]">
          {initials || <User className="h-3.5 w-3.5" />}
        </span>
        <span className="hidden max-w-[110px] truncate text-slate-200 lg:inline">
          {user.first_name || user.email}
        </span>
        {isPro && (
          <span data-testid="pro-badge"
                className="ml-0.5 inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-[0_2px_6px_rgba(245,158,11,0.5)]">
            <Zap className="h-2.5 w-2.5" />PRO
          </span>
        )}
      </button>
      {open && (
        <div data-testid="header-menu"
             className="absolute right-0 top-full mt-1 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#141024] shadow-2xl shadow-black/50 z-[100]">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="text-xs font-bold text-slate-100">{user.first_name} {user.last_name}</p>
            <p className="text-[10px] text-slate-400">{user.email}</p>
            {isPro && (
              <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-amber-300">
                <Zap className="h-3 w-3 fill-amber-400" /> PhytoNet Pro
              </p>
            )}
            {!user.email_verified && <p className="mt-1 text-[10px] text-amber-300">Email not yet verified</p>}
          </div>
          {!isPro && (
            <button data-testid="menu-upgrade"
                    onClick={() => { setOpen(false); navigate("/pricing"); }}
                    className="flex w-full items-center gap-2 border-b border-white/10 bg-gradient-to-r from-amber-500/10 to-amber-500/5 px-4 py-2.5 text-[12.5px] font-semibold text-amber-300 hover:from-amber-500/20 hover:to-amber-500/10">
              <Zap className="h-4 w-4 fill-amber-400 text-amber-400" /> Upgrade to Pro
            </button>
          )}
          {[
            { icon: LayoutDashboard, label: "Dashboard",   testid: "menu-dashboard", to: "/dashboard" },
            { icon: FolderOpen,      label: "My Projects", testid: "menu-projects",  to: "/my-projects" },
            { icon: Download,        label: "Downloads",   testid: "menu-downloads", to: "/dashboard#downloads" },
            { icon: User,            label: "Profile",     testid: "menu-profile",   to: "/profile" },
            { icon: Settings,        label: "Settings",    testid: "menu-settings",  to: "/settings" },
          ].map(({ icon: Icon, label, testid, to }) => (
            <button key={testid}
                    data-testid={testid}
                    onClick={() => { setOpen(false); navigate(to); }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-[12.5px] text-slate-200 hover:bg-white/5">
              <Icon className="h-4 w-4 text-slate-400" /> {label}
            </button>
          ))}
          <button data-testid="menu-logout"
                  onClick={() => { setOpen(false); logout(); }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-[12.5px] text-rose-300 hover:bg-rose-500/10">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      )}
    </div>
  );
}

export function TabBar({ tabs, activeId, onActivate, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div data-testid="app-header"
         className="sticky top-0 z-40 flex items-center gap-3 border-b border-white/10 bg-black/60 backdrop-blur-xl">
      {/* Left — brand */}
      <Link to="/" data-testid="app-brand"
            className="flex-shrink-0 flex items-center gap-2 pl-4 pr-2 py-2.5 hover:opacity-90">
        <BrandLogo className="h-7 w-7" />
        <span className="font-headline text-[15px] font-extrabold tracking-tight text-white hidden sm:inline">
          PhytoNet<span className="text-[#a48bff]"> AI</span>
        </span>
      </Link>

      {/* Middle — tabs (scrollable if too many) */}
      <div data-testid="app-tabbar"
           className="flex items-end gap-0.5 flex-1 min-w-0 overflow-x-auto pt-2">
        {tabs.map((t) => {
          const active = t.id === activeId;
          const Icon = t.type === "module" && t.modulePath
                        ? (MODULE_ICONS[t.modulePath] || TYPE_ICONS[t.type])
                        : TYPE_ICONS[t.type];
          return (
            <div
              key={t.id}
              data-testid={`tab-${t.id}`}
              onClick={() => onActivate(t.id)}
              className={`group relative flex-shrink-0 flex items-center gap-2 rounded-t-lg pl-3 pr-2 py-2 cursor-pointer transition-all min-w-[120px] max-w-[240px] ${
                active
                  ? "bg-gradient-to-b from-[#141024] to-[#0B0B18] text-white border border-b-0 border-white/10 shadow-lg"
                  : "bg-white/5 hover:bg-white/10 text-slate-300 border border-transparent"
              }`}
            >
              <Icon size={13} className={active ? "text-[#a48bff]" : "text-slate-400"} />
              <span className="truncate text-[12.5px] font-medium flex-1">{t.title}</span>
              {t.closable !== false && (
                <button
                  data-testid={`tab-${t.id}-close`}
                  onClick={(e) => { e.stopPropagation(); onClose(t.id); }}
                  className="opacity-40 hover:opacity-100 hover:bg-white/10 rounded p-0.5 flex-shrink-0"
                  title="Close tab"
                ><X size={11} /></button>
              )}
              {active && (
                <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-gradient-to-r from-[#5139ED] to-[#8139ED]" />
              )}
            </div>
          );
        })}
      </div>

      {/* Right — search, save project, nodes, avatar */}
      <div className="flex-shrink-0 flex items-center gap-2 pr-4 py-2">
        <button
          data-testid="header-search"
          className="hidden md:inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] font-medium text-slate-300 hover:text-white hover:border-[#5139ED]/40"
          aria-label="Search"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Search</span>
          <span className="ml-2 hidden lg:inline rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">⌘K</span>
        </button>
        {user && <SaveProjectMenu />}
        {user && <NodeBadge />}
        {user && <AvatarMenu user={user} navigate={navigate} logout={logout} />}
      </div>
    </div>
  );
}
