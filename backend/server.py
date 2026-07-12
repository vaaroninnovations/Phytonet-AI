from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import time
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from urllib.parse import quote
import httpx
from bs4 import BeautifulSoup

from plants_seed import PLANTS_SEED


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# Collections
plant_cache_col = db["plant_cache"]  # cached /api/plant/search responses
plants_col = db["plants"]  # autocomplete index

app = FastAPI(title="Dr. / — Network Pharmacology API")
api_router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
IMPPAT_BASE = "https://cb.imsc.res.in/imppat"
LOTUS_BASE = "https://lotus.naturalproducts.net/api/search"
PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound"

USER_AGENT = (
    "Mozilla/5.0 (compatible; DrSlashBot/1.0; +https://networkpharm.ai) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36"
)

CACHE_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class Compound(BaseModel):
    source: str = "IMPPAT"
    compound_name: Optional[str] = None
    imppat_id: Optional[str] = None
    lotus_id: Optional[str] = None
    plant_part: Optional[str] = None
    smiles: Optional[str] = None
    inchi: Optional[str] = None
    inchi_key: Optional[str] = None
    molecular_formula: Optional[str] = None
    molecular_weight: Optional[float] = None
    reference: Optional[str] = None


# ---------------------------------------------------------------------------
# IMPPAT scraping
# ---------------------------------------------------------------------------
async def _http_get(client_: httpx.AsyncClient, url: str) -> Optional[str]:
    try:
        r = await client_.get(url, timeout=25.0, headers={"User-Agent": USER_AGENT})
        if r.status_code == 200:
            return r.text
    except Exception as e:  # network / timeout
        logging.warning(f"GET {url} failed: {e}")
    return None


def _parse_imppat_listing(html: str) -> List[dict]:
    """Parse the phytochemical listing table on the IMPPAT plant page."""
    soup = BeautifulSoup(html, "lxml")
    rows: List[dict] = []
    table = soup.find("table")
    if not table:
        return rows
    trs = table.find_all("tr")
    if not trs:
        return rows
    # first row is header
    for tr in trs[1:]:
        tds = tr.find_all("td")
        if len(tds) < 4:
            continue
        plant_part = tds[1].get_text(" ", strip=True)
        imppat_id = tds[2].get_text(" ", strip=True)
        compound_name = tds[3].get_text(" ", strip=True)
        reference = tds[4].get_text(" ", strip=True) if len(tds) > 4 else None
        if not imppat_id or not compound_name:
            continue
        rows.append(
            {
                "source": "IMPPAT",
                "imppat_id": imppat_id,
                "compound_name": compound_name,
                "plant_part": plant_part,
                "reference": reference,
            }
        )
    return rows


def _dedupe_by_imppat_id(rows: List[dict]) -> List[dict]:
    """Same phytochemical can appear multiple times (different plant parts)."""
    seen: dict[str, dict] = {}
    for r in rows:
        key = r.get("imppat_id") or r.get("compound_name")
        if key not in seen:
            seen[key] = dict(r)
            seen[key]["plant_parts"] = [r.get("plant_part")] if r.get("plant_part") else []
        else:
            pp = r.get("plant_part")
            if pp and pp not in seen[key]["plant_parts"]:
                seen[key]["plant_parts"].append(pp)
    out = []
    for v in seen.values():
        if v.get("plant_parts"):
            v["plant_part"] = ", ".join(v["plant_parts"])
        v.pop("plant_parts", None)
        out.append(v)
    return out


_SMI_RE = re.compile(
    r"<strong>SMILES:</strong>.*?<text[^>]*>([^<]+)</text>", re.DOTALL | re.IGNORECASE
)
_INCHI_RE = re.compile(
    r"<strong>InChI:</strong>.*?<text[^>]*>([^<]+)</text>", re.DOTALL | re.IGNORECASE
)
_INCHIKEY_RE = re.compile(
    r"<strong>InChIKey:</strong>\s*<br\s*/?>\s*([A-Z0-9\-]+)", re.IGNORECASE
)
_MW_RE = re.compile(
    r"Molecular weight[^<]*</td>\s*<td>.*?</td>\s*<td>\s*([\d.]+)", re.IGNORECASE | re.DOTALL
)
_MF_RE = re.compile(
    r"Molecular formula[^<]*</td>\s*<td>.*?</td>\s*<td>\s*([A-Za-z0-9]+)",
    re.IGNORECASE | re.DOTALL,
)


_FORMULA_FROM_INCHI = re.compile(r"^InChI=[^/]+/([A-Za-z0-9]+)/")


