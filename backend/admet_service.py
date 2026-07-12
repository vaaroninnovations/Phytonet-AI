"""ADMET-AI wrapper with lazy model loading + rule-based drug-likeness rules."""
from __future__ import annotations

import asyncio
import logging
import math
import threading
from typing import Iterable, List, Optional

logger = logging.getLogger(__name__)

_model = None
_lock = threading.Lock()
_predict_lock: Optional[asyncio.Lock] = None


def _get_predict_lock() -> asyncio.Lock:
    """Serialize ADMET-AI predictions — the underlying PyTorch Lightning trainer
    isn't safe under concurrent calls against a shared model singleton."""
    global _predict_lock
    if _predict_lock is None:
        _predict_lock = asyncio.Lock()
    return _predict_lock


def _get_model():
    """Lazily load the ADMET-AI model once. This can take ~20 s on first call."""
    global _model
    with _lock:
        if _model is not None:
            return _model
        try:
            from admet_ai import ADMETModel  # type: ignore

            _model = ADMETModel()
            logger.info("ADMET-AI model loaded")
        except Exception as e:  # pragma: no cover
            logger.exception(f"Failed to load ADMET-AI model: {e}")
            raise
    return _model


# Mapping from raw ADMET-AI DataFrame columns → normalized keys returned to the
# frontend. Only the fields we actually surface are included; anything missing
# from a prediction is left as None.
FIELD_MAP = {
    # Absorption
    "HIA_Hou": "hia",
    "Caco2_Wang": "caco2",
    "Pgp_Broccatelli": "pgp_inhibitor",
    "CYP2C9_Substrate_CarbonMangels": "cyp2c9_substrate",
    "CYP2D6_Substrate_CarbonMangels": "cyp2d6_substrate",
    "CYP3A4_Substrate_CarbonMangels": "cyp3a4_substrate",
    "PAMPA_NCATS": "pampa",
    # Distribution
    "BBB_Martins": "bbb",
    "PPBR_AZ": "ppbr",
    "VDss_Lombardo": "vdss",
    # Metabolism (inhibitor probabilities)
    "CYP1A2_Veith": "cyp1a2_inhibitor",
    "CYP2C9_Veith": "cyp2c9_inhibitor",
    "CYP2C19_Veith": "cyp2c19_inhibitor",
    "CYP2D6_Veith": "cyp2d6_inhibitor",
    "CYP3A4_Veith": "cyp3a4_inhibitor",
    # Excretion
    "Clearance_Hepatocyte_AZ": "clearance_hepatocyte",
    "Clearance_Microsome_AZ": "clearance_microsome",
    "Half_Life_Obach": "half_life",
    # Toxicity
    "AMES": "ames",
    "hERG": "herg",
    "DILI": "dili",
    "Carcinogens_Lagunin": "carcinogenicity",
    "Skin_Reaction": "skin_sensitization",
    "ClinTox": "clintox",
    "LD50_Zhu": "ld50",
    # Physchem
    "molecular_weight": "mw",
    "logP": "logp",
    "tpsa": "tpsa",
    "hydrogen_bond_acceptors": "hba",
    "hydrogen_bond_donors": "hbd",
    "Lipinski": "lipinski_rules",
    "QED": "qed",
    "Bioavailability_Ma": "bioavailability",
    "Solubility_AqSolDB": "solubility",
}


def _num(v) -> Optional[float]:
    try:
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


def _rotatable_bonds(smiles: str) -> Optional[int]:
    try:
        from rdkit import Chem  # type: ignore
        from rdkit.Chem import Descriptors  # type: ignore

        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return None
        return int(Descriptors.NumRotatableBonds(mol))
    except Exception:
        return None


def _drug_likeness(mw, logp, tpsa, hba, hbd, rotb) -> dict:
    """Compute Lipinski/Veber/Ghose/Egan/Muegge pass flags from RDKit descriptors."""
    out: dict = {
        "lipinski_pass": None,
        "veber_pass": None,
        "ghose_pass": None,
        "egan_pass": None,
        "muegge_pass": None,
        "rotatable_bonds": rotb,
    }
    if None in (mw, logp, tpsa, hba, hbd):
        return out
    out["lipinski_pass"] = (
        mw <= 500 and logp <= 5 and hba <= 10 and hbd <= 5
    )
    if rotb is not None:
        out["veber_pass"] = rotb <= 10 and tpsa <= 140
    out["ghose_pass"] = (
        160 <= mw <= 480 and -0.4 <= logp <= 5.6
    )
    out["egan_pass"] = logp <= 5.88 and tpsa <= 131.6
    if rotb is not None:
        out["muegge_pass"] = (
            200 <= mw <= 600
            and -2 <= logp <= 5
            and tpsa <= 150
            and rotb <= 15
            and hba <= 10
            and hbd <= 5
        )
    return out


def _normalize_row(row: dict, smiles: str) -> dict:
    """Convert a raw ADMET-AI DataFrame row into a compact, JSON-safe dict."""
    out = {"admet": {}, "physchem": {}}
    for raw, key in FIELD_MAP.items():
        v = _num(row.get(raw))
        if key in {"mw", "logp", "tpsa", "hba", "hbd", "lipinski_rules", "qed"}:
            out["physchem"][key] = v
        else:
            out["admet"][key] = v
    # Add drug-likeness derived flags
    p = out["physchem"]
    rotb = _rotatable_bonds(smiles)
    out["druglikeness"] = _drug_likeness(
        p.get("mw"), p.get("logp"), p.get("tpsa"), p.get("hba"), p.get("hbd"), rotb
    )
    return out


def _predict_sync(smiles_list: List[str]) -> List[dict]:
    """Blocking prediction — call inside asyncio.to_thread."""
    model = _get_model()
    df = model.predict(smiles=smiles_list)
    results: List[dict] = []
    for i, smi in enumerate(smiles_list):
        try:
            row = df.iloc[i].to_dict()
            results.append(_normalize_row(row, smi))
        except Exception:
            results.append({"admet": {}, "physchem": {}, "druglikeness": {}, "error": True})
    return results


async def predict_batch(smiles_list: List[str]) -> List[dict]:
    """Async wrapper — runs the CPU-bound ADMET-AI inference in a thread.
    Predictions are serialized with an asyncio.Lock because ADMET-AI's shared
    PyTorch Lightning trainer isn't safe under concurrent calls."""
    if not smiles_list:
        return []
    async with _get_predict_lock():
        return await asyncio.to_thread(_predict_sync, smiles_list)


def is_ready() -> bool:
    return _model is not None
