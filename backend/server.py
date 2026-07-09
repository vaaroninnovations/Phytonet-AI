from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
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

    result = {
        "plant": plant,
        "imppat_count": len(enriched),
        "lotus_count": len(lotus_rows),
        "total_listing": len(listing),
        "compounds": enriched + lotus_rows,
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
    return out


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