def _parse_imppat_detail(html: str) -> dict:
    out: dict = {}
    m = _SMI_RE.search(html)
    if m:
        out["smiles"] = m.group(1).strip()
    m = _INCHI_RE.search(html)
    if m:
        inchi = m.group(1).strip()
        out["inchi"] = inchi
        fm = _FORMULA_FROM_INCHI.match(inchi)
        if fm:
            out["molecular_formula"] = fm.group(1)
    m = _INCHIKEY_RE.search(html)
    if m:
        out["inchi_key"] = m.group(1).strip()
    return out


def _parse_imppat_physchem(html: str) -> dict:
    out: dict = {}
    m = _MW_RE.search(html)
    if m:
        try:
            out["molecular_weight"] = float(m.group(1))
        except ValueError:
            pass
    m = _MF_RE.search(html)
    if m:
        out["molecular_formula"] = m.group(1).strip()
    return out


async def _enrich_imppat_row(
    client_: httpx.AsyncClient, row: dict, want_structure: bool, want_physchem: bool
) -> dict:
    imppat_id = row.get("imppat_id")
    if not imppat_id:
        return row
    tasks = []
    if want_structure:
        tasks.append(
            _http_get(client_, f"{IMPPAT_BASE}/phytochemical-detailedpage/{imppat_id}")
        )
    else:
        tasks.append(asyncio.sleep(0, result=None))
    if want_physchem:
        tasks.append(
            _http_get(client_, f"{IMPPAT_BASE}/physicochemicalproperties/{imppat_id}")
        )
    else:
        tasks.append(asyncio.sleep(0, result=None))

    detail_html, phys_html = await asyncio.gather(*tasks)
    if detail_html:
        row.update(_parse_imppat_detail(detail_html))
    if phys_html:
        row.update(_parse_imppat_physchem(phys_html))
    return row


def _merge_and_dedupe(imppat_rows: List[dict], lotus_rows: List[dict]) -> List[dict]:
    """
    Merge IMPPAT + LOTUS compound rows, deduplicating by InChIKey skeleton
    (first 14 chars, i.e. connectivity layer). Falls back to case-insensitive
    compound name when InChIKey is unavailable. When the same compound is
    present in both sources, keeps a single merged row that carries both
    `imppat_id` and `lotus_id`, and back-fills any missing fields.
    """
    merged: dict[tuple, dict] = {}
    order: list[tuple] = []

    def keys_of(r: dict) -> list[tuple]:
        ks = []
        ik = (r.get("inchi_key") or "").strip()
        if ik:
            ks.append(("k", ik.split("-")[0]))  # connectivity layer only
        name = (r.get("compound_name") or "").strip().lower()
        if name:
            ks.append(("n", name))
        return ks

    def upsert(row: dict):
        ks = keys_of(row)
        if not ks:
            return
        # If ANY key already exists, merge into that entry
        for k in ks:
            if k in merged:
                existing = merged[k]
                # Combine source labels
                src_new = row.get("source")
                src_old = existing.get("source")
                if src_new and src_old and src_new != src_old:
                    parts = sorted(set(src_old.split("+")) | {src_new})
                    existing["source"] = "+".join(parts)
                # Carry across identifiers
                for id_field in ("imppat_id", "lotus_id"):
                    if not existing.get(id_field) and row.get(id_field):
                        existing[id_field] = row[id_field]
                # Back-fill data fields
                for f in (
                    "smiles",
                    "inchi",
                    "inchi_key",
                    "molecular_formula",
                    "molecular_weight",
                    "plant_part",
                    "reference",
                ):
                    if not existing.get(f) and row.get(f):
                        existing[f] = row[f]
                # Register all keys for future look-ups
                for k2 in keys_of(existing):
                    if k2 not in merged:
                        merged[k2] = existing
                return
        # New compound — insert under all its keys
        entry = dict(row)
        for k in ks:
            merged[k] = entry
        order.append(ks[0])

    for r in imppat_rows:
        upsert(r)
    for r in lotus_rows:
        upsert(r)

    # order references the first key of each unique entry
    return [merged[k] for k in order]


