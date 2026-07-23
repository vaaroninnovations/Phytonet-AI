import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  timeout: 120000,
});

export const searchPlant = (plant, opts = {}) =>
  api
    .get("/plant/search", {
      params: {
        plant,
        limit: opts.limit ?? 200,
        want_structure: opts.wantStructure ?? true,
        want_physchem: opts.wantPhyschem ?? true,
      },
    })
    .then((r) => r.data);

export const lotusSimple = (query) =>
  api.get("/lotus/simple", { params: { query } }).then((r) => r.data);

export const lotusExact = (type, value) =>
  api.get("/lotus/exact", { params: { type, value } }).then((r) => r.data);

export const lotusSubstructure = (smiles, algorithm = "default", max_hits = 100) =>
  api
    .get("/lotus/substructure", { params: { smiles, algorithm, max_hits } })
    .then((r) => r.data);

export const lotusMolweight = (minMass, maxMass, maxHits = 20) =>
  api
    .get("/lotus/molweight", { params: { minMass, maxMass, maxHits } })
    .then((r) => r.data);

export const lcmsEnrich = (compounds) =>
  api.post("/lcms/enrich", { compounds }).then((r) => r.data);

export const standardizeStart = (compounds) =>
  api.post("/standardize/start", { compounds }).then((r) => r.data);

export const standardizeStatus = (jobId) =>
  api.get(`/standardize/status/${jobId}`).then((r) => r.data);

export const admetPredict = (compounds) =>
  api.post("/admet/predict", { compounds }).then((r) => r.data);

export const admetStatus = (jobId) =>
  api.get(`/admet/status/${jobId}`).then((r) => r.data);

export const targetPredict = (compounds) =>
  api.post("/target/predict", { compounds }).then((r) => r.data);

export const targetStatus = (jobId) =>
  api.get(`/target/status/${jobId}`).then((r) => r.data);

export const diseaseSearch = (q) =>
  api.get(`/disease/search`, { params: { q } }).then((r) => r.data);

export const diseaseTargets = (efoId, name) =>
  api.get(`/disease/targets`, { params: { efo_id: efoId, name } }).then((r) => r.data);

export const ppiNetwork = (payload) =>
  api.post("/ppi/network", payload).then((r) => r.data);

export const keggEnrich = (payload) =>
  api.post("/kegg/enrich", payload).then((r) => r.data);

export const goEnrich = (payload) =>
  api.post("/go/enrich", payload).then((r) => r.data);

// Docking
export const dockingPDBCandidates = (payload) =>
  api.post("/docking/pdb-candidates", payload).then((r) => r.data);
export const dockingRun = (payload) =>
  api.post("/docking/run", payload, { timeout: 600000 }).then((r) => r.data);

// Intelligent lookups — compound name → PubChem, gene/protein → UniProt.
export const compoundLookup = (name) =>
  api.get("/compound/lookup", { params: { name } }).then((r) => r.data);
export const targetResolve = (query, organism = "Homo sapiens") =>
  api.get("/target/resolve", { params: { query, organism } }).then((r) => r.data);

// ── Node credit system ─────────────────────────────────────────────
export const getNodeBalance = () => api.get("/nodes/balance").then((r) => r.data);
export const chargeNodes = (payload) =>
  api.post("/nodes/charge", payload).then((r) => r.data);
export const getNodeHistory = (params = {}) =>
  api.get("/nodes/history", { params }).then((r) => r.data);
export const getNodePricing = () => api.get("/nodes/pricing").then((r) => r.data);
export const createPurchaseIntent = (plan_id) =>
  api.post("/nodes/purchase-intent", { plan_id }).then((r) => r.data);

// SSE stream — returns EventSource. Caller wires up `pair_start` / `pair_done`
// / `error` / `done` listeners.
export const dockingRunStream = (payload) => {
  // EventSource requires a GET, but our SSE endpoint is POST. Use fetch+ReadableStream instead.
  const url = `${BACKEND_URL}/api/docking/run/stream`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
};
export const dockingPoseURL = (job_id, pair_id, fmt = "pdbqt") =>
  `${BACKEND_URL}/api/docking/pose/${encodeURIComponent(job_id)}/${encodeURIComponent(pair_id)}?fmt=${fmt}`;

