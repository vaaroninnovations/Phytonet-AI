// Reusable Save Project menu — appears in SiteHeader when logged in.
// Actions: Save (updates active project) · Save As · Snapshot version · Discard changes.
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProject } from "@/context/ProjectContext";
import { Save, FolderOpen, Camera, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function SaveProjectMenu() {
  const { user, guard } = useAuth();
  const {
    activeProjectId, activeProjectName, saving, lastSavedAt,
    saveAs, save, snapshot,
  } = useProject();
  const [open, setOpen] = useState(false);
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!user) return null;

  const doSave = () => guard(async () => {
    setBusy(true);
    try {
      if (activeProjectId) {
        await save();
        toast.success("Project saved");
      } else {
        setShowSaveAs(true); setOpen(false);
      }
    } catch (e) {
      toast.error("Save failed: " + (e?.response?.data?.detail || e.message));
    } finally {
      setBusy(false);
    }
  });

  const doSaveAs = () => guard(async () => {
    if (!name.trim()) return toast.error("Enter a project name");
    setBusy(true);
    try {
      const p = await saveAs(name.trim(), description.trim());
      setShowSaveAs(false); setName(""); setDescription("");
      toast.success(`Saved as "${p.name}"`);
    } catch (e) {
      toast.error("Save failed: " + (e?.response?.data?.detail || e.message));
    } finally {
      setBusy(false);
    }
  });

  const doSnapshot = () => guard(async () => {
    setBusy(true);
    try {
      const v = await snapshot();
      toast.success(`Snapshot created: ${v.label}`);
      setOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message || "Snapshot failed");
    } finally { setBusy(false); }
  });

  return (
    <>
      <div ref={ref} className="relative">
        <button data-testid="header-save-project" onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-xs font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#5139ED]" /> : <Save className="h-3.5 w-3.5 text-[#5139ED]" />}
          <span className="hidden md:inline">{activeProjectId ? "Save" : "Save Project"}</span>
          <ChevronDown className="h-3 w-3" />
        </button>
        {open && (
          <div data-testid="header-save-menu" className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-[#E7E7F3] bg-white shadow-lg z-50">
            <div className="px-4 py-3 border-b border-[#F1F1FA]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Current</p>
              <p className="mt-1 text-xs font-semibold text-[#0B0B18] truncate">
                {activeProjectName || "Unsaved workspace"}
              </p>
              {lastSavedAt && <p className="text-[10px] text-[#94A3B8]">Last saved {new Date(lastSavedAt).toLocaleTimeString()}</p>}
            </div>
            <MenuItem icon={<Save className="h-4 w-4" />} label={activeProjectId ? "Save" : "Save…"} testid="save-menu-save"
                      onClick={() => { setOpen(false); doSave(); }} disabled={busy || !!saving} />
            <MenuItem icon={<Save className="h-4 w-4" />} label="Save As…" testid="save-menu-saveas"
                      onClick={() => { setOpen(false); setShowSaveAs(true); }} />
            <MenuItem icon={<Camera className="h-4 w-4" />} label="Snapshot version" testid="save-menu-snapshot"
                      onClick={doSnapshot} disabled={busy || !activeProjectId} />
            <MenuItem icon={<FolderOpen className="h-4 w-4" />} label="Open My Projects" testid="save-menu-list"
                      onClick={() => { setOpen(false); navigate("/projects"); }} />
          </div>
        )}
      </div>

      {showSaveAs && (
        <div data-testid="saveas-modal" role="dialog" aria-modal="true"
             className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0B0B18]/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-[#E7E7F3] bg-white p-7 shadow-[0_24px_60px_-20px_rgba(81,57,237,0.4)]">
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Save Project</p>
            <h2 className="mt-2 font-display text-xl font-bold text-[#0B0B18]">Name this project</h2>
            <div className="mt-5 space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Project name</label>
                <input data-testid="saveas-name" value={name} onChange={(e) => setName(e.target.value)}
                       autoFocus placeholder="e.g. Curcuma × Type-2 Diabetes"
                       className="brand-focus mt-1 w-full rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm text-[#0B0B18]" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Description (optional)</label>
                <textarea data-testid="saveas-desc" value={description} onChange={(e) => setDescription(e.target.value)}
                          rows={3} className="brand-focus mt-1 w-full rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm text-[#0B0B18]" />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button data-testid="saveas-cancel" onClick={() => setShowSaveAs(false)}
                      className="rounded-full border border-[#E7E7F3] bg-white px-4 py-2 text-sm font-semibold text-[#0B0B18] hover:border-[#5139ED]/40">Cancel</button>
              <button data-testid="saveas-confirm" onClick={doSaveAs} disabled={busy}
                      className="rounded-full bg-[#5139ED] px-5 py-2 text-sm font-bold text-white hover:bg-[#4127c9] disabled:opacity-40">
                {busy ? "Saving…" : "Save Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MenuItem({ icon, label, testid, onClick, disabled }) {
  return (
    <button data-testid={testid} onClick={onClick} disabled={disabled}
            className="flex w-full items-center gap-2 px-4 py-2 text-xs font-semibold text-[#0B0B18] hover:bg-[#FAFAFF] hover:text-[#5139ED] disabled:opacity-40 disabled:hover:bg-transparent">
      {icon}{label}
    </button>
  );
}