@api_router.get("/plant/search")
async def plant_search(
    plant: str = Query(..., min_length=2),
    limit: int = Query(200, ge=1, le=500),
    want_structure: bool = Query(True),
    want_physchem: bool = Query(True),
):
    """
    Search IMPPAT + LOTUS by medicinal plant name. Returns a list of compounds.
    Structure/physchem details are fetched from IMPPAT detail/physchem pages
    for up to `limit` compounds.
    """
    cache_key = f"plant::{plant.lower()}::{limit}::{want_structure}::{want_physchem}"
    cached = await plant_cache_col.find_one({"_id": cache_key})
    if cached:
        # Bump popularity counter so cache hits still reflect real search interest
        try:
            await plants_col.update_one(
                {"name_lc": plant.lower()},
                {
                    "$set": {"last_searched": datetime.now(timezone.utc)},
                    "$inc": {"search_count": 1},
                },
            )
        except Exception:
            pass
        return cached["data"]

    async with httpx.AsyncClient(follow_redirects=True) as client_:
        listing_url = f"{IMPPAT_BASE}/phytochemical/{quote(plant)}"
        html = await _http_get(client_, listing_url)
        listing: List[dict] = []
        if html:
            listing = _dedupe_by_imppat_id(_parse_imppat_listing(html))

        # Truncate to limit before enrichment (enrichment is expensive)
        truncated = listing[:limit]

        # Enrich in parallel batches (max 12 concurrent to stay polite)
        sem = asyncio.Semaphore(12)

        async def _run(row):
            async with sem:
                return await _enrich_imppat_row(client_, row, want_structure, want_physchem)

        enriched = await asyncio.gather(*[_run(r) for r in truncated])

        # LOTUS: name-based simple search — enrich but don't replace IMPPAT
        lotus_url = f"{LOTUS_BASE}/simple?query={quote(plant)}"
        lotus_rows: List[dict] = []
        try:
            r = await client_.get(lotus_url, timeout=25.0, headers={"User-Agent": USER_AGENT})
            if r.status_code == 200:
                data = r.json()
                nps = data.get("naturalProducts", [])[:limit]
                for np_ in nps:
                    lotus_rows.append(
                        {
                            "source": "LOTUS",
                            "compound_name": np_.get("traditional_name") or np_.get("iupac_name"),
                            "lotus_id": np_.get("lotus_id"),
                            "smiles": np_.get("smiles") or np_.get("smiles2D"),
                            "inchi": np_.get("inchi"),
                            "inchi_key": np_.get("inchikey"),
                            "molecular_formula": np_.get("molecular_formula"),
                            "molecular_weight": np_.get("molecular_weight"),
                        }
                    )
        except Exception as e:
            logging.warning(f"LOTUS simple failed: {e}")

    compounds = _merge_and_dedupe(list(enriched), lotus_rows)
    result = {
        "plant": plant,
        "imppat_count": len(enriched),
        "lotus_count": len(lotus_rows),
        "total_listing": len(listing),
        "compounds": compounds,
    }

    # Persist cache in Mongo with TTL and index the plant name for autocomplete
    now = datetime.now(timezone.utc)
    try:
        await plant_cache_col.update_one(
            {"_id": cache_key},
            {"$set": {"data": result, "cached_at": now, "plant": plant}},
            upsert=True,
        )
        if enriched:
            # Index the plant name — only when IMPPAT returned real hits
            await plants_col.update_one(
                {"name_lc": plant.lower()},
                {
                    "$set": {
                        "name": plant,
                        "name_lc": plant.lower(),
                        "last_searched": now,
                        "imppat_hits": len(enriched),
                    },
                    "$inc": {"search_count": 1},
                    "$setOnInsert": {"seeded": False, "first_seen": now},
                },
                upsert=True,
            )
    except Exception as e:
        logging.warning(f"cache/index write failed: {e}")

    return result


# ---------------------------------------------------------------------------
# LOTUS API wrappers
# ---------------------------------------------------------------------------
def _normalize_lotus(nps: list) -> List[dict]:
    out = []
    for np_ in nps:
        out.append(
            {
                "source": "LOTUS",
                "compound_name": np_.get("traditional_name") or np_.get("iupac_name"),
                "lotus_id": np_.get("lotus_id"),
                "smiles": np_.get("smiles") or np_.get("smiles2D"),
                "inchi": np_.get("inchi"),
                "inchi_key": np_.get("inchikey"),
                "molecular_formula": np_.get("molecular_formula"),
                "molecular_weight": np_.get("molecular_weight"),
            }
        )
    return _merge_and_dedupe(out, [])


@api_router.get("/lotus/simple")
async def lotus_simple(query: str = Query(..., min_length=1)):
    url = f"{LOTUS_BASE}/simple?query={quote(query)}"
    async with httpx.AsyncClient() as c:
        r = await c.get(url, timeout=30.0, headers={"User-Agent": USER_AGENT})
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="LOTUS upstream error")
    data = r.json()
    return {
        "query": query,
        "type": data.get("determinedInputType"),
        "compounds": _normalize_lotus(data.get("naturalProducts", [])),
    }


