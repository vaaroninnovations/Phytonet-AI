// Molecular Dynamics — single-page scientific dashboard · Step 7
// -------------------------------------------------------------------
// Real GROMACS setup (backend generates .zip) + REAL trajectory analytics
// (parsed client-side from user-uploaded gmx output .xvg / .pdb / .gro / .edr).
// No placeholder data: every chart & statistic renders empty until a
// GROMACS output archive is dropped in.
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  ArrowLeft, ArrowRight, Atom, CheckCircle2, Circle, Cpu, Download,
  FileArchive, FileText, Loader2, PlayCircle, Server, Upload,
} from "lucide-react";
import MDViewer3D from "@/components/md/MDViewer3D";
import MDAnalysisCard from "@/components/md/MDAnalysisCard";
import { parseGromacsResultsZip } from "@/lib/gromacsZipParser";
import { buildMDReportPdf } from "@/lib/mdReportPdf";

const FF_OPTS = [
  { key: "amber99sb-ildn", label: "AMBER99SB-ILDN" },
  { key: "amber14sb", label: "AMBER14SB" },
  { key: "charmm36-jul2022", label: "CHARMM36 (Jul 2022)" },
  { key: "gromos54a7", label: "GROMOS54A7" },
  { key: "oplsaa", label: "OPLS-AA/L" },
];
const WATER_OPTS = [
  { key: "tip3p", label: "TIP3P" }, { key: "tip4p", label: "TIP4P" },
  { key: "spc", label: "SPC" }, { key: "spce", label: "SPC/E" },
];
const BOX_OPTS = [
  { key: "dodecahedron", label: "Dodecahedron (recommended)" },
  { key: "cubic", label: "Cubic" },
  { key: "octahedron", label: "Truncated Octahedron" },
];

// 8-stage MD pipeline ordered as GROMACS runs them.
const STAGES = [
  { key: "prep",    label: "Protein Preparation" },
  { key: "topol",   label: "Topology Generation" },
  { key: "solvate", label: "Solvation" },
  { key: "ions",    label: "Ion Addition" },
  { key: "em",      label: "Energy Minimization" },
  { key: "nvt",     label: "NVT Equilibration" },
  { key: "npt",     label: "NPT Equilibration" },
  { key: "prod",    label: "Production MD" },
];

