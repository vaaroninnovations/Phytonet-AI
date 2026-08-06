// ProjectTab — split-pane research workspace for one project.
// Left pane: chat + composer + suggested next steps (NO inline result cards).
// Right pane: aggregated ResultCards (tables, network, images) from every run.
// Adjustable draggable divider between them (SplitPane).
// State (scroll positions + panel size) is persisted per tab via useTabState.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authApi } from "@/context/AuthContext";
import { Loader2, Sparkles, MessageSquare, FileBarChart, ArrowRight,
         RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { SplitPane } from "./SplitPane";
import { Composer } from "@/components/research/Composer";
import { ChatMessage } from "@/components/research/ChatMessage";
import { ResultCard } from "@/components/research/cards";
import { ProjectHeader } from "@/components/research/ProjectHeader";

export function ProjectTab({ tabId, projectId, initialPrompt, panelRatio,
                              onPanelRatioChange, savedScroll, onScrollChange,
                              onTitleChange }) {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [executing, setExecuting] = useState(null);
  const [retrying, setRetrying] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const pollRef = useRef(null);
  const leftScrollRef = useRef(null);
  const rightScrollRef = useRef(null);
  const initialSent = useRef(false);

  // ─── Load project (abort-safe against Strict-Mode double-invoke) ─
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    setLoading(true);
    authApi.get(`/research/projects/${projectId}`)
      .then(({ data }) => {
        if (!alive) return;
        setProject(data);
        if (onTitleChange && data?.title) onTitleChange(data.title);
      })
      .catch((e) => {
        if (!alive) return;
        toast.error(e?.response?.data?.detail || "Failed to open project");
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId, onTitleChange]);

  // ─── Send message ────────────────────────────────────────────────
  const send = useCallback(async (prompt) => {
    if (!project) return;
    // Optimistic user message so the composer never appears to "eat" the input.
    setProject((cur) => cur ? {
      ...cur,
      messages: [...(cur.messages || []),
                 { role: "user", text: prompt, _optimistic: true }],
    } : cur);
    setSending(true);
    try {
      const { data } = await authApi.post(
        `/research/projects/${project.id}/message`,
        { prompt, attachments },
      );
      const { data: fresh } = await authApi.get(`/research/projects/${project.id}`);
      setProject(fresh);
      setAttachments([]);
      const newRun = data.run;
      if (newRun?.id) execute(project.id, newRun.id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to send message");
      // Roll back the optimistic bubble.
      setProject((cur) => cur ? {
        ...cur,
        messages: (cur.messages || []).filter((m) => !m._optimistic),
      } : cur);
    } finally { setSending(false); }
  }, [project, attachments]);

  // ─── Execute + poll ──────────────────────────────────────────────
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
    // Signature of the last-seen status so we can skip setState when nothing
    // changed (a plain polling tick shouldn't cause a full re-render + all
    // downstream Cytoscape/table remounts).
    let lastSig = "";
    pollRef.current = setInterval(async () => {
      try {
        const { data: status } = await authApi.get(
          `/research/projects/${pid}/status/${runId}`,
        );
        const sig = JSON.stringify({
          s: status.status,
          p: (status.plan || []).map((x) => [x.id, x.status, x.progress?.detail || null]),
          r: (status.results || []).map((x) => [x.id, x.status]),
          i: (status.interpretation || "").length,
          st: !!status.interp_streaming,
        });
        if (sig !== lastSig) {
          lastSig = sig;
          setProject((cur) => {
            if (!cur) return cur;
            const runs = (cur.runs || []).map((r) =>
              r.id === runId ? { ...r, ...status } : r,
            );
            return { ...cur, runs };
          });
        }
        if (["completed", "failed"].includes(status.status)) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setExecuting(null);
          setRetrying(null);
          const { data: fresh } = await authApi.get(`/research/projects/${pid}`);
          setProject(fresh);
        }
      } catch { /* ignore */ }
    }, 700);
  };

  useEffect(() => () => pollRef.current && clearInterval(pollRef.current), []);

  // ─── Retry ───────────────────────────────────────────────────────
  const retryStep = async (runId, stepId) => {
    if (!project) return;
    setRetrying({ runId, stepId });
    setExecuting(runId);
    try {
      await authApi.post(`/research/projects/${project.id}/retry/${runId}/${stepId}`);
      toast.success("Retrying from failed step…");
      startPolling(project.id, runId);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to retry step");
      setRetrying(null); setExecuting(null);
    }
  };

  // ─── Attachments ─────────────────────────────────────────────────
  const attach = async (files) => {
    if (!project) return;
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        const { data } = await authApi.post(
          `/research/projects/${project.id}/upload`, fd,
          { headers: { "Content-Type": "multipart/form-data" } },
        );
        setAttachments((cur) => [...cur, data]);
        toast.success(`Attached ${f.name}`);
      } catch (e) {
        toast.error(e?.response?.data?.detail || `Upload failed`);
      }
    }
  };

  // ─── Auto-send an initial prompt on first open (from Home chat bar) ─
  useEffect(() => {
    if (initialPrompt && project && !initialSent.current) {
      initialSent.current = true;
      // Only send if the project has no messages yet (fresh project).
      if ((project.messages || []).length === 0) send(initialPrompt);
    }
  }, [initialPrompt, project, send]);

  // ─── Persist scroll positions ────────────────────────────────────
  useEffect(() => {
    if (!leftScrollRef.current || savedScroll?.left == null) return;
    leftScrollRef.current.scrollTop = savedScroll.left;
  }, [projectId, savedScroll?.left, loading]);

  useEffect(() => {
    if (!rightScrollRef.current || savedScroll?.right == null) return;
    rightScrollRef.current.scrollTop = savedScroll.right;
  }, [projectId, savedScroll?.right, loading]);

  const onLeftScroll = (e) => onScrollChange && onScrollChange("left",  e.target.scrollTop);
  const onRightScroll = (e) => onScrollChange && onScrollChange("right", e.target.scrollTop);

  // ─── Aggregate all results across every run for the right pane ────
  const allResults = useMemo(() => {
    const items = [];
    for (const r of (project?.runs || [])) {
      for (const s of (r.results || [])) {
        if (s.status === "done" && s.result) {
          items.push({ runId: r.id, runTitle: r.title, step: s });
        }
      }
    }
    return items;
  }, [project?.runs]);

  const runsById = useMemo(() => {
    const m = {};
    for (const r of (project?.runs || [])) m[r.id] = r;
    return m;
  }, [project?.runs]);

  // ─── Render ──────────────────────────────────────────────────────
  if (loading || !project) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0B0B18] via-[#141024] to-[#1A0F2E]">
        <Loader2 className="animate-spin text-[#a48bff]" size={26} />
      </div>
    );
  }

  const messages = project.messages || [];
  const isBusy = sending || !!executing;

  return (
    <div data-testid={`project-tab-${projectId}`}
         className="flex h-full w-full min-h-0 flex-col bg-gradient-to-br from-[#0B0B18] via-[#141024] to-[#1A0F2E]">
      <ProjectHeader project={project} />
      <div className="flex-1 min-h-0 min-w-0">
        <SplitPane
          ratio={panelRatio || 0.45}
          onChange={onPanelRatioChange}
          left={
            <>
              <div ref={leftScrollRef} onScroll={onLeftScroll}
                   data-testid="project-tab-left"
                   className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl px-5 py-5 space-y-5">
                  {messages.length === 0 && !sending && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur-sm">
                      <Sparkles className="mx-auto text-[#a48bff]" size={20} />
                      <div className="mt-2 text-[14px] font-semibold text-slate-100">
                        Ready when you are.
                      </div>
                      <div className="mt-1 text-[12.5px] text-slate-400">
                        Ask a research question below.
                      </div>
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <ChatMessage
                      key={i}
                      msg={m}
                      run={m.run_id ? runsById[m.run_id] : null}
                      onExecute={(rid) => execute(project.id, rid)}
                      executing={executing}
                      onOpenRun={() => {}}
                      onSend={send}
                      onRetryStep={retryStep}
                      retryingStepId={retrying}
                      hideResults
                    />
                  ))}
                  {sending && (
                    <div className="flex items-center gap-2 text-[13px] text-slate-400">
                      <Loader2 size={14} className="animate-spin text-[#a48bff]" />
                      Planning with Claude Sonnet 4.5…
                    </div>
                  )}
                </div>
              </div>
              <Composer
                onSend={send}
                onAttach={attach}
                disabled={isBusy}
                attachments={attachments}
                onRemoveAttach={(i) => setAttachments((cur) => cur.filter((_, j) => j !== i))}
              />
            </>
          }
          right={
            <div ref={rightScrollRef} onScroll={onRightScroll}
                 data-testid="project-tab-right"
                 className="flex-1 overflow-y-auto bg-black/20">
              <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/10 bg-black/60 backdrop-blur-xl px-4 py-2.5">
                <FileBarChart size={14} className="text-[#a48bff]" />
                <div className="text-[11px] font-bold uppercase tracking-widest text-slate-300">Results</div>
                <span className="rounded-full bg-[#5139ED]/20 border border-[#5139ED]/40 px-2 py-0.5 text-[10.5px] font-semibold text-[#a48bff]">
                  {allResults.length} outputs
                </span>
                {executing && (
                  <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10.5px] font-semibold text-amber-200">
                    <Loader2 size={10} className="animate-spin" /> Running…
                  </span>
                )}
              </div>
              <div className="p-4 space-y-3">
                {allResults.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                    <FileBarChart className="mx-auto text-slate-500" size={22} />
                    <div className="mt-2 text-[13px] font-semibold text-slate-300">
                      Results will appear here
                    </div>
                    <div className="mt-1 text-[11.5px] text-slate-500">
                      Tables, charts, networks and images produced by the assistant.
                    </div>
                  </div>
                ) : (
                  allResults.map((item, i) => (
                    <div key={`${item.runId}-${item.step.id}-${i}`}
                         data-testid={`result-${item.step.tool}-${i}`}
                         className="rounded-xl border border-white/5 bg-black/25 p-1">
                      <div className="px-3 pt-2 pb-1 flex items-center gap-2">
                        <MessageSquare size={10} className="text-slate-500" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                          {item.step.tool} · {item.runTitle || "Run"}
                        </span>
                      </div>
                      <div className="px-1 pb-1">
                        <ResultCard result={item.step.result} />
                      </div>
                    </div>
                  ))
                )}
                {(() => {
                  const lastInterp = (project.runs || [])
                    .filter((r) => r.interpretation).slice(-1)[0];
                  if (!lastInterp) return null;
                  const streaming = !!lastInterp.interp_streaming;
                  return (
                    <div data-testid="interpretation-card"
                         className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[13px] leading-relaxed text-slate-100">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                          {streaming ? "Writing Interpretation…" : "Latest Interpretation"}
                        </div>
                        {streaming && (
                          <span data-testid="interp-streaming-badge"
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 border border-emerald-400/30 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-200">
                            <span className="h-1 w-1 rounded-full bg-emerald-300 animate-pulse" />
                            LIVE
                          </span>
                        )}
                      </div>
                      <div data-testid="interpretation-text"
                           className="whitespace-pre-wrap">
                        {lastInterp.interpretation}
                        {streaming && (
                          <span data-testid="interp-cursor"
                                className="ml-0.5 inline-block h-4 w-[7px] translate-y-0.5 bg-emerald-300 align-baseline animate-caret" />
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
