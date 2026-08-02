// DockingValidationPanel — self-docking sanity check for the current
// molecular-docking protocol.
//
// Given a PDB ID, the backend fetches the structure, extracts the
// co-crystallised ligand, redocks it into the same receptor with Vina, and
// computes symmetry-aware heavy-atom RMSD against the crystal pose.
//
// Result badge:
//   • RMSD < 2.0 Å  → EXCELLENT (green)  — protocol validated
//   • 2.0 - 3.0 Å   → ACCEPTABLE (amber)
//   • > 3.0 Å       → POOR (red) — tune box or exhaustiveness
//
// Frontend-only wrapper around POST /api/docking/validate.

import { useState } from "react";
import { Loader2, ShieldCheck, Info, ExternalLink, Play, Layers3, Rows3, CheckCircle2, AlertTriangle, XCircle, Sparkles } from "lucide-react";
import { runDockingValidation, runDockingValidationBatch } from "@/lib/api";
import { toast } from "sonner";
import PoseOverlayViewer from "@/components/docking/PoseOverlayViewer";

const EXAMPLE_PDBS = [
  { id: "1STP", label: "Streptavidin · Biotin",       hint: "16-atom ligand · <60s" },
  { id: "3ERT", label: "Estrogen R. · 4-OH-tamoxifen", hint: "27-atom ligand · ~2 min" },
  { id: "1AQ1", label: "CDK2 · Staurosporine",         hint: "35-atom ligand · ~2-3 min" },
];

const STATUS_STYLE = {
  excellent:  { bg: "bg-emerald-50",  ring: "ring-emerald-500/25", dot: "bg-emerald-500",  text: "text-emerald-800",  label: "Excellent" },
  acceptable: { bg: "bg-amber-50",    ring: "ring-amber-500/25",   dot: "bg-amber-500",    text: "text-amber-800",    label: "Acceptable" },
  poor:       { bg: "bg-rose-50",     ring: "ring-rose-500/25",    dot: "bg-rose-500",     text: "text-rose-800",     label: "Poor fit" },
  error:      { bg: "bg-slate-50",    ring: "ring-slate-400/25",   dot: "bg-slate-500",    text: "text-slate-700",    label: "Error" },
};