@api_router.get("/lotus/exact")
async def lotus_exact(
    type: Literal["smiles", "inchi"] = Query("smiles"),
    value: str = Query(..., min_length=1),
):
    url = f"{LOTUS_BASE}/exact-structure?type={type}&smiles={quote(value)}"
    async with httpx.AsyncClient() as c:
        r = await c.get(url, timeout=30.0, headers={"User-Agent": USER_AGENT})
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="LOTUS upstream error")
    data = r.json()
    nps = data.get("naturalProducts", []) if isinstance(data, dict) else data
    return {"type": type, "value": value, "compounds": _normalize_lotus(nps or [])}


@api_router.get("/lotus/substructure")
async def lotus_substructure(
    smiles: str = Query(..., min_length=1),
    algorithm: Literal["default", "df", "vf"] = Query("default"),
    max_hits: int = Query(100, ge=1, le=500),
):
    url = (
        f"{LOTUS_BASE}/substructure"
        f"?type={algorithm}&max-hits={max_hits}&smiles={quote(smiles)}"
    )
    async with httpx.AsyncClient() as c:
        r = await c.get(url, timeout=60.0, headers={"User-Agent": USER_AGENT})
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="LOTUS upstream error")
    data = r.json()
    nps = data.get("naturalProducts", []) if isinstance(data, dict) else data
    return {
        "algorithm": algorithm,
        "smiles": smiles,
        "compounds": _normalize_lotus(nps or []),
    }


@api_router.get("/lotus/molweight")
async def lotus_molweight(
    min_mass: float = Query(..., alias="minMass"),
    max_mass: float = Query(..., alias="maxMass"),
    max_hits: int = Query(20, ge=1, le=500, alias="maxHits"),
):
    url = (
        f"{LOTUS_BASE}/molweight"
        f"?minMass={min_mass}&maxMass={max_mass}&maxHits={max_hits}"
    )
    async with httpx.AsyncClient() as c:
        r = await c.get(url, timeout=45.0, headers={"User-Agent": USER_AGENT})
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="LOTUS upstream error")
    data = r.json()
    nps = data.get("naturalProducts", []) if isinstance(data, dict) else data
    return {
        "minMass": min_mass,
        "maxMass": max_mass,
        "compounds": _normalize_lotus(nps or []),
    }


@api_router.get("/health")
async def health():
    return {"status": "ok", "service": "dr-slash"}


# ---------------------------------------------------------------------------
# Compound Standardization (PubChem + LOTUS + ChEBI)
# ---------------------------------------------------------------------------
CHEBI_OLS_URL = "https://www.ebi.ac.uk/ols4/api/search"

_standardize_jobs: dict[str, dict] = {}
_JOB_TTL = 60 * 60  # 1 hour


class StandardizeCompoundIn(BaseModel):
    compound_name: Optional[str] = ""
    smiles: Optional[str] = None
    canonical_smiles: Optional[str] = None
    isomeric_smiles: Optional[str] = None
    inchi: Optional[str] = None
    inchi_key: Optional[str] = None
    molecular_formula: Optional[str] = None
    molecular_weight: Optional[float] = None
    source: Optional[str] = None
    imppat_id: Optional[str] = None
    lotus_id: Optional[str] = None
    pubchem_cid: Optional[int] = None
    retention_time: Optional[float] = None
    plant_part: Optional[str] = None
    reference: Optional[str] = None

    class Config:
        extra = "allow"


class StandardizePayload(BaseModel):
    compounds: List[StandardizeCompoundIn] = Field(default_factory=list)


async def _pubchem_full(client_: httpx.AsyncClient, name: str) -> Optional[dict]:
    """Fetch complete standardization properties (canonical + isomeric SMILES,
    InChI, InChIKey, formula, weight, CID, IUPAC name) via PubChem PUG-REST."""
    props = (
        "SMILES,ConnectivitySMILES,InChI,InChIKey,MolecularFormula,"
        "MolecularWeight,IUPACName"
    )
    url = f"{PUBCHEM_BASE}/name/{quote(name)}/property/{props}/JSON"
    try:
        r = await client_.get(url, timeout=15.0, headers={"User-Agent": USER_AGENT})
    except Exception:
        return None
    if r.status_code != 200:
        return None
    try:
        data = r.json()
    except Exception:
        return None
    entries = data.get("PropertyTable", {}).get("Properties", [])
    if not entries:
        return None
    p = entries[0]
    mw = p.get("MolecularWeight")
    try:
        mw = float(mw) if mw is not None else None
    except (TypeError, ValueError):
        mw = None
    # Newer PubChem returns "SMILES" (isomeric) and "ConnectivitySMILES" (canonical);
    # older responses use CanonicalSMILES/IsomericSMILES.
    canonical = p.get("ConnectivitySMILES") or p.get("CanonicalSMILES")
    isomeric = p.get("SMILES") or p.get("IsomericSMILES")
    return {
        "canonical_smiles": canonical,
        "isomeric_smiles": isomeric or canonical,
        "inchi": p.get("InChI"),
        "inchi_key": p.get("InChIKey"),
        "molecular_formula": p.get("MolecularFormula"),
        "molecular_weight": mw,
        "pubchem_cid": p.get("CID"),
        "iupac_name": p.get("IUPACName"),
    }


