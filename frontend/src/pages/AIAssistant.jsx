// PhytoNet AI Assistant — one-click end-to-end workflow.
// Input: plant + disease + optional LC-MS. Output: publication-ready report.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Loader2, Check, X, ArrowRight, Download, Gift, AlertCircle, Play } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  assistantEligibility, assistantRun, assistantStatus, assistantReportURL,
} from "@/lib/api";

const POLL_MS = 2500;

export default function AIAssistant() {
  const { user, openModal, guard } = useAuth();
  const [plant, setPlant] = useState("");
  const [disease, setDisease] = useState("");
  const [eligible, setEligible] = useState({ eligible: true, is_admin: false, free_used: false });
  const [run, setRun] = useState(null);
  const [starting, setStarting] = useState(false);
  const [checkingElig, setCheckingElig] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    setCheckingElig(true);
    assistantEligibility()
      .then(setEligible)
      .catch(() => {})
      .finally(() => setCheckingElig(false));
  }, [user]);

  useEffect(() => {
    if (!run || run.status === "done" || run.status === "failed") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const s = await assistantStatus(run.id);
        setRun(s);
      } catch (e) {}
    }, POLL_MS);
    return () => pollRef.current && clearInterval(pollRef.current);
  }, [run?.id, run?.status]);

  const canStart = plant.trim().length >= 2 && disease.trim().length >= 2 && !starting;

  const onStart = () => guard(async () => {
    if (!canStart) return;
    if (!eligible.eligible) {
      toast.error("Free run already used — upgrade to run again.");
      return;
    }
    setStarting(true);
    try {
      const r = await assistantRun(plant.trim(), disease.trim());
      setRun(r);
      toast.success("PhytoNet AI Assistant is analysing your query…");
      setEligible((e) => ({ ...e, free_used: !e.is_admin, eligible: e.is_admin }));
    } catch (e) {
      const status = e?.response?.status;
      if (status === 402) {
        setEligible({ eligible: false, is_admin: false, free_used: true });
        toast.error("Upgrade to run again — free run already used.");
      } else {
        toast.error("Assistant failed to start: " + (e?.response?.data?.detail || e.message));
      }
    } finally { setStarting(false); }
  });

  return (
    <main data-testid="ai-assistant-page" className="relative mx-auto max-w-6xl px-6 pb-24 pt-14">
      <div aria-hidden className="brand-blur absolute -left-32 top-10 h-[320px] w-[320px] bg-[#5139ED]" />
      <div aria-hidden className="brand-blur absolute -right-24 top-40 h-[280px] w-[280px] bg-[#2BB673]" />

      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white/80 px-3.5 py-1.5 text-[11px] font-semibold text-[#374151] backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-[#5139ED]" /> PhytoNet AI Assistant · One-click
        </span>
        <h1 className="font-headline mt-4 text-[36px] leading-[1.05] tracking-[-0.02em] text-[#111827] sm:text-[48px]">
          One <span className="gradient-text">plant</span> and one <span className="gradient-text">disease</span> — everything else is automatic.
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[#374151]">
          Skip the manual module-by-module workflow. Enter a medicinal plant and a disease; the Assistant orchestrates
          compound extraction, ADMET screening, target prediction, disease intersection, network analysis, GO/KEGG
          enrichment, and generates a publication-ready manuscript.
        </p>

        {user && (
          <div className="mt-4">
            {eligible.is_admin ? (
              <span data-testid="assistant-badge-admin" className="inline-flex items-center gap-1.5 rounded-full bg-[#5139ED]/12 px-3 py-1 text-[11px] font-bold text-[#5139ED]">
                <Sparkles className="h-3 w-3" /> Admin — unlimited Assistant runs
              </span>
            ) : eligible.eligible ? (
              <span data-testid="assistant-badge-free" className="inline-flex items-center gap-1.5 rounded-full bg-[#2BB673]/12 px-3 py-1 text-[11px] font-bold text-[#2BB673]">
                <Gift className="h-3 w-3" /> Free one-time use available
              </span>
            ) : (
              <span data-testid="assistant-badge-used" className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-700">
                <AlertCircle className="h-3 w-3" /> Free run used — Upgrade to run again
              </span>
            )}
          </div>
        )}
      </div>

      {/* Form card */}
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#6B7280]">Medicinal plant *</span>
          <input
            data-testid="assistant-plant"
            value={plant} onChange={(e) => setPlant(e.target.value)}
            placeholder="Withania somnifera · Curcuma longa · Tinospora cordifolia"
            className="brand-focus w-full rounded-xl border border-[#E7E7F3] bg-white px-4 py-3 text-[14px] text-[#111827]"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#6B7280]">Disease *</span>
          <input
            data-testid="assistant-disease"
            value={disease} onChange={(e) => setDisease(e.target.value)}
            placeholder="Type 2 Diabetes · Alzheimer's disease · Hepatocellular carcinoma"
            className="brand-focus w-full rounded-xl border border-[#E7E7F3] bg-white px-4 py-3 text-[14px] text-[#111827]"
          />
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!user ? (
          <button data-testid="assistant-signin" onClick={() => openModal("signin")}
                  className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-6 py-3 text-[14px] font-bold text-white hover:bg-[#4127c9]">
            Sign in to run<ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button data-testid="assistant-start" onClick={onStart} disabled={!canStart || !eligible.eligible}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-6 py-3 text-[14px] font-bold text-white shadow-[0_14px_36px_-10px_rgba(81,57,237,0.7)] transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0">
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {starting ? "Starting…" : "Launch AI Assistant"}
          </button>
        )}
        {eligible && !eligible.eligible && !eligible.is_admin && (
          <span className="text-[12px] text-[#6B7280]">Additional runs will be enabled via subscription plans soon.</span>
        )}
      </div>

      {/* Progress */}
      {run && (
        <div data-testid="assistant-progress" className="mt-8 rounded-3xl border border-[#E7E7F3] bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-headline text-[16px] font-extrabold text-[#111827]">
                {run.plant_name} × {run.disease_name}
              </p>
              <p className="text-[12px] text-[#6B7280]">Run · {run.id?.slice(0, 12)} · {run.status}</p>
            </div>
            <div className="text-right">
              <p className="font-headline text-[22px] font-extrabold text-[#5139ED]">{run.progress || 0}%</p>
            </div>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#F1F1FA]">
            <motion.div
              className="h-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED]"
              initial={{ width: 0 }} animate={{ width: `${run.progress || 0}%` }} transition={{ duration: 0.6 }}
            />
          </div>

          <ol className="mt-5 space-y-2 text-[13px]">
            {(run.stages || []).map((s, i) => (
              <li key={i} data-testid={`assistant-stage-${s.key}`} className="flex items-center gap-2">
                <StageIcon status={s.status} />
                <span className={s.status === "failed" ? "text-red-600" : "text-[#0B0B18]"}>{s.label}</span>
                {s.extra && <span className="text-[11px] text-[#6B7280]">
                  {Object.entries(s.extra).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                </span>}
                {s.error && <span className="text-[11px] text-red-600">— {s.error}</span>}
              </li>
            ))}
          </ol>

          {run.status === "done" && (
            <div data-testid="assistant-done" className="mt-6 rounded-2xl border border-[#2BB673]/30 bg-[#2BB673]/5 p-5">
              <p className="font-headline text-[16px] font-extrabold text-[#0B0B18]">Report ready</p>
              <p className="mt-1 text-[12px] text-[#374151]">
                Publication manuscript generated. Download in your preferred format.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["md", "html", "pdf", "docx"].map((f) => (
                  <a key={f} data-testid={`assistant-dl-${f}`} href={assistantReportURL(run.id, f)}
                     className="inline-flex items-center gap-1.5 rounded-full bg-[#5139ED] px-4 py-2 text-[12px] font-bold text-white hover:bg-[#4127c9]">
                    <Download className="h-3.5 w-3.5" /> {f.toUpperCase()}
                  </a>
                ))}
              </div>
              {run.report_markdown_preview && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-[12px] font-semibold text-[#5139ED]">Preview manuscript</summary>
                  <pre data-testid="assistant-preview" className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-[#E7E7F3] bg-[#FAFAFF] p-3 font-mono text-[11px] text-[#0B0B18]">{run.report_markdown_preview}</pre>
                </details>
              )}
            </div>
          )}
          {run.status === "failed" && (
            <div data-testid="assistant-failed" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">
              Run failed: {run.error || "Unknown error"}
            </div>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { n: "1", t: "You enter", d: "Plant + Disease. That's it." },
          { n: "2", t: "AI orchestrates", d: "Extract → ADMET → Targets → Intersect → PPI → GO/KEGG → Report." },
          { n: "3", t: "You download", d: "Publication-ready MD/HTML/PDF/DOCX." },
        ].map((s) => (
          <div key={s.n} className="rounded-2xl border border-[#E7E7F3] bg-white p-5">
            <span className="font-headline text-[32px] text-transparent" style={{ WebkitTextStroke: "1.2px #5139ED" }}>{s.n}</span>
            <p className="font-headline mt-2 text-[15px] font-extrabold text-[#0B0B18]">{s.t}</p>
            <p className="mt-1 text-[12px] text-[#6B7280]">{s.d}</p>
          </div>
        ))}
      </div>
    </main>
  );
}

function StageIcon({ status }) {
  if (status === "done")    return <span className="grid h-4 w-4 place-items-center rounded-full bg-[#2BB673] text-white"><Check className="h-2.5 w-2.5" strokeWidth={4} /></span>;
  if (status === "failed")  return <span className="grid h-4 w-4 place-items-center rounded-full bg-red-500 text-white"><X className="h-2.5 w-2.5" strokeWidth={4} /></span>;
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-[#5139ED]" />;
  if (status === "skipped") return <span className="grid h-4 w-4 place-items-center rounded-full bg-[#F1F1FA] text-[#6B7280] text-[10px]">–</span>;
  return <span className="h-4 w-4 rounded-full border border-[#E7E7F3]" />;
}
