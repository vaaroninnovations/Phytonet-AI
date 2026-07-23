// User Dashboard — central workspace: account summary, node balance,
// usage history from /api/nodes/history + recharge history + saved projects.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, User, Wallet, TrendingUp, FolderOpen, Download,
  History, Loader2, ShieldCheck, Calendar, ArrowRight, ExternalLink,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNodes } from "@/context/NodeContext";
import { GoldenLeaf } from "@/components/nodes/NodeBadge";
import { getNodeHistory, listProjects } from "@/lib/api";

function Card({ icon: Ic, label, value, tint = "#5139ED", testid }) {
  return (
    <div data-testid={testid} className="rounded-2xl border border-[#E7E7F3] bg-white/70 p-4 backdrop-blur">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
        <Ic className="h-3.5 w-3.5" style={{ color: tint }} /> {label}
      </div>
      <div className="mt-1 font-headline text-2xl font-bold text-[#0F172A]">{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  const { balance, lifetimeUsed, lifetimePurchased, openPurchase, refresh } = useNodes();
  const [history, setHistory] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ready && !user) navigate("/", { replace: true });
  }, [ready, user, navigate]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      getNodeHistory({ limit: 100 }).catch(() => ({ rows: [] })),
      listProjects().catch(() => ({ items: [] })),
      refresh(),
    ]).then(([h, p]) => {
      setHistory(Array.isArray(h?.rows) ? h.rows : []);
      // listProjects can return either { items: [...] } or a bare array — normalise.
      const list = Array.isArray(p) ? p : Array.isArray(p?.items) ? p.items : Array.isArray(p?.projects) ? p.projects : [];
      setProjects(list);
    }).finally(() => setLoading(false));
  }, [user, refresh]);

  const debits = useMemo(() => history.filter((r) => r.direction === "debit"), [history]);
  const credits = useMemo(() => history.filter((r) => r.direction === "credit"), [history]);
  const stats = useMemo(() => ({
    aiRuns: debits.filter((r) => r.module === "phytonet-ai-agent").length,
    dockingJobs: debits.filter((r) => r.module === "molecular-docking").length,
    downloads: 0,
    projects: projects.length,
  }), [debits, projects]);

  if (!user) return null;
  const welcomeBonus = 100;
  const remaining = balance;

  return (
    <main data-testid="dashboard-page" className="mx-auto max-w-7xl px-6 py-14">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5139ED]">
            <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
          </div>
          <h1 className="font-headline mt-2 text-4xl font-bold tracking-tight text-[#0F172A]">
            Welcome back, {user.first_name || user.email?.split("@")[0]}
          </h1>
        </div>
        <button
          type="button"
          onClick={openPurchase}
          data-testid="dashboard-buy-nodes"
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F59E0B] to-[#B45309] px-5 py-2.5 text-[12.5px] font-bold text-white shadow-[0_12px_28px_-10px_rgba(180,83,9,0.5)] transition hover:-translate-y-0.5"
        >
          <Wallet className="h-4 w-4" /> Buy Nodes
        </button>
      </div>

      {/* Account Summary + Node Balance */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-[#E7E7F3] bg-white/80 p-5 backdrop-blur lg:col-span-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            <User className="h-3.5 w-3.5" /> Account
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-[#5139ED] to-[#8139ED] font-bold text-white">
              {(user.first_name?.[0] || user.email?.[0] || "?").toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="font-headline text-[15px] font-bold text-[#0F172A]">
                {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
              </div>
              <div className="truncate text-[12px] text-[#64748B]">{user.email}</div>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-[11.5px]">
            <div><dt className="text-[#94A3B8]">Account type</dt><dd className="mt-0.5 text-[#0F172A]">{user.account_type || "user"}</dd></div>
            <div><dt className="text-[#94A3B8]">Verified</dt><dd className="mt-0.5 inline-flex items-center gap-1 text-[#0F172A]">{user.email_verified ? <ShieldCheck className="h-3 w-3 text-[#2BB673]" /> : "—"} {user.email_verified ? "yes" : "pending"}</dd></div>
            <div className="col-span-2"><dt className="text-[#94A3B8]">Member since</dt><dd className="mt-0.5 text-[#0F172A]">{user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}</dd></div>
          </dl>
          <Link to="/profile" className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-[#5139ED] hover:underline">
            Edit profile <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="rounded-3xl border border-[#E7E7F3] bg-gradient-to-br from-[#FFFBEB] to-white p-5 backdrop-blur lg:col-span-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#B45309]">
            <GoldenLeaf size={14} /> Node Balance
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-headline text-5xl font-bold text-[#0F172A]">{balance}</span>
            <span className="text-[13px] text-[#94A3B8]">available nodes</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><div className="text-[10.5px] uppercase tracking-wider text-[#94A3B8]">Welcome bonus</div><div className="mt-0.5 font-bold text-[#0F172A]">{welcomeBonus}</div></div>
            <div><div className="text-[10.5px] uppercase tracking-wider text-[#94A3B8]">Purchased</div><div className="mt-0.5 font-bold text-[#0F172A]">{lifetimePurchased}</div></div>
            <div><div className="text-[10.5px] uppercase tracking-wider text-[#94A3B8]">Consumed</div><div className="mt-0.5 font-bold text-[#0F172A]">{lifetimeUsed}</div></div>
            <div><div className="text-[10.5px] uppercase tracking-wider text-[#94A3B8]">Remaining</div><div className="mt-0.5 font-bold text-[#0F172A]">{remaining}</div></div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card testid="stat-ai-runs" icon={TrendingUp} label="AI Agent Runs" value={stats.aiRuns} tint="#5139ED" />
        <Card testid="stat-docking" icon={TrendingUp} label="Docking Jobs" value={stats.dockingJobs} tint="#DB2777" />
        <Card testid="stat-projects" icon={FolderOpen} label="Saved Projects" value={stats.projects} tint="#2BB673" />
        <Card testid="stat-downloads" icon={Download} label="Downloads" value={stats.downloads} tint="#0EA5E9" />
      </div>

      {/* Usage History */}
      <section id="usage" className="mt-10">
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[#0F172A]">
          <History className="h-4 w-4" /> Usage History
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#E7E7F3] bg-white">
          {loading ? (
            <div className="p-6 text-center text-[13px] text-[#64748B]"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
          ) : debits.length === 0 ? (
            <div className="p-6 text-center text-[13px] text-[#64748B]">No usage yet — kick off a workflow to see it here.</div>
          ) : (
            <table data-testid="usage-history" className="w-full text-[12.5px]">
              <thead className="bg-[#F8FAFC] text-[#64748B]">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Module</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Workflow</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Nodes</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Balance after</th>
                </tr>
              </thead>
              <tbody>
                {debits.slice(0, 20).map((r) => (
                  <tr key={r.id} className="border-t border-[#F1F1FA]">
                    <td className="px-4 py-2 text-[#0F172A]">{new Date(r.at).toLocaleString()}</td>
                    <td className="px-4 py-2 text-[#0F172A]">{r.module}</td>
                    <td className="px-4 py-2 text-[#64748B]">{r.workflow || r.reason || "—"}</td>
                    <td className="px-4 py-2 text-right font-mono text-red-600">-{r.amount}</td>
                    <td className="px-4 py-2 text-right text-[#0F172A]">{r.balance_after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Recharge History */}
      <section className="mt-10">
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[#0F172A]">
          <Wallet className="h-4 w-4" /> Recharge History
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#E7E7F3] bg-white">
          {credits.length === 0 ? (
            <div className="p-6 text-center text-[13px] text-[#64748B]">No purchases yet.</div>
          ) : (
            <table data-testid="recharge-history" className="w-full text-[12.5px]">
              <thead className="bg-[#F8FAFC] text-[#64748B]">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Package</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Nodes added</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Balance after</th>
                </tr>
              </thead>
              <tbody>
                {credits.slice(0, 20).map((r) => (
                  <tr key={r.id} className="border-t border-[#F1F1FA]">
                    <td className="px-4 py-2 text-[#0F172A]">{new Date(r.at).toLocaleString()}</td>
                    <td className="px-4 py-2 text-[#0F172A]">{r.workflow || r.reason || "Welcome bonus"}</td>
                    <td className="px-4 py-2 text-right font-mono text-emerald-600">+{r.amount}</td>
                    <td className="px-4 py-2 text-right text-[#0F172A]">{r.balance_after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Saved Projects */}
      <section className="mt-10">
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[#0F172A]">
          <FolderOpen className="h-4 w-4" /> Saved Projects ({projects.length})
        </div>
        <div className="rounded-2xl border border-[#E7E7F3] bg-white">
          {projects.length === 0 ? (
            <div className="p-6 text-center text-[13px] text-[#64748B]">No saved projects yet. Run a workflow and click "Save" to see it here.</div>
          ) : (
            <ul className="divide-y divide-[#F1F1FA]">
              {projects.slice(0, 8).map((p) => (
                <li key={p.id || p._id} className="flex items-center gap-3 px-4 py-3">
                  <FolderOpen className="h-4 w-4 text-[#5139ED]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-[#0F172A]">{p.name || p.project_name || "Untitled"}</div>
                    <div className="text-[11px] text-[#64748B]">{p.updated_at ? new Date(p.updated_at).toLocaleString() : ""}</div>
                  </div>
                  <Link to="/my-projects" className="text-[11px] font-semibold text-[#5139ED] hover:underline">Open <ExternalLink className="ml-1 inline h-3 w-3" /></Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
