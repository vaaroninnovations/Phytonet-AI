// Persistent layout for authenticated admin pages: distinct dark theme,
// left sidebar, top bar with admin identity + logout.
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/context/AdminAuthContext";
import {
  LayoutDashboard, Users, ShieldCheck, ScrollText, Settings2,
  UserCog, LogOut, Loader2, MessageSquare,
} from "lucide-react";
import { useEffect } from "react";

const NAV = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "admin-nav-dashboard" },
  { to: "/admin/users", label: "Users", icon: Users, testid: "admin-nav-users" },
  { to: "/admin/feedback", label: "Feedback", icon: MessageSquare, testid: "admin-nav-feedback" },
  { to: "/admin/audit-log", label: "Audit Log", icon: ScrollText, testid: "admin-nav-audit" },
  { to: "/admin/settings", label: "Settings", icon: Settings2, testid: "admin-nav-settings" },
  { to: "/admin/profile", label: "Profile", icon: UserCog, testid: "admin-nav-profile" },
];

export default function AdminLayout() {
  const { admin, loading, logout } = useAdminAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !admin) navigate("/admin/login", { replace: true });
  }, [loading, admin, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <Loader2 className="animate-spin" /> <span className="ml-3">Loading admin…</span>
      </div>
    );
  }
  if (!admin) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex" data-testid="admin-layout">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/70 backdrop-blur flex flex-col">
        <div className="px-5 py-6 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-amber-400" size={22} />
            <div>
              <div className="text-sm font-semibold tracking-wide">PhytoNet Admin</div>
              <div className="text-[11px] text-slate-400">Super-Admin Console</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon, testid }) => (
            <NavLink
              key={to} to={to} data-testid={testid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-amber-500/15 text-amber-200 border border-amber-500/30"
                    : "text-slate-300 hover:bg-slate-800/70"
                }`
              }
            >
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800 text-xs text-slate-400">
          <div className="mb-2 truncate" title={admin.email}>{admin.email}</div>
          <button
            data-testid="admin-logout-btn"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-x-auto">
        <div className="px-8 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
