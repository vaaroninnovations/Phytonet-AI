// Public read-only view of a shared research project.
// Route: /research/shared/:slug (no auth required)
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { Sparkles, Loader2, CheckCircle2, XCircle, Circle,
         MessageSquare, Bot, User, ExternalLink } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SharedResearch() {
  const { slug } = useParams();
  const [state, setState] = useState({ loading: true, project: null, error: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/research/shared/${slug}`);
        if (alive) setState({ loading: false, project: data, error: null });
      } catch (e) {
        if (alive) setState({ loading: false, project: null,
                              error: e?.response?.data?.detail ||
                                     "Shared project not found or was unshared." });
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  if (state.loading) {
    return (
      <div data-testid="shared-loading"
           className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0B0B18] via-[#141024] to-[#1A0F2E] text-slate-300">
        <Loader2 className="animate-spin text-[#a48bff]" size={32} />
      </div>
    );
  }
  if (state.error) {
    return (
      <div data-testid="shared-error"
           className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#0B0B18] via-[#141024] to-[#1A0F2E] text-slate-300 p-6">
        <XCircle className="text-rose-400" size={40} />
        <div className="text-lg font-semibold text-slate-100">Not Available</div>
        <div className="text-sm text-slate-400 text-center max-w-md">{state.error}</div>
        <Link to="/" className="mt-2 rounded-lg bg-[#5139ED] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6242f5]">
          Return home
        </Link>
      </div>
    );
  }

  const { project } = state;
  const runs = project.runs || [];
  const messages = project.messages || [];

  return (
    <div data-testid="shared-research"
         className="min-h-screen bg-gradient-to-br from-[#0B0B18] via-[#141024] to-[#1A0F2E] text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 rounded-2xl border border-[#5139ED]/30 bg-[#5139ED]/10 p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="text-[#a48bff]" size={18} />
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#a48bff]">
              Shared Research · Read-Only
            </span>
          </div>
          <h1 data-testid="shared-title"
              className="mt-2 text-2xl font-bold tracking-tight text-slate-100">
            {project.title || "Untitled Research"}
          </h1>
          <div className="mt-1 text-xs text-slate-400">
            Shared {project.shared_at ? new Date(project.shared_at).toLocaleString() : "—"} · {messages.length} messages · {runs.length} runs
          </div>
          <Link to="/research"
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#a48bff] hover:text-white">
            Try PhytoNet AI Research Assistant <ExternalLink size={12} />
          </Link>
        </div>

        <div className="space-y-4">
          {messages.map((m, i) => (
            <div key={i} data-testid={`shared-msg-${i}`}
                 className="rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                {m.role === "user"
                  ? <><User size={12} /> User</>
                  : <><Bot size={12} /> Assistant</>}
              </div>
              {m.text && (
                <div className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-200">
                  {m.text}
                </div>
              )}
              {m.plan && m.plan.length > 0 && (
                <div className="mt-3 rounded-lg border border-white/5 bg-black/30 p-3">
                  <div className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Plan</div>
                  <ul className="space-y-1 text-[12.5px] text-slate-300">
                    {m.plan.map((s, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <MessageSquare size={11} className="mt-0.5 text-[#a48bff]" />
                        <span>{s.label || s.tool}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}

          {runs.map((r, i) => (
            <div key={r.id || i} data-testid={`shared-run-${i}`}
                 className="rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[15px] font-semibold text-slate-100">{r.title || "Run"}</div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  r.status === "completed" ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" :
                  r.status === "failed" ? "bg-rose-500/15 text-rose-300 border border-rose-500/30" :
                  "bg-slate-500/15 text-slate-300 border border-slate-500/30"
                }`}>
                  {r.status === "completed" ? <CheckCircle2 size={11} /> :
                   r.status === "failed" ? <XCircle size={11} /> : <Circle size={11} />}
                  {r.status}
                </span>
              </div>
              {r.interpretation && (
                <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-[13px] leading-relaxed text-emerald-100">
                  {r.interpretation}
                </div>
              )}
              {(r.results || []).map((step, j) => {
                const res = step.result || {};
                const data = res.data || {};
                return (
                  <div key={j} className="mt-3 rounded-lg border border-white/5 bg-black/30 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                        {step.tool}
                      </div>
                      <span className={`text-[10.5px] ${step.status === "done" ? "text-emerald-400" : step.status === "error" ? "text-rose-400" : "text-slate-500"}`}>
                        {step.status}
                      </span>
                    </div>
                    {res.message && (
                      <div className="mt-1 text-[12.5px] text-slate-300">{res.message}</div>
                    )}
                    {Array.isArray(data.compounds) && (
                      <div className="mt-1 text-[11px] text-slate-500">{data.compounds.length} compounds</div>
                    )}
                    {Array.isArray(data.targets) && (
                      <div className="mt-1 text-[11px] text-slate-500">{data.targets.length} targets</div>
                    )}
                    {Array.isArray(data.hits) && (
                      <div className="mt-1 text-[11px] text-slate-500">{data.hits.length} disease hits</div>
                    )}
                    {(data.kegg || data.go) && (
                      <div className="mt-1 text-[11px] text-slate-500">
                        {(data.kegg || []).length} KEGG · {(data.go || []).length} GO/Reactome terms
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-8 text-center text-[11px] text-slate-500">
          Powered by PhytoNet AI · Read-only view of a research session
        </div>
      </div>
    </div>
  );
}