async def _chebi_by_name(client_: httpx.AsyncClient, name: str) -> Optional[dict]:
    """Best-effort ChEBI lookup via EBI OLS. Returns {chebi_id, label} or None."""
    try:
        r = await client_.get(
            CHEBI_OLS_URL,
            params={
                "q": name,
                "ontology": "chebi",
                "type": "class",
                "exact": "false",
                "rows": 1,
            },
            timeout=10.0,
            headers={"User-Agent": USER_AGENT},
        )
    except Exception:
        return None
    if r.status_code != 200:
        return None
    try:
        data = r.json()
    except Exception:
        return None
    docs = ((data.get("response") or {}).get("docs")) or []
    if not docs:
        return None
    d = docs[0]
    obo_id = d.get("obo_id") or d.get("short_form") or ""
    if not obo_id.upper().startswith("CHEBI:"):
        return None
    return {"chebi_id": obo_id, "chebi_label": d.get("label")}


def _is_complete(row: dict) -> bool:
    """A row is already fully standardized if it has canonical SMILES, InChIKey,
    formula and weight. Used to skip external calls when data is already good."""
    return bool(
        row.get("canonical_smiles")
        and row.get("inchi_key")
        and row.get("molecular_formula")
        and row.get("molecular_weight")
    )


async def _standardize_one(client_: httpx.AsyncClient, c: dict) -> dict:
    """Standardize a single compound: PubChem primary, LOTUS fallback,
    ChEBI verification. Sets status = 'standardized' | 'manual_review'."""
    out = dict(c)
    name = (out.get("compound_name") or "").strip()

    # Ensure canonical SMILES field is derived from existing `smiles` if the
    # incoming row already has SMILES but no explicit canonical/isomeric split.
    if not out.get("canonical_smiles") and out.get("smiles"):
        out["canonical_smiles"] = out["smiles"]
    if not out.get("isomeric_smiles") and out.get("smiles"):
        out["isomeric_smiles"] = out["smiles"]

    if not name and not _is_complete(out):
        out["status"] = "manual_review"
        return out

    # Skip PubChem for already-standardized rows (IMPPAT/LOTUS with full data).
    if _is_complete(out):
        # Still add ChEBI id best-effort — non-blocking.
        chebi = await _chebi_by_name(client_, name) if name else None
        if chebi:
            out.update(chebi)
            src = out.get("source") or ""
            if "ChEBI" not in src:
                out["source"] = f"{src} + ChEBI".strip(" +") if src else "ChEBI"
        out["status"] = "standardized"
        return out

    # PubChem primary — handles synonyms automatically via name endpoint.
    pub = await _pubchem_full(client_, name)
    if pub:
        for k in (
            "canonical_smiles",
            "isomeric_smiles",
            "inchi",
            "inchi_key",
            "pubchem_cid",
            "iupac_name",
        ):
            if pub.get(k):
                out[k] = pub[k]
        # Prefer isomeric SMILES for the main `smiles` field (better for docking).
        if pub.get("isomeric_smiles") or pub.get("canonical_smiles"):
            out["smiles"] = pub.get("isomeric_smiles") or pub.get("canonical_smiles")
        if not out.get("molecular_formula") and pub.get("molecular_formula"):
            out["molecular_formula"] = pub["molecular_formula"]
        if not out.get("molecular_weight") and pub.get("molecular_weight"):
            out["molecular_weight"] = pub["molecular_weight"]
        src = out.get("source") or ""
        if "PubChem" not in src:
            out["source"] = f"{src} + PubChem".strip(" +") if src else "PubChem"
    else:
        # LOTUS fallback
        lot = await _lotus_by_name(client_, name)
        if lot:
            if lot.get("smiles"):
                out["canonical_smiles"] = out.get("canonical_smiles") or lot["smiles"]
                out["isomeric_smiles"] = out.get("isomeric_smiles") or lot["smiles"]
                out["smiles"] = out.get("smiles") or lot["smiles"]
            if lot.get("inchi") and not out.get("inchi"):
                out["inchi"] = lot["inchi"]
            if lot.get("inchi_key") and not out.get("inchi_key"):
                out["inchi_key"] = lot["inchi_key"]
            if lot.get("molecular_formula") and not out.get("molecular_formula"):
                out["molecular_formula"] = lot["molecular_formula"]
            if lot.get("molecular_weight") and not out.get("molecular_weight"):
                out["molecular_weight"] = lot["molecular_weight"]
            if lot.get("lotus_id") and not out.get("lotus_id"):
                out["lotus_id"] = lot["lotus_id"]
            src = out.get("source") or ""
            if "LOTUS" not in src:
                out["source"] = f"{src} + LOTUS".strip(" +") if src else "LOTUS"

    # ChEBI verification (adds chebi_id when found — never blocks status)
    chebi = await _chebi_by_name(client_, name) if name else None
    if chebi:
        out.update(chebi)
        src = out.get("source") or ""
        if "ChEBI" not in src:
            out["source"] = f"{src} + ChEBI".strip(" +") if src else "ChEBI"

    out["status"] = "standardized" if out.get("canonical_smiles") else "manual_review"
    return out


