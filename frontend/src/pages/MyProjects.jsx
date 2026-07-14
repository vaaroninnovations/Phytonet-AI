// My Projects — list all saved projects with rename / duplicate / delete /
// resume / snapshot-history actions.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useProject } from "@/context/ProjectContext";
import { WORKFLOW_STEPS } from "@/context/WorkflowContext";
import {
  FolderOpen, RefreshCw, Copy, Trash2, Pencil, Camera,
  History, ChevronRight, Loader2, ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";

const STEP_LABELS = Object.fromEntries(WORKFLOW_STEPS.map((s) => [s.id, s.label]));
const STEP_ROUTES = Object.fromEntries(WORKFLOW_STEPS.map((s) => [s.id, s.route]));

export default function MyProjects() {
  const { user, loading: authLoading, openModal } = useAuth();
  const { list, load, rename, duplicate, remove, versions, restore } = useProject();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [historyId, setHistoryId] = useState(null);
  const [historyList, setHistoryList] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;           // wait for auth hydration
    if (!user) { openModal("signin"); return; }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  async function refresh() {
    setLoading(true); setError(null);
    try {
      setProjects(await list());
    } catch (e) {
      setError(e?.response?.data?.detail || e.message);
    } finally { setLoading(false); }
  }

  const onOpen = async (p) => {
    try {
      await load(p.id);
      toast.success(`Opened "${p.name}"`);
      const route = STEP_ROUTES[p.current_step] || "/phytonet-ai";
      navigate(route);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  const onRename = async (p) => {
    if (!renameValue.trim()) return;
    try {
      await rename(p.id, renameValue.trim());
      setRenamingId(null); setRenameValue("");
      await refresh();
      toast.success("Renamed");
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  const onDuplicate = async (p) => {
    try { await duplicate(p.id); await refresh(); toast.success("Duplicated"); }
    catch (e) { toast.error(e?.response?.data?.detail || e.message); }
  };

  const onDelete = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try { await remove(p.id); await refresh(); toast.success("Deleted"); }
    catch (e) { toast.error(e?.response?.data?.detail || e.message); }
  };

  const onShowHistory = async (p) => {
    setHistoryId(p.id); setHistoryList([]);
    try { setHistoryList(await versions(p.id)); }
    catch (e) { toast.error(e?.response?.data?.detail || e.message); }
  };

  const onRestoreVersion = async (versionId) => {
    if (!historyId) return;
    try {
      await restore(historyId, versionId);
      toast.success("Version restored");
      setHistoryId(null);
      await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  if (authLoading) {
    return (
      <main data-testid="projects-loading" className="mx-auto max-w-3xl px-6 py-24 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#5139ED]" />
        <p className="mt-3 text-xs text-[#64748B]">Loading session…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main data-testid="projects-guest" className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-display text-3xl font-bold text-[#0B0B18]">Sign in to view your projects</h1>
        <p className="mt-3 text-sm text-[#64748B]">Projects, snapshots, and auto-saved sessions are private to your account.</p>
      </main>
    );
  }

  return (
    <main data-testid="my-projects-page" className="mx-auto max-w-6xl px-6 pb-24 pt-14">
      <button data-testid="projects-back" onClick={() => navigate(-1)}
              className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-[#64748B] hover:text-[#5139ED]">
        <ChevronLeft className="h-3 w-3" />Back
      </button>
      <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Workspace</p>
      <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-[#0B0B18]">My Projects</h1>
      <p className="mt-3 max-w-2xl text-[#64748B]">
        Saved workflows and snapshots. Open any project to resume exactly where you left off — no
        upstream data will be recomputed unless you re-run a step.
      </p>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs font-semibold text-[#64748B]">{projects.length} project{projects.length === 1 ? "" : "s"}</p>
        <button data-testid="projects-refresh" onClick={refresh}
                className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-xs font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]">
          <RefreshCw className="h-3.5 w-3.5" />Refresh
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading && <div className="flex items-center gap-2 text-xs text-[#64748B]"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…</div>}
        {!loading && projects.length === 0 && (
          <div data-testid="projects-empty" className="col-span-full rounded-3xl border border-dashed border-[#E7E7F3] bg-white/60 p-10 text-center">
            <FolderOpen className="mx-auto h-8 w-8 text-[#5139ED]/60" />
            <h3 className="mt-3 text-lg font-bold text-[#0B0B18]">No saved projects yet</h3>
            <p className="mt-1 text-sm text-[#64748B]">Save any workflow session using the Save Project button in the header.</p>
          </div>
        )}
        {error && <div className="col-span-full text-sm text-red-600">{error}</div>}
        {projects.map((p) => (
          <div key={p.id} data-testid={`project-card-${p.id}`}
               className="rounded-3xl border border-[#E7E7F3] bg-white p-5 shadow-[0_1px_2px_rgba(11,11,24,0.03)]">
            <div className="flex items-start justify-between gap-3">
              {renamingId === p.id ? (
                <div className="flex-1">
                  <input data-testid={`rename-input-${p.id}`} autoFocus value={renameValue}
                         onChange={(e) => setRenameValue(e.target.value)}
                         onKeyDown={(e) => { if (e.key === "Enter") onRename(p); if (e.key === "Escape") setRenamingId(null); }}
                         className="w-full rounded-lg border border-[#5139ED]/40 bg-white px-2 py-1 text-sm font-bold text-[#0B0B18]" />
                  <div className="mt-2 flex gap-2">
                    <button data-testid={`rename-save-${p.id}`} onClick={() => onRename(p)}
                            className="rounded-full bg-[#5139ED] px-3 py-1 text-[10px] font-bold text-white">Save</button>
                    <button data-testid={`rename-cancel-${p.id}`} onClick={() => setRenamingId(null)}
                            className="rounded-full border border-[#E7E7F3] bg-white px-3 py-1 text-[10px] font-semibold text-[#64748B]">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <h3 className="truncate font-heading text-base font-bold text-[#0B0B18]">{p.name}</h3>
                  {p.description && <p className="mt-1 text-xs text-[#64748B] line-clamp-2">{p.description}</p>}
                </div>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
              <div className="rounded-lg bg-[#FAFAFF] p-2">
                <p className="font-bold uppercase tracking-widest text-[#94A3B8]">Current step</p>
                <p className="mt-0.5 font-semibold text-[#0B0B18]">{STEP_LABELS[p.current_step] || "—"}</p>
              </div>
              <div className="rounded-lg bg-[#FAFAFF] p-2">
                <p className="font-bold uppercase tracking-widest text-[#94A3B8]">Completed</p>
                <p className="mt-0.5 font-semibold text-[#0B0B18]">{(p.completed_steps || []).length} steps</p>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-[#94A3B8]">Updated {new Date(p.updated_at || p.created_at).toLocaleString()}</p>
            {p.version_count > 0 && <p className="text-[10px] text-[#94A3B8]">{p.version_count} snapshot{p.version_count === 1 ? "" : "s"}</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              <button data-testid={`project-open-${p.id}`} onClick={() => onOpen(p)}
                      className="inline-flex items-center gap-1 rounded-full bg-[#5139ED] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-[#4127c9]">
                <ChevronRight className="h-3 w-3" />Resume
              </button>
              <button data-testid={`project-rename-${p.id}`} onClick={() => { setRenamingId(p.id); setRenameValue(p.name); }}
                      className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#0B0B18] hover:border-[#5139ED]/40">
                <Pencil className="h-3 w-3" />Rename
              </button>
              <button data-testid={`project-duplicate-${p.id}`} onClick={() => onDuplicate(p)}
                      className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#0B0B18] hover:border-[#5139ED]/40">
                <Copy className="h-3 w-3" />Duplicate
              </button>
              <button data-testid={`project-history-${p.id}`} onClick={() => onShowHistory(p)}
                      className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#0B0B18] hover:border-[#5139ED]/40">
                <History className="h-3 w-3" />History
              </button>
              <button data-testid={`project-delete-${p.id}`} onClick={() => onDelete(p)}
                      className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-red-600 hover:border-red-300 hover:bg-red-50">
                <Trash2 className="h-3 w-3" />Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Version history drawer */}
      {historyId && (
        <div data-testid="history-modal" role="dialog" aria-modal="true"
             className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0B0B18]/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#E7E7F3] bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Snapshot History</p>
                <h3 className="mt-1 font-display text-lg font-bold text-[#0B0B18]">Restore a snapshot</h3>
              </div>
              <button data-testid="history-close" onClick={() => setHistoryId(null)}
                      className="rounded-full p-1 text-[#64748B] hover:bg-[#F1F1FA]">×</button>
            </div>
            <div className="mt-4 max-h-[400px] space-y-2 overflow-y-auto">
              {historyList.length === 0 && <p className="text-xs text-[#64748B]">No snapshots yet. Create one via Save Project → Snapshot.</p>}
              {historyList.map((v) => (
                <div key={v.id} data-testid={`version-row-${v.id}`}
                     className="flex items-center justify-between rounded-lg border border-[#E7E7F3] bg-[#FAFAFF] px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-[#0B0B18]">{v.label}</p>
                    <p className="text-[10px] text-[#94A3B8]">
                      {STEP_LABELS[v.current_step] || "—"} · {new Date(v.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button data-testid={`version-restore-${v.id}`} onClick={() => onRestoreVersion(v.id)}
                          className="inline-flex items-center gap-1 rounded-full bg-[#5139ED] px-3 py-1 text-[10px] font-bold text-white hover:bg-[#4127c9]">
                    <Camera className="h-3 w-3" />Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
