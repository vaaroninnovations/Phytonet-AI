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