def _dedupe_standardized(rows: List[dict]) -> List[dict]:
    """Deduplicate standardized rows by InChIKey connectivity layer (first 14
    chars). Duplicates are kept in the list but flagged status='duplicate_removed'
    so the frontend can display them with a strike-through status badge."""
    first_seen: dict[str, str] = {}
    out: List[dict] = []
    for r in rows:
        r = dict(r)
        # Skip existing marker rows
        if r.get("status") == "duplicate_removed":
            out.append(r)
            continue
        key = None
        ik = (r.get("inchi_key") or "").strip()
        if ik:
            key = f"k:{ik.split('-')[0]}"
        else:
            n = (r.get("compound_name") or "").strip().lower()
            if n:
                key = f"n:{n}"
        if key and key in first_seen:
            r["status"] = "duplicate_removed"
            r["duplicate_of"] = first_seen[key]
        elif key:
            first_seen[key] = r.get("compound_name") or ""
        out.append(r)
    return out


def _summary_stats(rows: List[dict]) -> dict:
    stats = {
        "total": len(rows),
        "standardized": 0,
        "manual_review": 0,
        "duplicate_removed": 0,
    }
    for r in rows:
        s = r.get("status") or "standardized"
        stats[s] = stats.get(s, 0) + 1
    return stats


async def _run_standardize_job(job_id: str, compounds: list):
    try:
        async with httpx.AsyncClient() as client_:
            sem = asyncio.Semaphore(6)
            counter = {"n": 0}

            async def _process(c):
                async with sem:
                    result = await _standardize_one(client_, c)
                counter["n"] += 1
                job = _standardize_jobs.get(job_id)
                if job:
                    job["done"] = counter["n"]
                return result

            results = await asyncio.gather(*[_process(c) for c in compounds])
        results = _dedupe_standardized(results)
        job = _standardize_jobs.get(job_id)
        if job:
            job["compounds"] = results
            job["stats"] = _summary_stats(results)
            job["status"] = "done"
            job["done"] = len(compounds)
    except Exception as e:
        job = _standardize_jobs.get(job_id)
        if job:
            job["status"] = "failed"
            job["error"] = str(e)
        logging.exception(f"standardize job {job_id} failed: {e}")


def _gc_standardize_jobs():
    now = time.time()
    stale = [
        jid
        for jid, job in _standardize_jobs.items()
        if now - job.get("started_at", now) > _JOB_TTL
    ]
    for jid in stale:
        _standardize_jobs.pop(jid, None)


@api_router.post("/standardize/start")
async def standardize_start(payload: StandardizePayload):
    _gc_standardize_jobs()
    if not payload.compounds:
        return {"job_id": None, "total": 0}
    job_id = str(uuid.uuid4())
    total = len(payload.compounds)
    _standardize_jobs[job_id] = {
        "done": 0,
        "total": total,
        "status": "running",
        "compounds": None,
        "started_at": time.time(),
    }
    asyncio.create_task(
        _run_standardize_job(job_id, [c.dict() for c in payload.compounds])
    )
    return {"job_id": job_id, "total": total}


@api_router.get("/standardize/status/{job_id}")
async def standardize_status(job_id: str):
    job = _standardize_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    resp = {
        "job_id": job_id,
        "done": job.get("done", 0),
        "total": job.get("total", 0),
        "status": job.get("status"),
        "stats": job.get("stats"),
        "error": job.get("error"),
    }
    if job.get("status") == "done":
        resp["compounds"] = job.get("compounds", [])
    return resp


