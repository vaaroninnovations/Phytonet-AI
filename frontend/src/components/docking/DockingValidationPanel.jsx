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
import { Loader2, ShieldCheck, Info, ExternalLink, Play } from "lucide-react";
import { runDockingValidation } from "@/lib/api";
import { toast } from "sonner";

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
  const [pdbId, setPdbId] = useState("1STP");
  const [resname, setResname] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

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
        </div>
      )}
    </section>
  );
}
