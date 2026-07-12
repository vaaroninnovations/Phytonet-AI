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