export default function DockingValidationPanel() {
  // ── Single-PDB validation state ─────────────────────────────
  const [pdbId, setPdbId] = useState("1STP");
  const [resname, setResname] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  // ── Overlay modal state ─────────────────────────────────────
  const [overlayFor, setOverlayFor] = useState(null);  // { jobId, pairId, meta }

  // ── Batch benchmark state ───────────────────────────────────
  const [batchList, setBatchList] = useState("1STP\n3ERT\n1AQ1");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResult, setBatchResult] = useState(null);

  const run = async () => {
    const id = pdbId.trim().toUpperCase();
    if (!/^[0-9A-Z]{4}$/.test(id)) {
      toast.error("Enter a 4-character PDB ID (e.g. 1STP)");
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const r = await runDockingValidation({
        pdb_id: id,
        ligand_resname: resname.trim() || null,
        exhaustiveness: 8,
      });
      setResult(r);
      if (r.validation_status === "excellent") {
        toast.success(`Protocol validated — RMSD ${r.rmsd_angstrom} Å`);
      } else if (r.validation_status === "error") {
        toast.error(r.notes || "Validation failed");
      } else {
        toast.message(`Validation ${r.validation_status} — RMSD ${r.rmsd_angstrom} Å`);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Validation request failed");
    } finally {
      setRunning(false);
    }
  };

  const style = result ? STATUS_STYLE[result.validation_status] || STATUS_STYLE.error : null;

  const runBatch = async () => {
    // Split on newlines / commas / whitespace, keep unique 4-char PDB ids.
    const ids = Array.from(new Set(
      batchList
        .split(/[\s,;]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[0-9A-Z]{4}$/.test(s))
    ));
    if (ids.length === 0) {
      toast.error("Enter at least one 4-character PDB id (space or comma separated).");
      return;
    }
    if (ids.length > 12) {
      toast.error("Batch limit is 12 PDBs per run.");
      return;
    }
    setBatchRunning(true);
    setBatchResult(null);
    try {
      const r = await runDockingValidationBatch({ pdb_ids: ids, exhaustiveness: 8 });
      setBatchResult(r);
      const s = r.summary || {};
      toast.success(
        `Batch complete — ${s.excellent}/${s.total} excellent (${s.success_rate_pct}% success)`,
        { duration: 8000 },
      );
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Batch validation failed.");
    } finally {
      setBatchRunning(false);
    }
  };

  return (
    <section
      data-testid="docking-validation-panel"
      className="mt-8 overflow-hidden rounded-3xl border border-[#E7E7F3] bg-white shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#F1F1FA] bg-gradient-to-b from-[#F5F5FC] to-white px-6 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED] text-white shadow-[0_8px_24px_-6px_rgba(81,57,237,0.5)]">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">Protocol Validation</p>
              <h3 className="font-display text-xl font-bold tracking-tight text-[#0B0B18]">Redocking + RMSD</h3>
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#4B5563]">
            Prove the docking protocol works on a receptor family by redocking a known co-crystal ligand and
            comparing the top pose to the crystal. Success threshold is <strong>&lt; 2.0 Å</strong> RMSD (Wang et al., <em>J Med Chem</em> 2003).
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 px-6 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[#5139ED]">PDB ID</span>
            <input
              data-testid="validate-pdb-id"
              type="text"
              maxLength={4}
              value={pdbId}
              onChange={(e) => setPdbId(e.target.value.toUpperCase())}
              disabled={running}
              placeholder="e.g. 1STP"
              className="mt-1 w-full rounded-xl border border-[#E7E7F3] bg-white px-3 py-2 font-mono text-[15px] font-semibold tracking-widest text-[#0B0B18] uppercase focus:border-[#5139ED]/40 focus:outline-none focus:ring-2 focus:ring-[#5139ED]/20"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[#5139ED]">Ligand residue <span className="normal-case text-[#94A3B8]">(optional)</span></span>
            <input
              data-testid="validate-resname"
              type="text"
              maxLength={5}
              value={resname}
              onChange={(e) => setResname(e.target.value.toUpperCase())}
              disabled={running}
              placeholder="Auto-detect"
              className="mt-1 w-full rounded-xl border border-[#E7E7F3] bg-white px-3 py-2 font-mono text-[15px] font-semibold tracking-widest text-[#0B0B18] uppercase focus:border-[#5139ED]/40 focus:outline-none focus:ring-2 focus:ring-[#5139ED]/20"
            />
          </label>
        </div>

        <button
          data-testid="validate-run"
          onClick={run}
          disabled={running || !pdbId.trim()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-6 text-sm font-semibold text-white shadow-[0_10px_28px_-8px_rgba(81,57,237,0.55)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? "Redocking…" : "Run validation"}
        </button>
      </div>

      {/* Example presets */}
      <div className="border-t border-[#F1F1FA] bg-[#FBFBFF] px-6 py-4">
        <p className="text-[10.5px] font-semibold uppercase tracking-widest text-[#94A3B8]">Try a benchmark case</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLE_PDBS.map((e) => (
            <button
              key={e.id}
              data-testid={`validate-example-${e.id}`}
              onClick={() => { setPdbId(e.id); setResname(""); }}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E7E7F3] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED] disabled:opacity-50"
            >
              <span className="font-mono">{e.id}</span>
              <span className="text-[#64748B]">·</span>
              <span>{e.label}</span>
              <span className="text-[11px] text-[#94A3B8]">{e.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Result card */}
      {result && (
        <div
          data-testid="validate-result"
          data-status={result.validation_status}
          className={`m-6 rounded-2xl ${style.bg} ${style.text} ring-1 ${style.ring} p-5`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${style.dot}`} />
                <span className="text-[10.5px] font-bold uppercase tracking-widest">
                  {style.label}
                </span>
                {result.pdb_id && (
                  <a
                    href={`https://www.rcsb.org/structure/${result.pdb_id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="ml-1 inline-flex items-center gap-1 rounded-full border border-current/30 px-2 py-0.5 text-[10.5px] font-semibold hover:opacity-80"
                  >
                    {result.pdb_id} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-baseline gap-6">
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-widest opacity-70">RMSD</p>
                  <p className="mt-0.5 font-display text-3xl font-bold" data-testid="validate-rmsd">
                    {result.rmsd_angstrom !== null ? `${result.rmsd_angstrom} Å` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-widest opacity-70">Redocked affinity</p>
                  <p className="mt-0.5 font-display text-xl font-bold" data-testid="validate-affinity">
                    {result.redocked_affinity ? `${result.redocked_affinity.toFixed(2)} kcal/mol` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-widest opacity-70">Native ligand</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold">
                    {result.ligand_resname}{" "}
                    <span className="opacity-70">({result.ligand_heavy_atoms} heavy)</span>
                  </p>
                </div>
              </div>

              {result.ligand_smiles && (
                <p className="mt-3 break-all font-mono text-[11.5px] opacity-80">
                  <span className="opacity-70">SMILES:</span> {result.ligand_smiles}
                </p>
              )}
            </div>
          </div>

          <p className="mt-4 flex items-start gap-2 border-t border-current/15 pt-3 text-[12.5px] leading-relaxed">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
            <span>{result.notes}</span>
          </p>

          {/* Pose overlay CTA — only when Vina completed and we have PDBs */}
          {result.job_id && result.pair_id && result.validation_status !== "error" && (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-current/15 pt-3">
              <button
                data-testid="validate-view-overlay"
                onClick={() => setOverlayFor({
                  jobId: result.job_id,
                  pairId: result.pair_id,
                  meta: {
                    pdb_id: result.pdb_id,
                    ligand_resname: result.ligand_resname,
                    rmsd_angstrom: result.rmsd_angstrom,
                  },
                })}
                className="inline-flex items-center gap-2 rounded-full bg-[#0B0B18] px-4 py-2 text-[12.5px] font-semibold text-white shadow-sm transition hover:brightness-125"
              >
                <Layers3 className="h-4 w-4" />
                View 3D pose overlay
              </button>
              <p className="text-[11.5px] opacity-80">Crystal pose in <strong>emerald</strong>, redocked pose in <strong>violet</strong>.</p>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────── Batch benchmark section ─────────────────── */}
      <BatchBenchmark
        list={batchList}
        setList={setBatchList}
        running={batchRunning}
        result={batchResult}
        onRun={runBatch}
        onOpenOverlay={(row) => setOverlayFor({
          jobId: row.job_id,
          pairId: row.pair_id,
          meta: { pdb_id: row.pdb_id, ligand_resname: row.ligand_resname, rmsd_angstrom: row.rmsd_angstrom },
        })}
      />

      {/* Overlay modal — mounted once, driven by overlayFor state */}
      <PoseOverlayViewer
        open={!!overlayFor}
        jobId={overlayFor?.jobId}
        pairId={overlayFor?.pairId}
        meta={overlayFor?.meta}
        onClose={() => setOverlayFor(null)}
      />
    </section>
  );
}


/* ─────────────────── BatchBenchmark subcomponent ─────────────────── */
function BatchBenchmark({ list, setList, running, result, onRun, onOpenOverlay }) {
  const s = result?.summary;

  const applyPreset = (name) => {
    if (name === "kinases")     setList("1AQ1\n3ERT\n1STP");                        // small mixed set
    else if (name === "gpcrs")  setList("3ODU\n4EIY\n4XT1");                        // GPCR benchmark
    else if (name === "peptidases") setList("1HSG\n1DWD\n1STP");                    // hydrolase / peptidase
    else if (name === "dude")   setList("1STP\n3ERT\n1AQ1\n1HSG");                  // mini DUD-E-style suite
  };

  return (
    <div
      data-testid="validate-batch"
      className="border-t border-[#F1F1FA] bg-white px-6 py-6"
    >
      <div className="flex items-start gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-2xl bg-[#0B0B18] text-white">
          <Rows3 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#0B0B18]">Batch Benchmark</p>
          <h4 className="mt-0.5 font-display text-base font-bold tracking-tight text-[#0B0B18]">
            Validate up to 12 PDBs at once
          </h4>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[#4B5563]">
            Enter one PDB id per line (or space / comma separated). Each is redocked and scored;
            the aggregate success rate can be copied straight into your AI report.
          </p>
        </div>
      </div>

      {/* Preset chips */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="text-[10.5px] font-semibold uppercase tracking-widest text-[#94A3B8]">Preset suite:</span>
        {[
          { key: "kinases",    label: "Kinases & receptors" },
          { key: "peptidases", label: "Peptidases & hydrolases" },
          { key: "dude",       label: "Mini DUD-E (4 PDBs)" },
        ].map((p) => (
          <button
            key={p.key}
            data-testid={`validate-batch-preset-${p.key}`}
            onClick={() => applyPreset(p.key)}
            disabled={running}
            className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-2.5 py-1 font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED] disabled:opacity-50"
          >
            <Sparkles className="h-3 w-3" />{p.label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#5139ED]">PDB IDs</span>
          <textarea
            data-testid="validate-batch-input"
            value={list}
            onChange={(e) => setList(e.target.value.toUpperCase())}
            disabled={running}
            rows={4}
            className="mt-1 w-full resize-y rounded-xl border border-[#E7E7F3] bg-white px-3 py-2 font-mono text-[13px] tracking-widest text-[#0B0B18] uppercase focus:border-[#5139ED]/40 focus:outline-none focus:ring-2 focus:ring-[#5139ED]/20"
          />
        </label>
        <button
          data-testid="validate-batch-run"
          onClick={onRun}
          disabled={running || !list.trim()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0B0B18] px-6 text-sm font-semibold text-white shadow-sm transition hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rows3 className="h-4 w-4" />}
          {running ? "Benchmarking…" : "Run batch benchmark"}
        </button>
      </div>

      {running && (
        <p className="mt-3 flex items-start gap-2 text-[12px] text-[#64748B]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#5139ED]" />
          Each PDB is redocked sequentially — small ligands take ~30-60&nbsp;s, large ones several minutes. Keep this tab open.
        </p>
      )}

      {/* Aggregate summary card */}
      {s && (
        <div
          data-testid="validate-batch-summary"
          className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center"
        >
          <SuccessRateRing pct={s.success_rate_pct} label={`${s.excellent}/${s.total} excellent`} />

          <div className="rounded-2xl border border-[#E7E7F3] bg-[#FBFBFF] p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryStat icon={CheckCircle2}  color="text-emerald-600" label="Excellent"  n={s.excellent}  />
              <SummaryStat icon={AlertTriangle} color="text-amber-600"   label="Acceptable" n={s.acceptable} />
              <SummaryStat icon={XCircle}       color="text-rose-600"    label="Poor"       n={s.poor}       />
              <SummaryStat icon={Info}          color="text-slate-500"   label="Errors"     n={s.error}      />
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-[#374151]">
              <span className="font-semibold text-[#0B0B18]">Mean RMSD:</span>{" "}
              {s.mean_rmsd_angstrom !== null ? `${s.mean_rmsd_angstrom} Å` : "—"}
              <span className="mx-2 text-[#CBD5E1]">·</span>
              <span className="font-semibold text-[#0B0B18]">Verdict:</span> {s.verdict}
            </p>
          </div>
        </div>
      )}

      {/* Per-PDB row table */}
      {result?.results?.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-[#E7E7F3]">
          <table className="w-full text-sm">
            <thead className="bg-[#F5F5FC] text-[10.5px] font-bold uppercase tracking-widest text-[#5139ED]">
              <tr>
                <th className="px-3 py-2 text-left">PDB</th>
                <th className="px-3 py-2 text-left">Ligand</th>
                <th className="px-3 py-2 text-right">RMSD (Å)</th>
                <th className="px-3 py-2 text-right">Affinity</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {result.results.map((r, i) => {
                const st = STATUS_STYLE[r.validation_status] || STATUS_STYLE.error;
                return (
                  <tr key={r.pdb_id + i} className="border-t border-[#F1F1FA] text-[13px] text-[#0B0B18]">
                    <td className="px-3 py-2 font-mono font-semibold">
                      <a
                        href={`https://www.rcsb.org/structure/${r.pdb_id}`}
                        target="_blank" rel="noopener noreferrer"
                        className="hover:text-[#5139ED] hover:underline"
                      >{r.pdb_id}</a>
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {r.ligand_resname}{" "}
                      <span className="text-[11px] text-[#94A3B8]">({r.ligand_heavy_atoms} heavy)</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {r.rmsd_angstrom !== null ? r.rmsd_angstrom.toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {r.redocked_affinity ? r.redocked_affinity.toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.bg} ${st.text} ring-1 ${st.ring}`}>
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.job_id && r.pair_id && r.validation_status !== "error" ? (
                        <button
                          data-testid={`validate-batch-overlay-${r.pdb_id}`}
                          onClick={() => onOpenOverlay(r)}
                          className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
                        >
                          <Layers3 className="h-3 w-3" /> Overlay
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#94A3B8]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* Success-rate ring — pure SVG so we don't add another dep. */
function SuccessRateRing({ pct, label }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const stroke = 10;
  const size = 132;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (p / 100) * circ;
  const tone = p >= 80 ? "#059669" : p >= 50 ? "#B45309" : "#B91C1C";
  return (
    <div className="flex flex-col items-center rounded-2xl border border-[#E7E7F3] bg-white p-4">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F1F1FA" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        />
      </svg>
      <div className="-mt-[86px] flex flex-col items-center">
        <span className="font-display text-2xl font-bold text-[#0B0B18]">{p}%</span>
        <span className="text-[10.5px] font-bold uppercase tracking-widest text-[#64748B]">Success rate</span>
      </div>
      <p className="mt-8 text-[11.5px] font-semibold text-[#0B0B18]">{label}</p>
    </div>
  );
}

function SummaryStat({ icon: Icon, color, label, n }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[#E7E7F3] bg-white px-3 py-2">
      <Icon className={`h-4 w-4 ${color}`} />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#94A3B8]">{label}</p>
        <p className="font-display text-lg font-bold text-[#0B0B18]">{n ?? 0}</p>
      </div>
    </div>
  );
}
