// AI Research Workspace — chat-first entry point at /research.
// Left sidebar (projects) · Center (chat + composer) · Right (viz panel).
// The planner + executor live in the backend (research_service.py); this
// component only orchestrates the UI. Sub-components live in
// /app/frontend/src/components/research/.
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { authApi } from "@/context/AuthContext";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Sidebar } from "@/components/research/Sidebar";
import { Composer } from "@/components/research/Composer";
import { ProjectHeader } from "@/components/research/ProjectHeader";
import { ChatMessage } from "@/components/research/ChatMessage";
import { VizPanel } from "@/components/research/VizPanel";
import { EmptyState, SuggestedPromptsGrid } from "@/components/research/EmptyState";

export default function ResearchWorkspace() {
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [activeProject, setActiveProject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [executing, setExecuting] = useState(null);
  const [retrying, setRetrying] = useState(null);  // {runId, stepId}
  const [attachments, setAttachments] = useState([]);
  const [vizRun, setVizRun] = useState(null);
  const scrollRef = useRef(null);
  const pollRef = useRef(null);

  // ─── Bootstrap ──────────────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const { data } = await authApi.get("/research/projects");
      setProjects(data || []);
      return data || [];
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load projects");
      return [];
    } finally { setProjectsLoading(false); }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const openProject = async (id) => {
    setLoading(true);
    try {
      const { data } = await authApi.get(`/research/projects/${id}`);
      setActiveProject(data);
      setAttachments([]);
      setVizRun(null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to open project");
    } finally { setLoading(false); }
  };

  const newProject = async (initialTitle = "New Research") => {
    try {
      const { data } = await authApi.post("/research/projects",
                                          { title: initialTitle });
      await loadProjects();
      setActiveProject(data);
      setVizRun(null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to create project");
    }
  };

  const deleteProject = async (id) => {
    if (!window.confirm("Delete this research project?")) return;
    try {
      await authApi.delete(`/research/projects/${id}`);
      setProjects((ps) => ps.filter((p) => p.id !== id));
      if (activeProject?.id === id) setActiveProject(null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to delete");
    }
  };

  // ─── Auto-scroll on new messages ────────────────────────────────
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeProject?.messages?.length, activeProject?.runs?.length]);

  // ─── Send message ───────────────────────────────────────────────
  const send = async (prompt) => {
    let proj = activeProject;
    if (!proj) {
      const { data } = await authApi.post("/research/projects", { title: prompt.slice(0, 80) });
      proj = data;
      setActiveProject(proj);
      loadProjects();
    }
    setSending(true);
    try {
      const { data } = await authApi.post(
        `/research/projects/${proj.id}/message`,
        { prompt, attachments },
      );
      // Refetch to get authoritative state including new run
      const { data: fresh } = await authApi.get(`/research/projects/${proj.id}`);
      setActiveProject(fresh);
      setAttachments([]);
      loadProjects();
      // Auto-execute if a plan came back
      const newRun = data.run;
      if (newRun?.id) {
        execute(proj.id, newRun.id);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to send message");
    } finally { setSending(false); }
  };

  // ─── Execute a run + poll status ────────────────────────────────
  const execute = async (pid, runId) => {
    setExecuting(runId);
    try {
      await authApi.post(`/research/projects/${pid}/execute/${runId}`);
      startPolling(pid, runId);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to start execution");
      setExecuting(null);
    }
  };

  const startPolling = (pid, runId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data: status } = await authApi.get(
          `/research/projects/${pid}/status/${runId}`,
        );
        setActiveProject((cur) => {
          if (!cur) return cur;
          const runs = (cur.runs || []).map((r) =>
            r.id === runId ? { ...r, ...status } : r,
          );
          return { ...cur, runs };
        });
        if (["completed", "failed"].includes(status.status)) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setExecuting(null);
          setRetrying(null);
          // Refetch to get any final assistant interpretation message + full run
          const { data: fresh } = await authApi.get(`/research/projects/${pid}`);
          setActiveProject(fresh);
          const fullRun = (fresh.runs || []).find((r) => r.id === runId) || status;
          setVizRun(fullRun);
        }
      } catch { /* ignore transient */ }
    }, 1000);
  };
  useEffect(() => () => pollRef.current && clearInterval(pollRef.current), []);

  // ─── Retry a failed step (resumes downstream too) ───────────────
  const retryStep = async (runId, stepId) => {
    if (!activeProject) return;
    setRetrying({ runId, stepId });
    setExecuting(runId);
    try {
      await authApi.post(
        `/research/projects/${activeProject.id}/retry/${runId}/${stepId}`,
      );
      toast.success("Retrying from failed step…");
      startPolling(activeProject.id, runId);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to retry step");
      setRetrying(null);
      setExecuting(null);
    }
  };

  // ─── Attachments ────────────────────────────────────────────────
  const attach = async (files) => {
    let pid = activeProject?.id;
    if (!pid) {
      const { data } = await authApi.post("/research/projects", { title: "New Research" });
      pid = data.id;
      setActiveProject(data);
      loadProjects();
    }
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        const { data } = await authApi.post(
          `/research/projects/${pid}/upload`, fd,
          { headers: { "Content-Type": "multipart/form-data" } },
        );
        setAttachments((cur) => [...cur, data]);
        toast.success(`Attached ${f.name} (${data.kind}${data.extracted?.length ? `, ${data.extracted.length} SMILES` : ""})`);
      } catch (e) {
        toast.error(e?.response?.data?.detail || `Failed to upload ${f.name}`);
      }
    }
  };

  // ─── Runs indexed for quick lookup ──────────────────────────────
  const runsById = useMemo(() => {
    const m = {};
    for (const r of (activeProject?.runs || [])) m[r.id] = r;
    return m;
  }, [activeProject?.runs]);

  const messages = activeProject?.messages || [];

  return (
    <div data-testid="research-workspace"
         className="fixed inset-0 top-16 flex bg-gradient-to-br from-[#0B0B18] via-[#141024] to-[#1A0F2E] text-slate-100">
      <Sidebar projects={projects} activeId={activeProject?.id}
               onSelect={openProject}
               onNew={() => newProject()}
               onDelete={deleteProject}
               loading={projectsLoading} />

      <main className="flex flex-1 flex-col min-w-0">
        {activeProject && <ProjectHeader project={activeProject} />}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {!activeProject ? (
            <EmptyState onPick={(text) => { newProject(text.slice(0, 80)).then(() => setTimeout(() => send(text), 250)); }} />
          ) : (
            <div className="mx-auto max-w-4xl px-6 py-6 space-y-6">
              {messages.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-sm">
                  <Sparkles className="mx-auto text-[#a48bff]" size={22} />
                  <div className="mt-2 text-[15px] font-semibold text-slate-100">Ready when you are.</div>
                  <div className="mt-1 text-[13px] text-slate-400">Type a research question below or pick one of the suggested prompts.</div>
                  <SuggestedPromptsGrid onPick={send} />
                </div>
              )}
              {messages.map((m, i) => (
                <ChatMessage
                  key={i}
                  msg={m}
                  run={m.run_id ? runsById[m.run_id] : null}
                  onExecute={(rid) => execute(activeProject.id, rid)}
                  executing={executing}
                  onOpenRun={setVizRun}
                  onSend={send}
                  onRetryStep={retryStep}
                  retryingStepId={retrying}
                />
              ))}
              {sending && (
                <div className="flex items-center gap-2 text-[13px] text-slate-400">
                  <Loader2 size={14} className="animate-spin text-[#a48bff]" />
                  PhytoNet AI is planning…
                </div>
              )}
            </div>
          )}
        </div>

        <Composer
          onSend={send}
          onAttach={attach}
          disabled={sending || !!executing}
          attachments={attachments}
          onRemoveAttach={(i) => setAttachments((cur) => cur.filter((_, j) => j !== i))}
        />
      </main>

      <VizPanel activeRun={vizRun} onClose={() => setVizRun(null)} onSend={send} />
    </div>
  );
}
