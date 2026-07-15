// Molecular Docking (AutoDock Vina) — Step 6 of the 9-step workflow.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import WorkflowLayout from "@/components/WorkflowLayout";
import { useNetwork } from "@/context/NetworkContext";
import { useResults } from "@/context/ResultsContext";
import { useWorkflow } from "@/context/WorkflowContext";
import { dockingPDBCandidates, dockingRun, dockingRunStream, dockingPoseURL } from "@/lib/api";
import { toast } from "sonner";
import { TableToolbar } from "@/components/network/TableToolbar";
import { DataTable } from "@/components/network/DataTable";
import { HelpTip } from "@/components/network/HelpTip";
import DockingViewer from "@/components/DockingViewer";
import { requireAuth } from "@/context/AuthContext";
import { ArrowLeft, ArrowRight, Beaker, Loader2, Download, Play, ExternalLink, Star } from "lucide-react";

const DEFAULT_EXHAUSTIVENESS = 8;
const DEFAULT_MODES = 9;
const DEFAULT_PADDING = 8;

export default function MolecularDocking() {
  const { compoundTargets, diseaseTargets, selectedCompounds, intersectingGenes: ctxIntersect, hubScores, setDockingResults } = useNetwork();
  const { compounds: allCompounds } = useResults();
  const { markComplete } = useWorkflow();

  // Candidate targets = hub genes in intersection (compound × disease)
  const intersectingGenes = useMemo(() => {
    if (ctxIntersect && ctxIntersect.length > 0) return ctxIntersect;
    const cSet = new Set(compoundTargets.map((r) => r.gene_symbol));
    const dSet = new Set(diseaseTargets.map((r) => r.gene_symbol));
    return [...cSet].filter((g) => dSet.has(g));
  }, [ctxIntersect, compoundTargets, diseaseTargets]);

  // Merge target metadata (gene, uniprot) from either source
  const targetOptions = useMemo(() => {
    const idx = new Map();
    for (const r of [...compoundTargets, ...diseaseTargets]) {
      const g = r.gene_symbol;
      if (!g || !idx.has(g) === false) {
        // preserve existing
      }
      if (!idx.has(g)) {
        idx.set(g, {
          gene_symbol: g,
          uniprot_id: r.uniprot_id,
          protein_name: r.protein_name,
          in_intersection: intersectingGenes.includes(g),
        });
      } else if (!idx.get(g).uniprot_id && r.uniprot_id) {
        idx.get(g).uniprot_id = r.uniprot_id;
      }
    }
    return [...idx.values()].sort((a, b) => (b.in_intersection - a.in_intersection));
  }, [compoundTargets, diseaseTargets, intersectingGenes]);

  // Compounds with a SMILES for docking (from ADMET / ResultsContext)
  const compoundOptions = useMemo(() => {
    const byKey = new Map();
    for (const c of selectedCompounds || []) byKey.set(c.imppat_id || c.compound_name, c);
    for (const c of allCompounds || []) {
      const k = c.imppat_id || c.compound_name;
      if (!byKey.has(k) && c.smiles) byKey.set(k, c);
    }
    return [...byKey.values()]
      .filter((c) => c.smiles)
      .map((c) => ({
        name: c.compound_name || c.imppat_id || "Compound",
        smiles: c.smiles,
        imppat_id: c.imppat_id,
        pubchem_cid: c.pubchem_cid,
      }));
  }, [selectedCompounds, allCompounds]);

  // ── Docking Priority Matrix (only compound → predicted-target → hub pairs) ──
  // Build valid pairs from compoundTargets rows (compound_name -> gene_symbol).
  const priorityRows = useMemo(() => {
    if (!compoundTargets?.length) return [];
    const admetByName = new Map();
    for (const c of allCompounds || []) admetByName.set(c.compound_name || c.imppat_id, c);
    const diseaseByGene = new Map();
    for (const d of diseaseTargets || []) diseaseByGene.set(d.gene_symbol, d);
    // Build hub-score lookup from real CytoHubba results (fallback to degree)
    const hubByGene = new Map();
    if (hubScores?.length) {
      const maxMCC = Math.max(1, ...hubScores.map((s) => s.mcc || 0));
      const maxDeg = Math.max(1, ...hubScores.map((s) => s.degree || 0));
      for (const s of hubScores) {
        // Weighted composite: 60% MCC + 40% degree, both normalised to 0-100
        const composite = 60 * ((s.mcc || 0) / maxMCC) + 40 * ((s.degree || 0) / maxDeg);
        hubByGene.set(s.id, composite);
      }
    }

    const rows = [];
    for (const row of compoundTargets) {
      const comp = row.compound_name;
      const gene = row.gene_symbol;
      if (!comp || !gene) continue;
      if (!intersectingGenes.includes(gene)) continue;

      const admet = admetByName.get(comp);
      const admetScore = admet?.admet_score?.percent ?? admet?.admet_score ?? 50;
      const targetConf = (row.confidence_score ?? row.best_pchembl ?? 5) * 10;
      const hubScore = hubByGene.get(gene) ?? 50;
      const diseaseAssoc = (diseaseByGene.get(gene)?.association_score || 0.5) * 100;
      const priority = Math.round(
        0.30 * admetScore + 0.30 * targetConf + 0.25 * hubScore + 0.15 * diseaseAssoc
      );
      const stars = priority >= 80 ? 5 : priority >= 65 ? 4 : priority >= 50 ? 3 : priority >= 35 ? 2 : 1;
      const recommendation = ["Very Low","Low","Moderate","Recommended","Highly Recommended"][stars - 1];
      rows.push({
        id: `${comp}::${gene}`, compound: comp, gene_symbol: gene,
        uniprot_id: row.uniprot_id, smiles: admet?.smiles || row.smiles,
        admet: Math.round(admetScore), target_conf: Math.round(targetConf),
        hub_score: Math.round(hubScore), disease_assoc: Math.round(diseaseAssoc),
        priority, stars, recommendation,
      });
    }
    rows.sort((a, b) => b.priority - a.priority);
    return rows;
  }, [compoundTargets, diseaseTargets, allCompounds, intersectingGenes, hubScores]);

  const [selectedPairs, setSelectedPairs] = useState({}); // {"compound::gene": true}
  // Auto-select ≥80 on first load
  useEffect(() => {
    if (Object.keys(selectedPairs).length === 0 && priorityRows.length > 0) {
      const m = {}; priorityRows.forEach((r) => { if (r.priority >= 80) m[r.id] = true; });
      setSelectedPairs(m);
    }
  }, [priorityRows]); // eslint-disable-line

  const autoSelectPriority = () => {
    const m = {}; priorityRows.forEach((r) => { if (r.priority >= 80) m[r.id] = true; });
    setSelectedPairs(m);
    // Also mirror into compound + target selection sets so run uses them.
    const cs = {}, ts = {};
    for (const r of priorityRows) if (m[r.id]) { cs[r.compound] = true; ts[r.gene_symbol] = true; }
    setSelectedComps((prev) => ({ ...prev, ...cs }));
    setSelectedTargets((prev) => ({ ...prev, ...ts }));
    toast.success(`Auto-selected ${Object.keys(m).length} high-priority pairs`);
  };

  const priorityColumns = [
    { key: "compound", label: "Compound", filterable: true },
    { key: "gene_symbol", label: "Hub Gene", filterable: true },
    { key: "admet", label: "ADMET", format: (v) => <span className="font-mono text-[11px]">{v}</span> },
    { key: "target_conf", label: "Target Conf.", format: (v) => <span className="font-mono text-[11px]">{v}</span> },
    { key: "hub_score", label: "Hub Score", format: (v) => <span className="font-mono text-[11px]">{v}</span> },
    { key: "disease_assoc", label: "Disease Assoc.", format: (v) => <span className="font-mono text-[11px]">{v}</span> },
    { key: "priority", label: "Priority", format: (v) => (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${v>=80?"bg-[#10B981]/15 text-[#059669]":v>=65?"bg-[#5139ED]/15 text-[#5139ED]":v>=50?"bg-[#F59E0B]/15 text-[#B45309]":"bg-red-100 text-red-700"}`}>{v}</span>
      ) },
    { key: "stars", label: "Recommendation", format: (v, r) => (
        <span className="inline-flex items-center gap-1 text-[10px]">
          {"★".repeat(v)}<span className="text-[#94A3B8]">{"★".repeat(5-v)}</span>
          <span className="ml-1 text-[#0B0B18]">{r.recommendation}</span>
        </span>
      ) },
    { key: "select", label: "Include", sortable: false, format: (_, r) => (
        <input data-testid={`prio-sel-${r.id}`} type="checkbox" checked={!!selectedPairs[r.id]} onChange={(e) => setSelectedPairs((s) => ({ ...s, [r.id]: e.target.checked }))} className="accent-[#5139ED]" />
      ) },
  ];

  // ─────────────────────────────────────────────────────────────

  const [selectedTargets, setSelectedTargets] = useState({}); // {gene: true}
  const [selectedComps, setSelectedComps] = useState({});     // {name: true}
  const [pdbSelections, setPdbSelections] = useState({});     // {gene: pdb_id}
  const [pdbCandidates, setPdbCandidates] = useState({});     // {gene: [candidates]}
  const [candidateLoading, setCandidateLoading] = useState(false);

  const [exhaustiveness, setExhaustiveness] = useState(DEFAULT_EXHAUSTIVENESS);
  const [numModes, setNumModes] = useState(DEFAULT_MODES);
  const [padding, setPadding] = useState(DEFAULT_PADDING);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null); // {job_id, receptors, results}

  // Pre-select intersecting targets on mount
  useEffect(() => {
    if (Object.keys(selectedTargets).length === 0 && intersectingGenes.length > 0) {
      const m = {}; intersectingGenes.forEach((g) => (m[g] = true));
      setSelectedTargets(m);
    }
  }, [intersectingGenes]); // eslint-disable-line
  useEffect(() => {
    if (Object.keys(selectedComps).length === 0 && compoundOptions.length > 0) {
      const m = {}; compoundOptions.slice(0, 3).forEach((c) => (m[c.name] = true));
      setSelectedComps(m);
    }
  }, [compoundOptions]); // eslint-disable-line

  const selectedGenes = Object.keys(selectedTargets).filter((g) => selectedTargets[g]);
  const selectedComp = compoundOptions.filter((c) => selectedComps[c.name]);

  const loadPDBCandidates = async () => {
    const uids = selectedGenes.map((g) => targetOptions.find((t) => t.gene_symbol === g)?.uniprot_id).filter(Boolean);
    if (uids.length === 0) return toast.error("Select targets with UniProt IDs first");
    setCandidateLoading(true);
    try {
      const res = await dockingPDBCandidates({ uniprot_ids: uids, limit: 5 });
      const map = {};
      const selMap = {};
      for (const g of selectedGenes) {
        const uid = targetOptions.find((t) => t.gene_symbol === g)?.uniprot_id;
        const cands = res.candidates[uid] || [];
        map[g] = cands;
        if (cands.length && !pdbSelections[g]) selMap[g] = cands[0].pdb_id;
      }
      setPdbCandidates(map);
      setPdbSelections((s) => ({ ...s, ...selMap }));
      toast.success(`Loaded PDB candidates for ${uids.length} target(s)`);
    } catch (e) { toast.error("PDB candidate fetch failed"); }
    finally { setCandidateLoading(false); }
  };

  const [progressEvents, setProgressEvents] = useState([]);   // SSE per-pair activity log
  const [progressPair, setProgressPair] = useState(null);      // currently-running pair
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressDone, setProgressDone] = useState(0);

  const runDocking = async () => {
    if (selectedComp.length === 0) return toast.error("Select at least 1 compound");
    if (selectedGenes.length === 0) return toast.error("Select at least 1 target");
    setRunning(true); setResult(null);
    setProgressEvents([]); setProgressPair(null); setProgressTotal(0); setProgressDone(0);
    try {
      const targets = selectedGenes.map((g) => {
        const t = targetOptions.find((x) => x.gene_symbol === g);
        return { uniprot_id: t?.uniprot_id, gene_symbol: g, pdb_id: pdbSelections[g] || undefined };
      }).filter((t) => t.uniprot_id);
      const body = { compounds: selectedComp, targets, exhaustiveness, num_modes: numModes, box_padding: padding };

      // ── SSE stream: parse events off a ReadableStream, updating UI live ──
      const resp = await dockingRunStream(body);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = ""; let finalResults = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const ev of events) {
          const eName = /event:\s*(\w+)/.exec(ev)?.[1];
          const dJson = /data:\s*(.+)/.exec(ev)?.[1];
          if (!eName || !dJson) continue;
          let data; try { data = JSON.parse(dJson); } catch { continue; }
          if (eName === "queued") setProgressTotal(data.total || 0);
          else if (eName === "pair_start") {
            setProgressPair(data);
            setProgressEvents((p) => [...p, { type: "start", ...data, at: Date.now() }]);
          } else if (eName === "pair_done") {
            setProgressDone((d) => d + 1);
            setProgressEvents((p) => [...p, { type: "done", ...data, at: Date.now() }]);
          } else if (eName === "error") {
            setProgressDone((d) => d + 1);
            setProgressEvents((p) => [...p, { type: "error", ...data, at: Date.now() }]);
          } else if (eName === "done") {
            finalResults = data.results || [];
          }
        }
      }
      const res = { results: finalResults };
      setResult(res);
      setDockingResults(res);
      markComplete("molecular-docking");
      toast.success(`Docking complete · ${finalResults.length} pairs`);
    } catch (e) { toast.error("Docking run failed: " + (e.response?.data?.detail || e.message)); }
    finally { setRunning(false); setProgressPair(null); }
  };

  const autoSelectForMD = () => {
    if (!result?.results) return [];
    return result.results.filter((r) => !r.error && r.best_affinity <= mdAffinityThreshold).slice(0, 8);
  };
  const [mdAffinityThreshold, setMdAffinityThreshold] = useState(-7.0);

  const resultRows = (result?.results || []).map((r, i) => ({
    id: r.pair_id + "-" + i,
    rank: i + 1,
    ligand: r.ligand_name,
    smiles: r.ligand_smiles,
    target: r.receptor_uniprot,
    pdb: r.receptor_pdb,
    affinity: r.best_affinity,
    n_poses: r.poses?.length || 0,
    hbonds: r.interactions?.hydrogen_bonds?.length || 0,
    hydrophobic: r.interactions?.hydrophobic_contacts?.length || 0,
    error: r.error,
    job_id: r.job_id,
    pair_id: r.pair_id,
  }));

  const cols = [
    { key: "rank", label: "Rank" },
    { key: "ligand", label: "Ligand", filterable: true },
    { key: "target", label: "UniProt" },
    { key: "pdb", label: "PDB", format: (v) => v ? <a href={`https://www.rcsb.org/structure/${v}`} target="_blank" rel="noreferrer" className="text-[#5139ED] underline decoration-dotted">{v}</a> : "—" },
    { key: "affinity", label: "Affinity (kcal/mol)", format: (v) => (v ?? 0).toFixed(2) },
    { key: "n_poses", label: "Poses" },
    { key: "hbonds", label: "H-bonds" },
    { key: "hydrophobic", label: "Hydrophobic" },
    { key: "error", label: "Notes", format: (v) => v ? <span className="text-red-500 text-[10px]">{v.slice(0, 60)}</span> : "" },
    { key: "download", label: "Pose", sortable: false, format: (_, r) => r.pair_id && !r.error ? (
        <div className="flex gap-1">
          <a data-testid={`dock-dl-pdbqt-${r.pair_id}`} href={dockingPoseURL(r.job_id, r.pair_id, "pdbqt")}
             className="rounded-full border border-[#E7E7F3] bg-white px-2 py-0.5 text-[10px] font-bold text-[#0B0B18] hover:border-[#5139ED]/50" download>PDBQT</a>
          <a data-testid={`dock-dl-pdb-${r.pair_id}`} href={dockingPoseURL(r.job_id, r.pair_id, "pdb")}
             className="rounded-full border border-[#E7E7F3] bg-white px-2 py-0.5 text-[10px] font-bold text-[#0B0B18] hover:border-[#5139ED]/50" download>PDB</a>
        </div>
      ) : ""
    },
  ];

  const noInputs = compoundOptions.length === 0 || targetOptions.length === 0;
  if (noInputs) {
    return (
      <WorkflowLayout>
        <main data-testid="dock-empty" className="mx-auto max-w-3xl px-6 pb-24 pt-14 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#5139ED]/10 text-[#5139ED]"><Beaker className="h-6 w-6" /></div>
          <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-[#0B0B18]">Molecular Docking</h1>
          <p className="mt-3 text-[#64748B]">Complete the Plant DB → ADMET → Target ID workflow first to populate compounds and targets.</p>
          <Link to="/target-prediction" className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-6 py-3 text-sm font-semibold text-white hover:bg-[#4127c9]"><ArrowLeft className="h-4 w-4" />Go to Target Prediction</Link>
        </main>
      </WorkflowLayout>
    );
  }

  return (
    <WorkflowLayout>
      <main data-testid="molecular-docking-page" className="mx-auto max-w-7xl px-6 pb-24 pt-14">
        <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Module · 06</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#0B0B18] sm:text-5xl">Molecular Docking</h1>
        <p className="mt-3 max-w-2xl text-[#64748B]">AutoDock Vina · receptor auto-prep from RCSB PDB · Meeko ligand prep · batch docking · publication-ready output.</p>

        {/* Docking Priority Matrix */}
        {priorityRows.length > 0 && (
          <div data-testid="dock-priority-card" className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Compound × Hub-Gene Docking Priority</p>
                <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">
                  {priorityRows.length} biologically relevant pairs
                  <span className="ml-2 text-xs font-normal text-[#64748B]">Weighted: ADMET 30% · Target Confidence 30% · Hub Score 25% · Disease Association 15%</span>
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button data-testid="dock-priority-auto-select" onClick={autoSelectPriority}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#10B981] to-[#5139ED] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)]">
                  <Star className="h-3.5 w-3.5" /> Auto Select ≥80
                </button>
                <TableToolbar
                  rows={priorityRows.map(({ id, stars, ...r }) => r)}
                  columns={priorityColumns.filter((c) => c.key !== "select" && c.key !== "stars").map(({ key, label }) => ({ key, label }))}
                  basename="docking_priority"
                  testidPrefix="dock-priority-tbl"
                />
              </div>
            </div>
            <div className="mt-4">
              <DataTable rows={priorityRows} columns={priorityColumns} testidPrefix="dock-priority-dt" pageSize={25} />
            </div>
          </div>
        )}

        {/* Selection panel */}
        <div data-testid="dock-selection" className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-[#E7E7F3] bg-white p-5">
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Compounds ({selectedComp.length}/{compoundOptions.length})</p>
            <div className="mt-3 max-h-64 space-y-1 overflow-auto">
              {compoundOptions.map((c) => (
                <label key={c.name} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#F1F1FA] bg-white px-3 py-2 text-xs">
                  <input data-testid={`dock-comp-${c.name}`} type="checkbox" checked={!!selectedComps[c.name]} onChange={(e) => setSelectedComps((s) => ({ ...s, [c.name]: e.target.checked }))} className="accent-[#5139ED]" />
                  <span className="flex-1 font-semibold text-[#0B0B18]">{c.name}</span>
                  <span className="max-w-[50%] truncate font-mono text-[10px] text-[#64748B]" title={c.smiles}>{c.smiles}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-[#E7E7F3] bg-white p-5">
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Targets ({selectedGenes.length}/{targetOptions.length})</p>
            <div className="mt-3 max-h-64 space-y-1 overflow-auto">
              {targetOptions.map((t) => (
                <label key={t.gene_symbol} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#F1F1FA] bg-white px-3 py-2 text-xs">
                  <input data-testid={`dock-tgt-${t.gene_symbol}`} type="checkbox" checked={!!selectedTargets[t.gene_symbol]} onChange={(e) => setSelectedTargets((s) => ({ ...s, [t.gene_symbol]: e.target.checked }))} className="accent-[#5139ED]" />
                  <span className="flex-1 font-semibold text-[#0B0B18]">{t.gene_symbol}</span>
                  <span className="font-mono text-[10px] text-[#64748B]">{t.uniprot_id}</span>
                  {t.in_intersection && <span className="rounded-full bg-[#5139ED]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#5139ED]">Hub</span>}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Vina params */}
        <div data-testid="dock-params" className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">AutoDock Vina Parameters</p>
              <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">Batch docking configuration</h2>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                Exhaustiveness<HelpTip text="How thoroughly Vina explores the search space (1–32). Higher = slower + more reproducible." />
                <input data-testid="dock-exh" type="number" min={1} max={32} value={exhaustiveness} onChange={(e) => setExhaustiveness(Number(e.target.value))} className="brand-focus w-20 rounded-lg border border-[#E7E7F3] bg-white px-3 py-1.5 text-sm text-[#0B0B18]" />
              </label>
              <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                Num modes<HelpTip text="How many binding poses per docking to return." />
                <input data-testid="dock-modes" type="number" min={1} max={20} value={numModes} onChange={(e) => setNumModes(Number(e.target.value))} className="brand-focus w-20 rounded-lg border border-[#E7E7F3] bg-white px-3 py-1.5 text-sm text-[#0B0B18]" />
              </label>
              <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                Box padding (Å)<HelpTip text="Extra grid-box padding beyond the reference ligand's bounding box." />
                <input data-testid="dock-padding" type="number" min={0} max={30} step={0.5} value={padding} onChange={(e) => setPadding(Number(e.target.value))} className="brand-focus w-20 rounded-lg border border-[#E7E7F3] bg-white px-3 py-1.5 text-sm text-[#0B0B18]" />
              </label>
              <button data-testid="dock-load-pdbs" onClick={loadPDBCandidates} disabled={candidateLoading || selectedGenes.length === 0} className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#0B0B18] hover:border-[#5139ED]/50 disabled:opacity-40">
                {candidateLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Load PDB candidates
              </button>
              <button data-testid="dock-run" onClick={runDocking} disabled={running} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)] disabled:opacity-40">
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {running ? "Docking…" : "Run docking"}
              </button>
            </div>
          </div>
          {running && (
            <div data-testid="dock-live-progress" className="mt-4 rounded-2xl border border-[#5139ED]/30 bg-[#F5F3FE] p-4">
              <div className="flex items-center justify-between">
                <p className="font-heading text-[11px] font-bold uppercase tracking-widest text-[#5139ED]">Live docking progress</p>
                <p className="font-mono text-[11px] text-[#0B0B18]">{progressDone} / {progressTotal || "?"} pairs</p>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white">
                <div className="h-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] transition-all"
                     style={{ width: progressTotal ? `${(progressDone / progressTotal) * 100}%` : "5%" }} />
              </div>
              {progressPair && (
                <p className="mt-2 text-[11px] text-[#0B0B18]">
                  <Loader2 className="inline h-3 w-3 animate-spin text-[#5139ED]" /> Docking{" "}
                  <span className="font-bold">{progressPair.compound}</span> × <span className="font-bold">{progressPair.target}</span>
                </p>
              )}
              {progressEvents.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[10px] font-semibold text-[#5139ED]">Activity log ({progressEvents.length})</summary>
                  <ul data-testid="dock-progress-log" className="mt-2 max-h-40 overflow-y-auto space-y-1 font-mono text-[10px]">
                    {progressEvents.slice(-40).reverse().map((e, i) => (
                      <li key={i} className={
                        e.type === "error" ? "text-red-600" :
                        e.type === "done"  ? "text-[#2BB673]" : "text-[#64748B]"
                      }>
                        [{new Date(e.at).toLocaleTimeString()}] {e.type} · {e.compound} × {e.target}
                        {e.result?.best_affinity !== undefined && ` · ${e.result.best_affinity.toFixed(2)} kcal/mol`}
                        {e.error && ` · ${String(e.error).slice(0, 80)}`}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          {Object.keys(pdbCandidates).length > 0 && (
            <div data-testid="dock-pdb-selection" className="mt-4 space-y-2">
              <p className="font-heading text-[10px] font-bold uppercase tracking-widest text-[#64748B]">PDB structure per target (auto-recommended)</p>
              {selectedGenes.map((g) => {
                const cands = pdbCandidates[g] || [];
                if (cands.length === 0) return null;
                return (
                  <div key={g} className="flex flex-wrap items-center gap-2">
                    <span className="w-24 font-mono text-[11px] font-bold text-[#5139ED]">{g}</span>
                    <select data-testid={`dock-pdb-${g}`} value={pdbSelections[g] || cands[0].pdb_id} onChange={(e) => setPdbSelections((s) => ({ ...s, [g]: e.target.value }))}
                      className="brand-focus rounded-full border border-[#E7E7F3] bg-white px-3 py-1 text-xs text-[#0B0B18]">
                      {cands.map((c) => (
                        <option key={c.pdb_id} value={c.pdb_id}>
                          {c.pdb_id} · {c.resolution ? `${c.resolution.toFixed(2)} Å` : "n/a"} · {c.n_ligands} ligands · score {c.score}
                        </option>
                      ))}
                    </select>
                    <a href={`https://www.rcsb.org/structure/${pdbSelections[g] || cands[0].pdb_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-[#5139ED] underline"><ExternalLink className="h-3 w-3" /> RCSB</a>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Results */}
        {result?.results && (
          <div data-testid="dock-results-card" className="mt-6 space-y-4">
            {/* Summary cards */}
            <div data-testid="dock-summary" className="grid grid-cols-2 gap-3 md:grid-cols-6">
              {(() => {
                const rr = result.results; const okr = rr.filter((r) => !r.error);
                const avg = okr.length ? okr.reduce((s, r) => s + r.best_affinity, 0) / okr.length : 0;
                const best = okr.length ? okr.reduce((a, b) => a.best_affinity < b.best_affinity ? a : b) : null;
                return (
                  <>
                    <SumCard testid="dock-total" label="Total Jobs" value={rr.length} />
                    <SumCard testid="dock-ok" label="Successful" value={okr.length} />
                    <SumCard testid="dock-avg" label="Avg BE (kcal/mol)" value={avg.toFixed(2)} />
                    <SumCard testid="dock-best-comp" label="Best Ligand" value={best?.ligand_name || "—"} />
                    <SumCard testid="dock-best-tgt" label="Best Target" value={best?.receptor_pdb || "—"} />
                    <SumCard testid="dock-best-aff" label="Best BE" value={best ? best.best_affinity.toFixed(2) : "—"} highlight />
                  </>
                );
              })()}
            </div>
            <div className="rounded-3xl border border-[#E7E7F3] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Docking Results — job {result.job_id}</p>
                  <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">Ranked by binding affinity (kcal/mol)</h2>
                </div>
                <TableToolbar
                  rows={resultRows.map(({ download, ...r }) => r)}
                  columns={cols.filter((c) => c.key !== "download").map(({ key, label }) => ({ key, label }))}
                  basename="docking_results"
                  testidPrefix="dock-tbl"
                />
              </div>
              <div className="mt-4">
                <DataTable rows={resultRows} columns={cols} testidPrefix="dock-dt" pageSize={25} />
              </div>
            </div>

            {/* Complex viewers per successful pair */}
            <div data-testid="dock-viewers" className="space-y-4">
              {result.results
                .filter((r) => !r.error && r.pair_id)
                .slice(0, 10)                                       // safety cap
                .map((r) => (
                  <DockingViewer
                    key={r.pair_id}
                    jobId={r.job_id}
                    pairId={r.pair_id}
                    ligandName={r.ligand_name}
                    receptor={r.receptor_pdb}
                    bestAffinity={r.best_affinity}
                    interactions={r.interactions}
                  />
                ))}
            </div>

            {/* Auto-select for MD */}
            <div data-testid="dock-auto-select" className="rounded-3xl border border-[#E7E7F3] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Auto Select for MD</p>
                  <p className="mt-1 text-xs text-[#64748B]">
                    Complexes with affinity ≤
                    <input data-testid="dock-md-threshold" type="number" step={0.1} value={mdAffinityThreshold} onChange={(e) => setMdAffinityThreshold(Number(e.target.value))} className="mx-1 w-16 rounded-lg border border-[#E7E7F3] bg-white px-2 py-0.5 text-xs text-[#0B0B18]" />
                    kcal/mol ({autoSelectForMD().length} complexes)
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {autoSelectForMD().map((r) => (
                    <span key={r.pair_id} data-testid={`dock-auto-${r.pair_id}`} className="inline-flex items-center gap-1 rounded-full bg-[#5139ED]/10 px-3 py-1 text-[11px] font-semibold text-[#5139ED]">
                      {r.ligand_name} × {r.receptor_pdb} · {r.best_affinity.toFixed(2)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Link data-testid="dock-to-md" to="/molecular-dynamics" className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9]">
                  Proceed to Molecular Dynamics<ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>
    </WorkflowLayout>
  );
}

function SumCard({ testid, label, value, highlight }) {
  return (
    <div data-testid={testid} className={`rounded-2xl border p-3 ${highlight ? "border-[#5139ED]/30 bg-[#5139ED]/[0.04]" : "border-[#F1F1FA] bg-white"}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">{label}</p>
      <p className={`mt-1 font-mono text-lg font-bold ${highlight ? "text-[#5139ED]" : "text-[#0B0B18]"}`}>{value}</p>
    </div>
  );
}
