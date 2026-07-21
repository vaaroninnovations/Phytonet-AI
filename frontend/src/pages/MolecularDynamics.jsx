// Molecular Dynamics — GROMACS project generator (setup-only) · Step 7.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import WorkflowLayout from "@/components/WorkflowLayout";
import { useNetwork } from "@/context/NetworkContext";
import { useResults } from "@/context/ResultsContext";
import { useWorkflow } from "@/context/WorkflowContext";
import { mdEstimate, mdBuild, listMDEngines } from "@/lib/api";
import { toast } from "sonner";
import { saveAs } from "file-saver";
import { HelpTip } from "@/components/network/HelpTip";
import { requireAuth } from "@/context/AuthContext";
import { ArrowLeft, ArrowRight, Atom, Download, Loader2, Server } from "lucide-react";

const FF_OPTS = [
  { key: "amber99sb-ildn", label: "AMBER99SB-ILDN" },
  { key: "amber14sb", label: "AMBER14SB" },
  { key: "charmm36-jul2022", label: "CHARMM36 (Jul 2022)" },
  { key: "gromos54a7", label: "GROMOS54A7" },
  { key: "oplsaa", label: "OPLS-AA/L" },
];
const WATER_OPTS = [
  { key: "tip3p", label: "TIP3P" },
  { key: "tip4p", label: "TIP4P" },
  { key: "spc", label: "SPC" },
  { key: "spce", label: "SPC/E" },
];
const BOX_OPTS = [
  { key: "dodecahedron", label: "Dodecahedron (recommended)" },
  { key: "cubic", label: "Cubic" },
  { key: "octahedron", label: "Truncated Octahedron" },
];