# ---------------------------------------------------------------------------
# LC-MS compound enrichment (PubChem primary + LOTUS fallback)
# ---------------------------------------------------------------------------
class LCMSCompoundIn(BaseModel):
    compound_name: str = ""
    molecular_formula: Optional[str] = None
    molecular_weight: Optional[float] = None
    retention_time: Optional[float] = None


class LCMSEnrichPayload(BaseModel):
    compounds: List[LCMSCompoundIn] = Field(default_factory=list)


async def _pubchem_by_name(client_: httpx.AsyncClient, name: str) -> Optional[dict]:
    """Look up a compound by name via PubChem PUG-REST and return normalized
    properties, or None if not found."""
    props = (
        "CanonicalSMILES,IsomericSMILES,InChI,InChIKey,MolecularFormula,"
        "MolecularWeight"
    )
    url = f"{PUBCHEM_BASE}/name/{quote(name)}/property/{props}/JSON"
    try:
        r = await client_.get(url, timeout=15.0, headers={"User-Agent": USER_AGENT})
    except Exception as e:
        logging.info(f"PubChem lookup failed for {name!r}: {e}")
        return None
    if r.status_code != 200:
        return None
    try:
        data = r.json()
    except Exception:
        return None
    entries = data.get("PropertyTable", {}).get("Properties", [])
    if not entries:
        return None
    p = entries[0]
    mw = p.get("MolecularWeight")
    try:
        mw = float(mw) if mw is not None else None
    except (TypeError, ValueError):
        mw = None
    return {
        "smiles": (
            p.get("SMILES")
            or p.get("CanonicalSMILES")
            or p.get("IsomericSMILES")
            or p.get("ConnectivitySMILES")
        ),
        "inchi": p.get("InChI"),
        "inchi_key": p.get("InChIKey"),
        "molecular_formula": p.get("MolecularFormula"),
        "molecular_weight": mw,
        "pubchem_cid": p.get("CID"),
    }


async def _lotus_by_name(client_: httpx.AsyncClient, name: str) -> Optional[dict]:
    """Fallback to LOTUS `/simple?query=` and pick the closest name match."""
    url = f"{LOTUS_BASE}/simple?query={quote(name)}"
    try:
        r = await client_.get(url, timeout=20.0, headers={"User-Agent": USER_AGENT})
    except Exception:
        return None
    if r.status_code != 200:
        return None
    try:
        data = r.json()
    except Exception:
        return None
    nps = data.get("naturalProducts") or []
    if not nps:
        return None
    # Prefer an exact case-insensitive traditional-name match; otherwise take the first hit
    target = name.strip().lower()
    hit = next(
        (
            n
            for n in nps
            if (n.get("traditional_name") or "").strip().lower() == target
        ),
        nps[0],
    )
    mw = hit.get("molecular_weight")
    try:
        mw = float(mw) if mw is not None else None
    except (TypeError, ValueError):
        mw = None
    return {
        "smiles": hit.get("smiles") or hit.get("smiles2D"),
        "inchi": hit.get("inchi"),
        "inchi_key": hit.get("inchikey"),
        "molecular_formula": hit.get("molecular_formula"),
        "molecular_weight": mw,
        "lotus_id": hit.get("lotus_id"),
    }


async def _enrich_lcms_row(
    client_: httpx.AsyncClient, row: LCMSCompoundIn
) -> dict:
    base = row.dict()
    name = (base.get("compound_name") or "").strip()
    out = dict(base)
    # Uploaded values are authoritative — never overwrite non-empty user data.
    if not name:
        out["source"] = "LC-MS · missing name"
        out["not_found"] = True
        return out

    # PubChem first (most authoritative for compound names)
    pub = await _pubchem_by_name(client_, name)
    if pub:
        out["source"] = "LC-MS + PubChem"
        for k in ("smiles", "inchi", "inchi_key", "pubchem_cid"):
            if pub.get(k):
                out[k] = pub[k]
        if not out.get("molecular_formula") and pub.get("molecular_formula"):
            out["molecular_formula"] = pub["molecular_formula"]
        if not out.get("molecular_weight") and pub.get("molecular_weight"):
            out["molecular_weight"] = pub["molecular_weight"]
        return out

    # Fallback: LOTUS by name
    lot = await _lotus_by_name(client_, name)
    if lot:
        out["source"] = "LC-MS + LOTUS"
        for k in ("smiles", "inchi", "inchi_key", "lotus_id"):
            if lot.get(k):
                out[k] = lot[k]
        if not out.get("molecular_formula") and lot.get("molecular_formula"):
            out["molecular_formula"] = lot["molecular_formula"]
        if not out.get("molecular_weight") and lot.get("molecular_weight"):
            out["molecular_weight"] = lot["molecular_weight"]
        return out

    # Not found in any database — mark row for manual entry
    out["source"] = "LC-MS · not found"
    out["not_found"] = True
    return out