// Molecular Dynamics
export const mdEstimate = (payload) =>
  api.post("/md/estimate", payload).then((r) => r.data);
export async function mdBuild(payload) {
  const res = await api.post("/md/build", payload, { responseType: "blob", timeout: 120000 });
  return res.data;
}

// AI Scientific Report
export const reportGenerate = (workflow, model) =>
  api.post("/report/generate", { workflow, model }, { timeout: 300000 }).then((r) => r.data);
export const reportDownloadURL = (report_id, fmt) =>
  `${BACKEND_URL}/api/report/download/${encodeURIComponent(report_id)}?fmt=${fmt}`;

// ─────────────────────────── Projects ────────────────────────────
// All project endpoints require an authenticated session; use `authApi` from
// AuthContext (withCredentials) rather than the anonymous `api` instance.
import { authApi } from "@/context/AuthContext";

export const listProjects = () =>
  authApi.get("/projects").then((r) => r.data);
export const getProject = (id) =>
  authApi.get(`/projects/${encodeURIComponent(id)}`).then((r) => r.data);
export const createProject = (payload) =>
  authApi.post("/projects", payload).then((r) => r.data);
export const updateProject = (id, payload) =>
  authApi.put(`/projects/${encodeURIComponent(id)}`, payload).then((r) => r.data);
export const deleteProject = (id) =>
  authApi.delete(`/projects/${encodeURIComponent(id)}`).then((r) => r.data);
export const duplicateProject = (id) =>
  authApi.post(`/projects/${encodeURIComponent(id)}/duplicate`).then((r) => r.data);
export const snapshotProject = (id, label) =>
  authApi.post(`/projects/${encodeURIComponent(id)}/snapshot`, { label }).then((r) => r.data);
export const listVersions = (id) =>
  authApi.get(`/projects/${encodeURIComponent(id)}/versions`).then((r) => r.data);
export const restoreVersion = (id, versionId) =>
  authApi.post(`/projects/${encodeURIComponent(id)}/restore/${encodeURIComponent(versionId)}`).then((r) => r.data);

export const getAutosave = () =>
  authApi.get("/projects/autosave/latest").then((r) => r.data);
export const upsertAutosave = (payload) =>
  authApi.post("/projects/autosave", payload).then((r) => r.data);
export const clearAutosave = () =>
  authApi.delete("/projects/autosave").then((r) => r.data);
export const promoteAutosave = (payload) =>
  authApi.post("/projects/autosave/promote", payload).then((r) => r.data);

// ─────────────────────────── MD Execution Engines ─────────────────
export const listMDEngines = () =>
  api.get("/md/engines").then((r) => r.data);

// ─────────────────────────── Public verify-email ──────────────────
export const verifyEmailToken = (token) =>
  api.post("/auth/verify-email", { token }).then((r) => r.data);
export const resendVerificationPublic = (email, password) =>
  api.post("/auth/resend-verification-public", { email, password }).then((r) => r.data);

// ─────────────────────────── PhytoNet AI Assistant ─────────────────
export const assistantEligibility = () =>
  authApi.get("/assistant/eligibility").then((r) => r.data);
export const assistantRun = (plant_name, disease_name, lcms_uploaded = false, lcms_compounds = null) =>
  authApi.post("/assistant/run",
    { plant_name, disease_name, lcms_uploaded, lcms_compounds }).then((r) => r.data);
export const assistantStatus = (run_id) =>
  authApi.get(`/assistant/status/${encodeURIComponent(run_id)}`).then((r) => r.data);
export const assistantRuns = () =>
  authApi.get("/assistant/runs").then((r) => r.data);
export const assistantReportURL = (run_id, fmt) =>
  `${BACKEND_URL}/api/assistant/report/${encodeURIComponent(run_id)}/${fmt}`;