export default function MolecularDynamics() {
  const { compoundTargets, diseaseTargets, selectedCompounds, dockingResults, setMdConfig } = useNetwork();
  const { compounds: allCompounds } = useResults();
  const { markComplete } = useWorkflow();

  // Only successfully docked compound×target pairs are eligible for MD.
  // If docking has been run, restrict compound/target options to those pairs;
  // if docking has NOT been run, we render a blocked empty-state below.
  const dockedPairs = useMemo(() => {
    const rr = dockingResults?.results || [];
    return rr
      .filter((r) => !r.error && typeof r.best_affinity === "number")
      .map((r) => ({
        ligand_name: r.ligand_name,
        smiles: r.ligand_smiles,
        uniprot_id: r.receptor_uniprot,
        gene_symbol: r.gene_symbol,
        pdb_id: r.receptor_pdb,
        best_affinity: r.best_affinity,
        pair_id: r.pair_id,
        job_id: r.job_id,
      }));
  }, [dockingResults]);

  const hasDocking = dockedPairs.length > 0;

  // Merge target metadata — restricted to docked receptors when docking exists
  const targetOptions = useMemo(() => {
    if (hasDocking) {
      const idx = new Map();
      for (const p of dockedPairs) {
        const key = p.gene_symbol || p.uniprot_id;
        if (!key || idx.has(key)) continue;
        idx.set(key, {
          gene_symbol: p.gene_symbol || key,
          uniprot_id: p.uniprot_id,
          protein_name: undefined,
          pdb_id: p.pdb_id,
        });
      }
      // Enrich with protein_name if available from Target/Disease tables
      for (const r of [...compoundTargets, ...diseaseTargets]) {
        const t = idx.get(r.gene_symbol);
        if (t && !t.protein_name && r.protein_name) t.protein_name = r.protein_name;
      }
      return [...idx.values()];
    }
    const idx = new Map();
    for (const r of [...compoundTargets, ...diseaseTargets]) {
      const g = r.gene_symbol;
      if (!g) continue;
      if (!idx.has(g)) idx.set(g, { gene_symbol: g, uniprot_id: r.uniprot_id, protein_name: r.protein_name });
      else if (!idx.get(g).uniprot_id && r.uniprot_id) idx.get(g).uniprot_id = r.uniprot_id;
    }
    return [...idx.values()];
  }, [hasDocking, dockedPairs, compoundTargets, diseaseTargets]);

  const compoundOptions = useMemo(() => {
    if (hasDocking) {
      const seen = new Set();
      const out = [];
      for (const p of dockedPairs) {
        if (!p.ligand_name || seen.has(p.ligand_name)) continue;
        seen.add(p.ligand_name);
        out.push({ name: p.ligand_name, smiles: p.smiles });
      }
      return out;
    }
    const seen = new Set();
    const out = [];
    for (const c of [...(selectedCompounds || []), ...(allCompounds || [])]) {
      const k = c.imppat_id || c.compound_name;
      if (!k || seen.has(k) || !c.smiles) continue;
      seen.add(k);
      out.push({ name: c.compound_name || c.imppat_id || "Compound", smiles: c.smiles });
    }
    return out;
  }, [hasDocking, dockedPairs, selectedCompounds, allCompounds]);

  const [compIdx, setCompIdx] = useState(0);
  const [tgtIdx, setTgtIdx] = useState(0);
  const [pdbId, setPdbId] = useState("");
  const [cfg, setCfg] = useState({
    force_field: "amber99sb-ildn", water_model: "tip3p", box_type: "dodecahedron",
    box_padding_nm: 1.0, ion_concentration: 0.15, positive_ion: "NA", negative_ion: "CL",
    temperature_K: 300, pressure_bar: 1.0,
    em_steps: 50000, nvt_ps: 100, npt_ps: 100, production_ns: 100, dt_fs: 2.0,
  });
  const [building, setBuilding] = useState(false);
  const [estimate, setEstimate] = useState(null);

  // Auto-select the best-affinity compound×target pair when docking data arrives.
  // (Only fires once per docking session — resets if user manually changes.)
  useEffect(() => {
    if (!hasDocking) return;
    const best = [...dockedPairs].sort((a, b) => a.best_affinity - b.best_affinity)[0];
    if (!best) return;
    const ci = compoundOptions.findIndex((c) => c.name === best.ligand_name);
    const ti = targetOptions.findIndex((t) =>
      (t.gene_symbol && t.gene_symbol === best.gene_symbol) ||
      (t.uniprot_id && t.uniprot_id === best.uniprot_id));
    if (ci >= 0) setCompIdx(ci);
    if (ti >= 0) setTgtIdx(ti);
    if (best.pdb_id) setPdbId(best.pdb_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDocking, dockedPairs.length]);

  // ── Execution Engine state ─────────────────────────────────────
  const [engines, setEngines] = useState([]);
  const [engineKey, setEngineKey] = useState("local");
  const [engineOptions, setEngineOptions] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const { engines } = await listMDEngines();
        setEngines(engines || []);
        // Initialize default options for the active engine
        const first = (engines || []).find((e) => e.key === "local") || (engines || [])[0];
        if (first) {
          setEngineKey(first.key);
          const opts = {};
          (first.options || []).forEach((o) => { opts[o.key] = o.default; });
          setEngineOptions(opts);
        }
      } catch (e) { console.debug("mdEngines fetch failed:", e); }
    })();
  }, []);

  const activeEngine = useMemo(() => engines.find((e) => e.key === engineKey), [engines, engineKey]);

  useEffect(() => {
    if (!activeEngine) return;
    const opts = {};
    (activeEngine.options || []).forEach((o) => { opts[o.key] = o.default; });
    setEngineOptions(opts);
  }, [engineKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  const updEngineOpt = (k) => (e) => {
    const raw = e.target.type === "checkbox" ? e.target.checked
              : e.target.type === "number" ? Number(e.target.value)
              : e.target.value;
    setEngineOptions((o) => ({ ...o, [k]: raw }));
  };

  useEffect(() => {
    (async () => {
      try { const est = await mdEstimate(cfg); setEstimate(est); } catch (e) { console.debug("mdEstimate failed:", e); }
    })();
  }, [cfg]);

  const build = async () => {
    if (compoundOptions.length === 0 || targetOptions.length === 0)
      return toast.error("Need at least one compound and one target");
    requireAuth(async () => {
      setBuilding(true);
      try {
        const payload = {
          compound: compoundOptions[compIdx],
          target: {
            uniprot_id: targetOptions[tgtIdx].uniprot_id,
            gene_symbol: targetOptions[tgtIdx].gene_symbol,
            pdb_id: pdbId || undefined,
          },
          config: cfg,
          engine: engineKey,
          engine_options: engineOptions,
        };
        const blob = await mdBuild(payload);
        const filename = `md_${compoundOptions[compIdx].name}_x_${targetOptions[tgtIdx].gene_symbol || ""}.zip`.replace(/[^A-Za-z0-9_.-]/g, "_");
        saveAs(blob, filename);
        markComplete("molecular-dynamics");
        setMdConfig(cfg);
        toast.success("MD project downloaded");
      } catch (e) { toast.error("MD build failed: " + (e.message || e)); }
      finally { setBuilding(false); }
    });
  };

  const upd = (k) => (e) => setCfg((c) => ({ ...c, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value }));

  // Enforce workflow contract: MD requires successful docking results.
  if (!hasDocking) {
    return (
      <WorkflowLayout>
        <main data-testid="md-blocked-no-docking" className="mx-auto max-w-3xl px-6 pb-24 pt-14 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#5139ED]/10 text-[#5139ED]"><Atom className="h-6 w-6" /></div>
          <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-[#0B0B18]">Docking required</h1>
          <p className="mt-3 text-[#64748B]">
            Molecular Dynamics runs on successfully-docked compound × target complexes. Run docking first
            — the best-affinity pair will be pre-selected here automatically.
          </p>
          <Link to="/molecular-docking" data-testid="md-blocked-goto-docking"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-6 py-3 text-sm font-semibold text-white hover:bg-[#4127c9]">
            <ArrowLeft className="h-4 w-4" />Go to Molecular Docking
          </Link>
        </main>
      </WorkflowLayout>
    );
  }

  const noInputs = compoundOptions.length === 0 || targetOptions.length === 0;
  if (noInputs) {
    return (
      <WorkflowLayout>
        <main data-testid="md-empty" className="mx-auto max-w-3xl px-6 pb-24 pt-14 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#5139ED]/10 text-[#5139ED]"><Atom className="h-6 w-6" /></div>
          <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-[#0B0B18]">Molecular Dynamics</h1>
          <p className="mt-3 text-[#64748B]">Complete Docking (or earlier steps) first to seed compounds and targets.</p>
          <Link to="/molecular-docking" className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-6 py-3 text-sm font-semibold text-white hover:bg-[#4127c9]"><ArrowLeft className="h-4 w-4" />Go to Molecular Docking</Link>
        </main>
      </WorkflowLayout>
    );
  }

  return (
    <WorkflowLayout>
      <main data-testid="molecular-dynamics-page" className="mx-auto max-w-7xl px-6 pb-24 pt-14">
        <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Module · 07 · Setup-only</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#0B0B18] sm:text-5xl">Molecular Dynamics</h1>
        <p className="mt-3 max-w-3xl text-[#64748B]">
          Generate a complete, downloadable GROMACS MD project (topology, MDP, run scripts, prep report) for a
          protein–ligand complex. Simulations run on your workstation / HPC cluster / cloud GPU — the platform
          only prepares the inputs.
        </p>

        {/* Selection */}
        <div data-testid="md-selection" className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-[#E7E7F3] bg-white p-5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Compound<HelpTip text="Ligand — SMILES will be shipped with the project; user runs ACPYPE for GAFF params." /></label>
            <select data-testid="md-compound" value={compIdx} onChange={(e) => setCompIdx(Number(e.target.value))} className="brand-focus mt-1 w-full rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm text-[#0B0B18]">
              {compoundOptions.map((c, i) => <option key={c.name} value={i}>{c.name}</option>)}
            </select>
            <p className="mt-2 font-mono text-[10px] text-[#64748B]">SMILES: {compoundOptions[compIdx]?.smiles}</p>
          </div>
          <div className="rounded-3xl border border-[#E7E7F3] bg-white p-5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Target<HelpTip text="Protein target — receptor PDB will be auto-fetched from RCSB." /></label>
            <select data-testid="md-target" value={tgtIdx} onChange={(e) => setTgtIdx(Number(e.target.value))} className="brand-focus mt-1 w-full rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm text-[#0B0B18]">
              {targetOptions.map((t, i) => <option key={t.gene_symbol} value={i}>{t.gene_symbol} · {t.uniprot_id}</option>)}
            </select>
            <div className="mt-3">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">PDB ID (optional override)<HelpTip text="Leave blank to auto-fetch by UniProt." /></label>
              <input data-testid="md-pdb-id" value={pdbId} onChange={(e) => setPdbId(e.target.value.toUpperCase())} placeholder="e.g. 1EQG" className="brand-focus mt-1 w-full rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm text-[#0B0B18]" />
            </div>
          </div>
        </div>

        {/* Config */}
        <div data-testid="md-config" className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5">
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">System · Force field · Water · Ions</p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4">
            <Field label="Force field" tip="Protein force field. AMBER99SB-ILDN is the standard for globular proteins."><select data-testid="md-ff" value={cfg.force_field} onChange={upd("force_field")} className="w-full rounded-lg border border-[#E7E7F3] bg-white px-2 py-1.5 text-sm">{FF_OPTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></Field>
            <Field label="Water model" tip="Explicit-solvent water model — must match the chosen force field."><select data-testid="md-water" value={cfg.water_model} onChange={upd("water_model")} className="w-full rounded-lg border border-[#E7E7F3] bg-white px-2 py-1.5 text-sm">{WATER_OPTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></Field>
            <Field label="Box type" tip="Periodic-boundary box shape."><select data-testid="md-box-type" value={cfg.box_type} onChange={upd("box_type")} className="w-full rounded-lg border border-[#E7E7F3] bg-white px-2 py-1.5 text-sm">{BOX_OPTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></Field>
            <Field label="Box padding (nm)" tip="Extra solvent around the solute."><input data-testid="md-padding" type="number" min={0.5} max={3} step={0.1} value={cfg.box_padding_nm} onChange={upd("box_padding_nm")} className="w-full rounded-lg border border-[#E7E7F3] bg-white px-2 py-1.5 text-sm" /></Field>
            <Field label="Ion conc. (M)" tip="NaCl concentration; ~0.15 M ≈ physiological."><input data-testid="md-ion" type="number" min={0} max={1} step={0.05} value={cfg.ion_concentration} onChange={upd("ion_concentration")} className="w-full rounded-lg border border-[#E7E7F3] bg-white px-2 py-1.5 text-sm" /></Field>
            <Field label="Temperature (K)" tip="Ensemble temperature."><input data-testid="md-temp" type="number" min={273} max={370} step={1} value={cfg.temperature_K} onChange={upd("temperature_K")} className="w-full rounded-lg border border-[#E7E7F3] bg-white px-2 py-1.5 text-sm" /></Field>
            <Field label="Pressure (bar)" tip="NPT ensemble pressure."><input data-testid="md-pressure" type="number" min={0.5} max={5} step={0.1} value={cfg.pressure_bar} onChange={upd("pressure_bar")} className="w-full rounded-lg border border-[#E7E7F3] bg-white px-2 py-1.5 text-sm" /></Field>
            <Field label="dt (fs)" tip="Integration time-step; 2 fs with LINCS is standard."><input data-testid="md-dt" type="number" min={0.5} max={4} step={0.5} value={cfg.dt_fs} onChange={upd("dt_fs")} className="w-full rounded-lg border border-[#E7E7F3] bg-white px-2 py-1.5 text-sm" /></Field>
          </div>

          <p className="mt-6 font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Simulation stages</p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <Field label="EM steps" tip="Steepest-descent minimisation."><input data-testid="md-em" type="number" min={1000} max={200000} step={1000} value={cfg.em_steps} onChange={upd("em_steps")} className="w-full rounded-lg border border-[#E7E7F3] bg-white px-2 py-1.5 text-sm" /></Field>
            <Field label="NVT (ps)" tip="Constant-volume equilibration."><input data-testid="md-nvt" type="number" min={20} max={2000} step={10} value={cfg.nvt_ps} onChange={upd("nvt_ps")} className="w-full rounded-lg border border-[#E7E7F3] bg-white px-2 py-1.5 text-sm" /></Field>
            <Field label="NPT (ps)" tip="Constant-pressure equilibration."><input data-testid="md-npt" type="number" min={20} max={2000} step={10} value={cfg.npt_ps} onChange={upd("npt_ps")} className="w-full rounded-lg border border-[#E7E7F3] bg-white px-2 py-1.5 text-sm" /></Field>
            <Field label="Production (ns)" tip="Total production trajectory length."><input data-testid="md-prod" type="number" min={1} max={5000} step={1} value={cfg.production_ns} onChange={upd("production_ns")} className="w-full rounded-lg border border-[#E7E7F3] bg-white px-2 py-1.5 text-sm" /></Field>
          </div>

          {estimate && (
            <div data-testid="md-estimate" className="mt-6 rounded-2xl border border-[#F1F1FA] bg-[#FAFAFF] p-4">
              <p className="font-heading text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Runtime estimate for {cfg.production_ns} ns (~{estimate.atoms_assumed} atoms assumed)</p>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-white p-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#64748B]">CPU-only (32 cores)</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-[#5139ED]">{estimate.cpu32.toFixed(0)} h</p>
                </div>
                <div className="rounded-lg bg-white p-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#64748B]">Modern GPU (RTX 3090 / A100)</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-[#5139ED]">{estimate.gpu.toFixed(0)} h</p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
            <button data-testid="md-build" onClick={build} disabled={building}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-6 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)] disabled:opacity-40">
              {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {building ? "Building project…" : "Generate & Download MD Project"}
            </button>
          </div>
        </div>

        {/* Execution Engine picker */}
        <div data-testid="md-engine" className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-[#5139ED]" />
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Execution Engine</p>
          </div>
          <p className="mt-2 text-sm text-[#64748B]">
            Choose where you plan to run this simulation. The generated project package will include
            environment-specific scripts (bash / SLURM / cloud spec).
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {engines.map((e) => (
              <button key={e.key} data-testid={`md-engine-${e.key}`} onClick={() => setEngineKey(e.key)}
                      className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
                        engineKey === e.key
                          ? "border-[#5139ED] bg-[#F5F3FE] shadow-[0_6px_20px_-10px_rgba(81,57,237,0.5)]"
                          : "border-[#E7E7F3] bg-white hover:border-[#5139ED]/40"
                      }`}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">{e.category}</span>
                <span className="mt-1 text-sm font-bold text-[#0B0B18]">{e.label}</span>
                <span className="mt-1 text-[11px] text-[#64748B]">{e.description}</span>
              </button>
            ))}
          </div>

          {activeEngine && activeEngine.options && activeEngine.options.length > 0 && (
            <div data-testid={`md-engine-options-${engineKey}`} className="mt-5">
              <p className="font-heading text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                {activeEngine.label} — options
              </p>
              <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {activeEngine.options.map((o) => (
                  <div key={o.key} className="flex flex-col gap-1">
                    <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                      {o.label}{o.help && <HelpTip text={o.help} />}
                    </label>
                    {o.type === "select" ? (
                      <select data-testid={`md-engine-opt-${o.key}`} value={engineOptions[o.key] ?? o.default}
                              onChange={updEngineOpt(o.key)}
                              className="w-full rounded-lg border border-[#E7E7F3] bg-white px-2 py-1.5 text-sm">
                        {(o.options || []).map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : o.type === "bool" ? (
                      <div className="flex items-center gap-2">
                        <input data-testid={`md-engine-opt-${o.key}`} type="checkbox"
                               checked={Boolean(engineOptions[o.key])} onChange={updEngineOpt(o.key)}
                               className="h-4 w-4 rounded border-[#E7E7F3]" />
                        <span className="text-xs text-[#0B0B18]">{engineOptions[o.key] ? "Enabled" : "Disabled"}</span>
                      </div>
                    ) : o.type === "number" ? (
                      <input data-testid={`md-engine-opt-${o.key}`} type="number"
                             min={o.min} max={o.max} step={o.step || 1}
                             value={engineOptions[o.key] ?? o.default}
                             onChange={updEngineOpt(o.key)}
                             className="w-full rounded-lg border border-[#E7E7F3] bg-white px-2 py-1.5 text-sm" />
                    ) : (
                      <input data-testid={`md-engine-opt-${o.key}`} type="text"
                             value={engineOptions[o.key] ?? o.default ?? ""}
                             onChange={updEngineOpt(o.key)}
                             className="w-full rounded-lg border border-[#E7E7F3] bg-white px-2 py-1.5 text-sm" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Contents preview */}
        <div data-testid="md-contents" className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5">
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Project contents</p>
          <ul className="mt-3 grid grid-cols-1 gap-1 text-sm text-[#0B0B18] md:grid-cols-2">
            <li>• <span className="font-mono text-xs">receptor.pdb</span> — cleaned receptor structure</li>
            <li>• <span className="font-mono text-xs">ligand.smi</span> — ligand SMILES (feed into ACPYPE)</li>
            <li>• <span className="font-mono text-xs">minim.mdp / ions.mdp</span> — energy minimisation</li>
            <li>• <span className="font-mono text-xs">nvt.mdp</span> — NVT equilibration</li>
            <li>• <span className="font-mono text-xs">npt.mdp</span> — NPT equilibration</li>
            <li>• <span className="font-mono text-xs">md.mdp</span> — production MD</li>
            <li>• <span className="font-mono text-xs">run_md.sh / run_md.ps1</span> — Bash + PowerShell drivers</li>
            <li>• <span className="font-mono text-xs">merge_topology.py</span> — protein + ligand topology merger</li>
            <li>• <span className="font-mono text-xs">commands.txt</span> — full copy-paste command list</li>
            <li>• <span className="font-mono text-xs">MD_PREPARATION_REPORT.md</span> — force field · water · box · runtime estimate</li>
            <li>• <span className="font-mono text-xs">PROJECT_MANIFEST.json</span> — machine-readable config record</li>
          </ul>
        </div>

        <div className="mt-6 flex justify-end">
          <Link data-testid="md-to-report" to="/scientific-report" className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9]">
            Generate AI Research Report<ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </WorkflowLayout>
  );
}

function Field({ label, tip, children }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
      <span className="flex items-center gap-1">{label}<HelpTip text={tip} /></span>
      {children}
    </label>
  );
}