@api_router.post("/lcms/enrich")
async def lcms_enrich(payload: LCMSEnrichPayload):
    """Enrich a batch of LC-MS compounds with SMILES / InChI / InChIKey and
    molecular formula by looking each name up in PubChem, then LOTUS."""
    if not payload.compounds:
        return {"compounds": [], "found": 0, "not_found": 0}

    async with httpx.AsyncClient() as client_:
        sem = asyncio.Semaphore(8)

        async def _run(row: LCMSCompoundIn) -> dict:
            async with sem:
                return await _enrich_lcms_row(client_, row)

        results = await asyncio.gather(*[_run(r) for r in payload.compounds])

    not_found = sum(1 for r in results if r.get("not_found"))
    return {
        "compounds": results,
        "found": len(results) - not_found,
        "not_found": not_found,
    }


# ---------------------------------------------------------------------------
# Plants autocomplete + cache admin
# ---------------------------------------------------------------------------
@api_router.get("/plants/autocomplete")
async def plants_autocomplete(
    q: str = Query("", max_length=64),
    limit: int = Query(10, ge=1, le=50),
):
    """
    Prefix/contains match against the plants index. The index is seeded with a
    curated list of Indian medicinal plants and auto-learns new names from
    successful /api/plant/search hits.
    """
    q_lc = q.strip().lower()
    if not q_lc:
        # Popular plants — sorted by search_count desc, then alphabetical
        cursor = plants_col.find(
            {}, {"_id": 0, "name": 1, "search_count": 1, "imppat_hits": 1}
        ).sort([("search_count", -1), ("name", 1)]).limit(limit)
        results = await cursor.to_list(length=limit)
        return {"query": q, "matches": results}

    # Prefer prefix matches, then contains
    prefix_re = re.compile(f"^{re.escape(q_lc)}", re.IGNORECASE)
    contains_re = re.compile(re.escape(q_lc), re.IGNORECASE)

    prefix_cursor = plants_col.find(
        {"name_lc": {"$regex": prefix_re}},
        {"_id": 0, "name": 1, "search_count": 1, "imppat_hits": 1},
    ).sort([("search_count", -1), ("name", 1)]).limit(limit)
    prefix_hits = await prefix_cursor.to_list(length=limit)

    if len(prefix_hits) >= limit:
        return {"query": q, "matches": prefix_hits}

    remaining = limit - len(prefix_hits)
    prefix_names = {p["name"] for p in prefix_hits}
    contains_cursor = plants_col.find(
        {
            "name_lc": {"$regex": contains_re},
            "name": {"$nin": list(prefix_names)},
        },
        {"_id": 0, "name": 1, "search_count": 1, "imppat_hits": 1},
    ).sort([("search_count", -1), ("name", 1)]).limit(remaining)
    contains_hits = await contains_cursor.to_list(length=remaining)

    return {"query": q, "matches": prefix_hits + contains_hits}


@api_router.get("/plants/popular")
async def plants_popular(limit: int = Query(8, ge=1, le=50)):
    cursor = (
        plants_col.find(
            {"search_count": {"$gte": 1}},
            {"_id": 0, "name": 1, "search_count": 1},
        )
        .sort([("search_count", -1)])
        .limit(limit)
    )
    return {"plants": await cursor.to_list(length=limit)}


@api_router.get("/")
async def root():
    return {"message": "Dr. / — Network Pharmacology API"}


# ---------------------------------------------------------------------------
# App wiring
# ---------------------------------------------------------------------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def _startup():
    """Seed the plants index and set indexes on first boot."""
    try:
        # TTL index on cache
        await plant_cache_col.create_index("cached_at", expireAfterSeconds=CACHE_TTL_SECONDS)
        await plants_col.create_index("name_lc", unique=True)
        await plants_col.create_index([("search_count", -1)])

        # Seed only if plants collection has no seeded entries
        seeded_count = await plants_col.count_documents({"seeded": True})
        if seeded_count == 0:
            now = datetime.now(timezone.utc)
            docs = [
                {
                    "name": name,
                    "name_lc": name.lower(),
                    "seeded": True,
                    "first_seen": now,
                    "search_count": 0,
                    "imppat_hits": 0,
                }
                for name in PLANTS_SEED
            ]
            try:
                await plants_col.insert_many(docs, ordered=False)
                logger.info(f"Seeded {len(docs)} plants into autocomplete index")
            except Exception as e:  # duplicate key etc.
                logger.info(f"Plant seed insert partial: {e}")
    except Exception as e:
        logger.warning(f"Startup init failed (non-fatal): {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