export default function MolecularDynamics() {
  const { compoundTargets, diseaseTargets, selectedCompounds, dockingResults, setMdConfig, setDockingResults } = useNetwork();
  const { compounds: allCompounds } = useResults();
  const { markComplete } = useWorkflow();

  // ── Optional ?demo=1 seeding so the redesigned dashboard is browsable
  //    without running the full workflow. Idempotent — only fires once. ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") !== "1") return;
    if ((dockingResults?.results || []).length > 0) return;
    setDockingResults({
      job_id: "demo",
      results: [{
        ligand_name: "Withaferin A", ligand_smiles: "CC(=CCCC(C)(C1CC2C3(CCC4CC(=O)C=CC4(C3(CCC12C)C)C)C(=O)OC)O)C",
        receptor_uniprot: "P04637", gene_symbol: "TP53", receptor_pdb: "1TUP",
        best_affinity: -8.2, pair_id: "demo-1", job_id: "demo",
      }],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // ── Docking-pair discovery (MD only runs on docked complexes) ───────────
  const dockedPairs = useMemo(() => {
    const rr = dockingResults?.results || [];
    return rr
      .filter((r) => !r.error && typeof r.best_affinity === "number")
      .map((r) => ({
        ligand_name: r.ligand_name, smiles: r.ligand_smiles,
        uniprot_id: r.receptor_uniprot, gene_symbol: r.gene_symbol,
        pdb_id: r.receptor_pdb, best_affinity: r.best_affinity,
      }));
  }, [dockingResults]);
  const hasDocking = dockedPairs.length > 0;

  const targetOptions = useMemo(() => {
    if (hasDocking) {
      const idx = new Map();
      for (const p of dockedPairs) {
        const key = p.gene_symbol || p.uniprot_id;
        if (!key || idx.has(key)) continue;
        idx.set(key, { gene_symbol: p.gene_symbol || key, uniprot_id: p.uniprot_id, protein_name: undefined, pdb_id: p.pdb_id });
      }
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
      const seen = new Set(); const out = [];
      for (const p of dockedPairs) {
        if (!p.ligand_name || seen.has(p.ligand_name)) continue;
        seen.add(p.ligand_name); out.push({ name: p.ligand_name, smiles: p.smiles });
      }
      return out;
    }
    const seen = new Set(); const out = [];
    for (const c of [...(selectedCompounds || []), ...(allCompounds || [])]) {
      const k = c.imppat_id || c.compound_name;
      if (!k || seen.has(k) || !c.smiles) continue;
      seen.add(k); out.push({ name: c.compound_name || c.imppat_id || "Compound", smiles: c.smiles });
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

  // Auto-select best-affinity docked pair on first arrival of docking data.
  useEffect(() => {
    if (!hasDocking) return;
    const best = [...dockedPairs].sort((a, b) => a.best_affinity - b.best_affinity)[0];
    if (!best) return;
    const ci = compoundOptions.findIndex((c) => c.name === best.ligand_name);
    const ti = targetOptions.findIndex(
      (t) => (t.gene_symbol && t.gene_symbol === best.gene_symbol)
          || (t.uniprot_id && t.uniprot_id === best.uniprot_id));
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
        const { engines: es } = await listMDEngines();
        setEngines(es || []);
        const first = (es || []).find((e) => e.key === "local") || (es || [])[0];
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
  }, [engineKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const updEngineOpt = (k) => (e) => {
    const raw = e.target.type === "checkbox" ? e.target.checked
              : e.target.type === "number"   ? Number(e.target.value)
              : e.target.value;
    setEngineOptions((o) => ({ ...o, [k]: raw }));
  };

  useEffect(() => {
    (async () => {
      try { const est = await mdEstimate(cfg); setEstimate(est); } catch (e) { console.debug("mdEstimate failed:", e); }
    })();
  }, [cfg]);

  // ── Build & download the GROMACS project ─────────────────────────────
  const [buildResult, setBuildResult] = useState(null);
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
        setBuildResult({ filename, at: new Date().toISOString() });
        markComplete("molecular-dynamics");
        setMdConfig(cfg);
        toast.success("MD project downloaded");
      } catch (e) { toast.error("MD build failed: " + (e.message || e)); }
      finally { setBuilding(false); }
    });
  };
  const upd = (k) => (e) => setCfg((c) => ({ ...c, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value }));

  // ── Results ingestion (client-side XVG parse from user-uploaded ZIP) ───
  const [results, setResults] = useState(null);   // {rmsd, rmsf, rg, sasa, hbond, ...}
  const [finalPdb, setFinalPdb] = useState(null);
  const [mmpbsaText, setMmpbsaText] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const onUploadResults = async (fileList) => {
    const f = fileList?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const parsed = await parseGromacsResultsZip(f);
      setResults(parsed.results);
      if (parsed.files.final_pdb) setFinalPdb(parsed.files.final_pdb);
      if (parsed.files.mmpbsa) setMmpbsaText(parsed.files.mmpbsa);
      setUploadedFiles(parsed.filesList);
      const keys = Object.keys(parsed.results);
      toast.success(`Loaded ${keys.length} analysis file${keys.length === 1 ? "" : "s"} from ${f.name}`);
    } catch (e) {
      console.error(e);
      toast.error("Could not parse GROMACS ZIP: " + (e.message || e));
    } finally { setUploading(false); }
  };

  // ── Simulation Progress (derived, no fake data) ──────────────────────
  // A stage is "completed" only if we can prove it from uploaded data.
  const stageStatus = useMemo(() => {
    const status = Object.fromEntries(STAGES.map((s) => [s.key, "pending"]));
    if (!buildResult && !results) return status;
    if (buildResult) {
      // The setup ZIP explicitly prepares Prep → NPT stage files. Mark them
      // "ready" (not "completed" — that requires actual XVG evidence).
      ["prep", "topol", "solvate", "ions"].forEach((k) => { status[k] = "ready"; });
    }
    if (results) {
      if (results.energy)      status["em"]   = "completed";
      if (results.temperature) status["nvt"]  = "completed";
      if (results.density || results.pressure) status["npt"] = "completed";
      if (results.rmsd)        status["prod"] = "completed";
      // Inferred earlier stages
      if (Object.keys(results).length > 0) {
        ["prep", "topol", "solvate", "ions"].forEach((k) => {
          if (status[k] === "pending") status[k] = "completed";
        });
      }
    }
    return status;
  }, [buildResult, results]);

  const completedCount = Object.values(stageStatus).filter((s) => s === "completed").length;
  const totalStages = STAGES.length;
  const pctComplete = Math.round((completedCount / totalStages) * 100);
  const currentStage = STAGES.find((s) => stageStatus[s.key] === "ready" || stageStatus[s.key] === "pending")?.label || "All stages completed";
  const runStatusBadge = !buildResult && !results ? { text: "Not started", cls: "bg-[#F1F1FA] text-[#64748B]" }
                       : results && completedCount === totalStages ? { text: "Completed", cls: "bg-[#DCFCE7] text-[#166534]" }
                       : results ? { text: "Running", cls: "bg-[#FEF3C7] text-[#92400E]" }
                       : { text: "Setup ready", cls: "bg-[#EDE9FE] text-[#5139ED]" };

  // ── Summary Statistics ──────────────────────────────────────────────
  const stats = useMemo(() => {
    const s = {};
    if (results?.rmsd?.stats) { s.rmsdAvg = results.rmsd.stats.mean; s.rmsdMax = results.rmsd.stats.max; }
    if (results?.rmsf?.stats)     s.rmsfAvg = results.rmsf.stats.mean;
    if (results?.rg?.stats)       s.rgAvg   = results.rg.stats.mean;
    if (results?.sasa?.stats)     s.sasaAvg = results.sasa.stats.mean;
    if (results?.hbond?.stats)    s.hbondAvg = results.hbond.stats.mean;
    if (results?.distance?.stats) s.distAvg  = results.distance.stats.mean;
    if (mmpbsaText) {
      const m = mmpbsaText.match(/[-+]?\d*\.?\d+/g);
      if (m && m.length) s.mmpbsa = parseFloat(m[m.length - 1]); // last number in file = ΔG_bind by convention
    }
    return s;
  }, [results, mmpbsaText]);

  // ── PDB URL for the 3D viewer (initial receptor from RCSB) ────────────
  const pdbUrl = useMemo(() => {
    const id = (pdbId || targetOptions[tgtIdx]?.pdb_id || "").toUpperCase().trim();
    return id ? `https://files.rcsb.org/download/${id}.pdb` : null;
  }, [pdbId, targetOptions, tgtIdx]);

  // ─────────────────────────────────────────────────────────────
  // Empty-state guard (needs docking + at least one compound/target)
  // ─────────────────────────────────────────────────────────────
  if (!hasDocking) {
    return (
      <WorkflowLayout>
        <main data-testid="md-blocked-no-docking" className="mx-auto max-w-3xl px-6 pb-24 pt-14 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#5139ED]/10 text-[#5139ED]"><Atom className="h-6 w-6" /></div>
          <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-[#0B0B18]">Docking required</h1>
          <p className="mt-3 text-[#64748B]">
            Molecular Dynamics runs on successfully-docked compound × target complexes. Run docking first —
            the best-affinity pair will be pre-selected here automatically.
          </p>
          <Link to="/molecular-docking" data-testid="md-blocked-goto-docking"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-6 py-3 text-sm font-semibold text-white hover:bg-[#4127c9]">
            <ArrowLeft className="h-4 w-4" />Go to Molecular Docking
          </Link>
        </main>
      </WorkflowLayout>
    );
  }
  if (compoundOptions.length === 0 || targetOptions.length === 0) {
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

  const target = targetOptions[tgtIdx] || {};
  const compound = compoundOptions[compIdx] || {};

  return (
    <WorkflowLayout>
      <main data-testid="molecular-dynamics-page" className="mx-auto max-w-7xl px-6 pb-24 pt-10">
        {/* Page header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Module · 07 · Dashboard</p>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-[#0B0B18] sm:text-5xl">Molecular Dynamics</h1>
            <p className="mt-2 max-w-3xl text-sm text-[#64748B]">
              Configure the GROMACS project, run it on your infrastructure, then drop the output ZIP back
              here — every chart and metric populates automatically from your <span className="font-mono text-[12px]">.xvg</span> files.
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${runStatusBadge.cls}`} data-testid="md-run-status">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />{runStatusBadge.text}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
             ROW 1 · Simulation Info  +  Progress Timeline
             ═══════════════════════════════════════════════════════════════ */}
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* ─── Section 1 · Simulation Information Card ─── */}
          <section data-testid="md-info-card" className="xl:col-span-2 rounded-3xl border border-[#E7E7F3] bg-white/80 p-6 shadow-[0_10px_30px_-20px_rgba(81,57,237,0.35)] backdrop-blur">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#5139ED]" />
              <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Simulation Information</p>
            </div>

            {/* Compound + target pickers */}
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                Ligand<HelpTip text="Ligand shipped with the project — you provide GAFF params via ACPYPE downstream." />
                <select data-testid="md-compound" value={compIdx} onChange={(e) => setCompIdx(Number(e.target.value))}
                        className="brand-focus mt-1 w-full rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm text-[#0B0B18]">
                  {compoundOptions.map((c, i) => <option key={c.name} value={i}>{c.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                Protein<HelpTip text="Target — receptor PDB is auto-fetched from RCSB." />
                <select data-testid="md-target" value={tgtIdx} onChange={(e) => setTgtIdx(Number(e.target.value))}
                        className="brand-focus mt-1 w-full rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm text-[#0B0B18]">
                  {targetOptions.map((t, i) => <option key={t.gene_symbol} value={i}>{t.gene_symbol} · {t.uniprot_id}</option>)}
                </select>
              </label>
            </div>

            {/* Info grid: uniform key/value tiles */}
            <div className="mt-5 grid grid-cols-2 gap-2 text-[12px] md:grid-cols-3">
              <InfoRow label="Protein"        value={target.protein_name || target.gene_symbol || "—"} />
              <InfoRow label="UniProt ID"     value={target.uniprot_id || "—"} mono />
              <InfoRow label="PDB ID"
                       value={
                         <input data-testid="md-pdb-id" value={pdbId || target.pdb_id || ""} onChange={(e) => setPdbId(e.target.value.toUpperCase())}
                                placeholder="auto"
                                className="w-full rounded-md border border-[#E7E7F3] bg-white px-1.5 py-0.5 font-mono text-[12px] text-[#0B0B18]" />
                       } />
              <InfoRow label="Ligand"         value={compound.name || "—"} />
              <InfoRow label="Simulation Time" value={`${cfg.production_ns} ns`}
                       edit={<input type="number" min={1} max={5000} step={1} value={cfg.production_ns} onChange={upd("production_ns")} className="w-16 rounded-md border border-[#E7E7F3] bg-white px-1.5 py-0.5 text-[12px]" />} />
              <InfoRow label="Force Field" value={FF_OPTS.find((o) => o.key === cfg.force_field)?.label || cfg.force_field}
                       edit={<select data-testid="md-ff" value={cfg.force_field} onChange={upd("force_field")} className="w-full rounded-md border border-[#E7E7F3] bg-white px-1.5 py-0.5 text-[12px]">{FF_OPTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select>} />
              <InfoRow label="Water Model" value={WATER_OPTS.find((o) => o.key === cfg.water_model)?.label || cfg.water_model}
                       edit={<select data-testid="md-water" value={cfg.water_model} onChange={upd("water_model")} className="w-full rounded-md border border-[#E7E7F3] bg-white px-1.5 py-0.5 text-[12px]">{WATER_OPTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select>} />
              <InfoRow label="Temperature" value={`${cfg.temperature_K} K`}
                       edit={<input type="number" min={273} max={370} step={1} value={cfg.temperature_K} onChange={upd("temperature_K")} className="w-16 rounded-md border border-[#E7E7F3] bg-white px-1.5 py-0.5 text-[12px]" />} />
              <InfoRow label="Pressure" value={`${cfg.pressure_bar} bar`}
                       edit={<input type="number" min={0.5} max={5} step={0.1} value={cfg.pressure_bar} onChange={upd("pressure_bar")} className="w-16 rounded-md border border-[#E7E7F3] bg-white px-1.5 py-0.5 text-[12px]" />} />
              <InfoRow label="Box Type" value={BOX_OPTS.find((o) => o.key === cfg.box_type)?.label || cfg.box_type}
                       edit={<select data-testid="md-box-type" value={cfg.box_type} onChange={upd("box_type")} className="w-full rounded-md border border-[#E7E7F3] bg-white px-1.5 py-0.5 text-[12px]">{BOX_OPTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select>} />
              <InfoRow label="Salt Conc." value={`${cfg.ion_concentration} M`}
                       edit={<input type="number" min={0} max={1} step={0.05} value={cfg.ion_concentration} onChange={upd("ion_concentration")} className="w-20 rounded-md border border-[#E7E7F3] bg-white px-1.5 py-0.5 text-[12px]" />} />
              <InfoRow label="Time step" value={`${cfg.dt_fs} fs`}
                       edit={<input type="number" min={0.5} max={4} step={0.5} value={cfg.dt_fs} onChange={upd("dt_fs")} className="w-16 rounded-md border border-[#E7E7F3] bg-white px-1.5 py-0.5 text-[12px]" />} />
            </div>

            {estimate && (
              <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-[#F1F1FA] bg-[#FAFAFF] p-3 text-sm">
                <div className="rounded-lg bg-white p-2.5">
                  <p className="text-[10px] uppercase tracking-widest text-[#64748B]">CPU-only (32 cores)</p>
                  <p className="mt-1 font-mono text-xl font-bold text-[#5139ED]">≈ {estimate.cpu32.toFixed(0)} h</p>
                </div>
                <div className="rounded-lg bg-white p-2.5">
                  <p className="text-[10px] uppercase tracking-widest text-[#64748B]">GPU (A100 / 3090)</p>
                  <p className="mt-1 font-mono text-xl font-bold text-[#5139ED]">≈ {estimate.gpu.toFixed(0)} h</p>
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button data-testid="md-build" onClick={build} disabled={building}
                      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-5 py-2.5 text-[13px] font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)] disabled:opacity-40">
                {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
                {building ? "Building…" : "Generate MD Project"}
              </button>
              <input ref={fileRef} type="file" accept=".zip" data-testid="md-results-upload" className="hidden"
                     onChange={(e) => onUploadResults(e.target.files)} />
              <button data-testid="md-results-upload-btn"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="inline-flex items-center gap-2 rounded-full border border-[#5139ED]/40 bg-white px-5 py-2.5 text-[13px] font-bold uppercase tracking-widest text-[#5139ED] hover:bg-[#F5F3FE]">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Parsing…" : results ? "Reload Results ZIP" : "Upload Results ZIP"}
              </button>
            </div>
          </section>

          {/* ─── Section 2 · Simulation Progress Timeline ─── */}
          <section data-testid="md-progress-card" className="rounded-3xl border border-[#E7E7F3] bg-white/80 p-6 shadow-[0_10px_30px_-20px_rgba(81,57,237,0.35)] backdrop-blur">
            <div className="flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-[#5139ED]" />
              <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Simulation Progress</p>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="font-display text-3xl font-bold text-[#0B0B18]" data-testid="md-progress-pct">{pctComplete}%</span>
              <span className="text-[11px] uppercase tracking-widest text-[#64748B]">{completedCount}/{totalStages} stages</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#F1F1FA]">
              <div className="h-full rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] transition-all"
                   style={{ width: `${pctComplete}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-[#64748B]"><span className="font-semibold text-[#0B0B18]">Current:</span> {currentStage}</p>

            {/* Vertical timeline */}
            <ol className="mt-4 space-y-2" data-testid="md-progress-timeline">
              {STAGES.map((s, i) => {
                const st = stageStatus[s.key];
                const done = st === "completed";
                const active = st === "ready";
                return (
                  <li key={s.key} data-testid={`md-stage-${s.key}`} className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-[#0F7A47]" />
                      ) : active ? (
                        <div className="grid h-4 w-4 place-items-center">
                          <span className="block h-2 w-2 animate-pulse rounded-full bg-[#F59E0B]" />
                        </div>
                      ) : (
                        <Circle className="h-4 w-4 text-[#CBD5E1]" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className={done ? "font-semibold text-[#0B0B18]" : active ? "font-semibold text-[#0B0B18]" : "text-[#64748B]"}>
                          {i + 1}. {s.label}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${
                          done ? "bg-[#DCFCE7] text-[#166534]"
                          : active ? "bg-[#FEF3C7] text-[#92400E]"
                          : "bg-[#F1F1FA] text-[#64748B]"
                        }`}>{done ? "Done" : active ? "Ready" : "Pending"}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
             ROW 2 · Live Simulation Parameters (4 charts)
             ═══════════════════════════════════════════════════════════════ */}
        <section data-testid="md-live-params" className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white/80 p-6 shadow-[0_10px_30px_-20px_rgba(81,57,237,0.35)] backdrop-blur">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-[#5139ED]" />
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Live Simulation Parameters</p>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <MDAnalysisCard testid="temperature" title="Temperature vs Time" data={results?.temperature} color="#DC2626"
                            description="Instantaneous system temperature during equilibration + production. Should plateau near the setpoint." />
            <MDAnalysisCard testid="pressure" title="Pressure vs Time" data={results?.pressure} color="#2563EB"
                            description="Barostat pressure. Noise band ±100 bar is normal for NPT ensembles." />
            <MDAnalysisCard testid="density" title="Density vs Time" data={results?.density} color="#0F7A47"
                            description="Solvent + solute density (kg/m³). A stable plateau indicates a well-equilibrated box." />
            <MDAnalysisCard testid="energy" title="Potential Energy vs Time" data={results?.energy} color="#8139ED"
                            description="Total potential energy trace — steep descent during EM, flat during production." />
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
             ROW 3 · Trajectory Analysis (11 collapsible cards)
             ═══════════════════════════════════════════════════════════════ */}
        <section data-testid="md-trajectory-analysis" className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white/80 p-6 shadow-[0_10px_30px_-20px_rgba(81,57,237,0.35)] backdrop-blur">
          <div className="flex items-center gap-2">
            <Atom className="h-4 w-4 text-[#5139ED]" />
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Trajectory Analysis</p>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <MDAnalysisCard testid="rmsd"     title="RMSD"                    data={results?.rmsd}     color="#5139ED"
                            description="Backbone Root-Mean-Square Deviation vs the reference (initial) frame — protein stability." />
            <MDAnalysisCard testid="rmsf"     title="RMSF (per-residue)"      data={results?.rmsf}     color="#8139ED"
                            description="Per-residue Root-Mean-Square Fluctuation — regions with high peaks are flexible loops or termini." />
            <MDAnalysisCard testid="rg"       title="Radius of Gyration (Rg)" data={results?.rg}       color="#DC2626"
                            description="Compactness of the protein through the trajectory (nm). Sharp changes indicate folding/unfolding." />
            <MDAnalysisCard testid="sasa"     title="SASA"                    data={results?.sasa}     color="#F59E0B"
                            description="Solvent-Accessible Surface Area (nm²). Drops upon ligand binding for the ligand-facing pocket." />
            <MDAnalysisCard testid="hbond"    title="Hydrogen Bond Analysis"  data={results?.hbond}    color="#0F7A47"
                            description="Number of protein–ligand H-bonds vs time — sustained ≥ 2 correlates with stable binding." />
            <MDAnalysisCard testid="distance" title="Protein–Ligand Distance" data={results?.distance} color="#2563EB"
                            description="Centre-of-mass distance between the protein binding pocket and the ligand (nm)." />
            <MDAnalysisCard testid="contacts" title="Contact Analysis"        data={results?.contacts} color="#EC4899"
                            description="Number of atomic contacts (≤ 0.6 nm) between ligand and receptor over the trajectory." />
            <MDAnalysisCard testid="dssp"     title="Secondary Structure (DSSP)" data={results?.dssp}  color="#0EA5E9"
                            description="Time-resolved secondary-structure content from DSSP (α-helix / β-strand / coil fractions)." />
            <MDAnalysisCard testid="pca"      title="Principal Component Analysis (PCA)" data={results?.pca} color="#7C3AED"
                            description="Projection of the trajectory onto the top two eigenvectors — reveals dominant motions." />
            <MDAnalysisCard testid="fel"      title="Free Energy Landscape (FEL)"      data={results?.fel} color="#DB2777"
                            description="Gibbs free-energy surface along PC1/PC2 — deep basins mark meta-stable conformations." />
            <MMPBSACard mmpbsaText={mmpbsaText} />
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
             ROW 4 · Summary Statistics
             ═══════════════════════════════════════════════════════════════ */}
        <section data-testid="md-summary-stats" className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white/80 p-6 shadow-[0_10px_30px_-20px_rgba(81,57,237,0.35)] backdrop-blur">
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Summary Statistics</p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard testid="stat-rmsd-avg"   label="Avg RMSD"                unit="nm"    value={stats.rmsdAvg} />
            <StatCard testid="stat-rmsd-max"   label="Max RMSD"                unit="nm"    value={stats.rmsdMax} />
            <StatCard testid="stat-rmsf-avg"   label="Avg RMSF"                unit="nm"    value={stats.rmsfAvg} />
            <StatCard testid="stat-rg-avg"     label="Avg Radius of Gyration" unit="nm"    value={stats.rgAvg} />
            <StatCard testid="stat-sasa-avg"   label="Avg SASA"                unit="nm²"   value={stats.sasaAvg} />
            <StatCard testid="stat-hbond-avg"  label="Avg H-Bonds"             unit=""      value={stats.hbondAvg} />
            <StatCard testid="stat-dist-avg"   label="Avg P–L Distance"        unit="nm"    value={stats.distAvg} />
            <StatCard testid="stat-mmpbsa"     label="Binding Free Energy"    unit="kJ/mol" value={stats.mmpbsa} highlight />
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
             ROW 5 · 3D Viewer  +  Downloads
             ═══════════════════════════════════════════════════════════════ */}
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <section data-testid="md-3d-viewer" className="xl:col-span-2 rounded-3xl border border-[#E7E7F3] bg-white/80 p-6 shadow-[0_10px_30px_-20px_rgba(81,57,237,0.35)] backdrop-blur">
            <div className="flex items-center gap-2">
              <Atom className="h-4 w-4 text-[#5139ED]" />
              <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">3D Molecular Viewer</p>
            </div>
            <div className="mt-3">
              <MDViewer3D
                pdbUrl={pdbUrl}
                finalPdbData={finalPdb}
                ligandName={compound.name || "LIG"}
              />
            </div>
          </section>

          {/* ─── Section 7 · Downloads ─── */}
          <section data-testid="md-downloads" className="rounded-3xl border border-[#E7E7F3] bg-white/80 p-6 shadow-[0_10px_30px_-20px_rgba(81,57,237,0.35)] backdrop-blur">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-[#5139ED]" />
              <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Downloads</p>
            </div>
            <div className="mt-4 space-y-1.5 text-[13px]">
              <DlItem label="Simulation Report (PDF)" available onClick={() => buildMDReportPdf({ compound, target, cfg, stats, results, mmpbsaText, stageStatus, pctComplete })} testid="dl-report-pdf" />
              <DlItem label="Analysis Report (CSV)"   available={!!results} onClick={() => downloadCombinedCsv(results, `${compound.name}_analysis.csv`)} testid="dl-analysis-csv" />
              <DlItem label="RMSD Plot (SVG)"         available={!!results?.rmsd} onClick={() => downloadRawXvg(results?.rmsd, "rmsd.xvg")} testid="dl-rmsd" />
              <DlItem label="RMSF Plot (SVG)"         available={!!results?.rmsf} onClick={() => downloadRawXvg(results?.rmsf, "rmsf.xvg")} testid="dl-rmsf" />
              <DlItem label="Radius of Gyration"      available={!!results?.rg}   onClick={() => downloadRawXvg(results?.rg,   "gyrate.xvg")} testid="dl-rg" />
              <DlItem label="SASA Plot"               available={!!results?.sasa} onClick={() => downloadRawXvg(results?.sasa, "sasa.xvg")} testid="dl-sasa" />
              <DlItem label="Hydrogen Bond Plot"      available={!!results?.hbond}onClick={() => downloadRawXvg(results?.hbond,"hbond.xvg")} testid="dl-hbond" />
              <DlItem label="MM-PBSA Results"         available={!!mmpbsaText}    onClick={() => saveAs(new Blob([mmpbsaText || ""], { type: "text/plain" }), "mmpbsa.txt")} testid="dl-mmpbsa" />
              <div className="mt-3 border-t border-[#F1F1FA] pt-3 text-[10px] uppercase tracking-widest text-[#64748B]">Raw GROMACS files</div>
              <DlItem label="Trajectory (.xtc)"       available={uploadedFiles.some((f) => f.toLowerCase().endsWith(".xtc"))} note="From uploaded ZIP" testid="dl-xtc" />
              <DlItem label="Final Structure (.pdb)"  available={!!finalPdb}   onClick={() => saveAs(new Blob([finalPdb], { type: "chemical/x-pdb" }), "final.pdb")} testid="dl-final-pdb" />
              <DlItem label="Energy File (.edr)"      available={uploadedFiles.some((f) => f.toLowerCase().endsWith(".edr"))} note="From uploaded ZIP" testid="dl-edr" />
              <DlItem label="Log Files"               available={uploadedFiles.some((f) => f.toLowerCase().endsWith(".log"))} note="From uploaded ZIP" testid="dl-log" />
            </div>
          </section>
        </div>

        {/* Execution engine picker (kept, tucked below the dashboard) */}
        <section data-testid="md-engine" className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white/80 p-6 shadow-[0_10px_30px_-20px_rgba(81,57,237,0.35)] backdrop-blur">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-[#5139ED]" />
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Execution Engine</p>
          </div>
          <p className="mt-2 text-sm text-[#64748B]">
            Where will you run this simulation? The generated project package will include environment-specific
            scripts (bash / SLURM / cloud spec).
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
        </section>

        <div className="mt-6 flex justify-end">
          <Link data-testid="md-to-report" to="/scientific-report" className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9]">
            Generate AI Research Report<ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </WorkflowLayout>
  );
}

// ───────────── UI helpers (kept in-file for locality) ─────────────
function InfoRow({ label, value, edit, mono }) {
  return (
    <div className="rounded-lg border border-[#F1F1FA] bg-white p-2">
      <div className="text-[9px] font-bold uppercase tracking-widest text-[#64748B]">{label}</div>
      {edit ? <div className="mt-1">{edit}</div>
            : <div className={`mt-0.5 text-[13px] font-semibold text-[#0B0B18] ${mono ? "font-mono text-[12px]" : ""}`}>{value}</div>}
    </div>
  );
}

function StatCard({ label, value, unit, testid, highlight }) {
  const empty = value === undefined || value === null || Number.isNaN(value);
  return (
    <div data-testid={testid} className={`rounded-2xl border p-4 ${highlight ? "border-[#5139ED]/40 bg-gradient-to-br from-[#F5F3FE] to-white" : "border-[#F1F1FA] bg-white"}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">{label}</p>
      {empty ? (
        <p className="mt-1 text-sm text-[#94A3B8]">—</p>
      ) : (
        <p className="mt-1 font-display text-2xl font-bold text-[#0B0B18]">
          {typeof value === "number" ? value.toFixed(3) : value}
          {unit && <span className="ml-1 text-[11px] font-semibold text-[#64748B]">{unit}</span>}
        </p>
      )}
    </div>
  );
}

function DlItem({ label, available, onClick, note, testid }) {
  return (
    <button data-testid={testid} onClick={onClick} disabled={!available || !onClick}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-all ${
              available ? "border-[#E7E7F3] bg-white hover:border-[#5139ED]/40 hover:bg-[#FAFAFF]"
                        : "border-dashed border-[#E7E7F3] bg-[#FAFAFF]/50 opacity-60"
            }`}>
      <span className={`text-[13px] ${available ? "font-semibold text-[#0B0B18]" : "text-[#64748B]"}`}>{label}</span>
      <span className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#64748B]">
        {note}
        <Download className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

function MMPBSACard({ mmpbsaText }) {
  // Convert MM-PBSA text into a chart if the file contains a two-column table.
  const parsed = useMemo(() => {
    if (!mmpbsaText) return null;
    const rows = [];
    for (const line of mmpbsaText.split(/\r?\n/)) {
      const cols = line.trim().split(/[\s,]+/).map(Number);
      if (cols.length >= 2 && cols.every((n) => Number.isFinite(n))) rows.push({ x: cols[0], y0: cols[1] });
    }
    if (!rows.length) return null;
    const vals = rows.map((r) => r.y0);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const min = Math.min(...vals), max = Math.max(...vals);
    const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    return {
      chart: rows,
      stats: { n: vals.length, mean, min, max, std },
      meta: { xaxis: "Frame", yaxis: "ΔG (kJ/mol)", legends: ["ΔG_bind"] },
      raw: mmpbsaText,
    };
  }, [mmpbsaText]);

  return (
    <MDAnalysisCard testid="mmpbsa" title="MM-PBSA / MM-GBSA" data={parsed} color="#DB2777"
                    description="Per-frame binding free-energy decomposition (kJ/mol). Negative values indicate favourable binding." />
  );
}

// Downloads helpers
function downloadRawXvg(entry, filename) {
  if (!entry?.raw) return;
  saveAs(new Blob([entry.raw], { type: "text/plain" }), filename);
}

function downloadCombinedCsv(results, filename) {
  if (!results) return;
  const lines = ["metric,mean,std,min,max,n"];
  for (const [k, v] of Object.entries(results)) {
    if (!v?.stats) continue;
    lines.push([k, v.stats.mean, v.stats.std, v.stats.min, v.stats.max, v.stats.n].map((n) => (typeof n === "number" ? n.toFixed(6) : n)).join(","));
  }
  saveAs(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), filename);
}
