"""AI Scientific Report generator using Emergent LLM key (Claude Sonnet 4.5).

Given a full workflow payload (plant, disease, compounds, ADMET, targets,
intersection, PPI, hubs, GO, KEGG, docking, MD), synthesize a publication-ready
IMRAD-style manuscript in Markdown. The report is then converted to HTML / PDF
/ DOCX on demand.
"""
from __future__ import annotations
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior computational pharmacology researcher writing a
publication-ready manuscript. Voice: formal, third-person, precise. Cite methods
with real tool names & versions. Use SI units. Return valid Markdown."""

SECTION_ORDER = [
    "Title", "Abstract", "Introduction",
    "Materials and Methods",
    "Results",
    "Discussion", "Conclusion", "Limitations", "Future Perspectives",
    "References", "Supplementary Tables"
]


def _kbytes(x: Any) -> str:
    """Truncate a large object to a compact JSON summary for LLM ingestion."""
    try:
        s = json.dumps(x, default=str)
        if len(s) < 5000:
            return s
        return s[:5000] + " …truncated"
    except Exception:
        return str(x)[:5000]


def _build_prompt(workflow: Dict[str, Any]) -> str:
    plant = workflow.get("plant_name") or "the studied plant"
    disease = workflow.get("disease_name") or "the studied disease"
    compounds = workflow.get("selected_compounds") or []
    intersect = workflow.get("intersecting_genes") or []
    hubs = workflow.get("hub_ranking") or []
    go = workflow.get("go_terms") or []
    kegg = workflow.get("kegg_pathways") or []
    docking = workflow.get("docking_results") or []
    md_cfg = workflow.get("md_config") or {}

    return f"""
# Task
Write a **publication-ready** IMRAD manuscript in Markdown for a network-pharmacology
study of **{plant}** against **{disease}**.

# Style rules
- Follow this exact section order and use `##` for section titles:
  {', '.join(SECTION_ORDER)}
- Abstract: 250-300 words, structured (Background, Methods, Results, Conclusion).
- Materials and Methods must name real tools: IMPPAT (compounds), admet-ai,
  ChEMBL + BindingDB (target prediction), Open Targets (disease targets),
  STRING (PPI), CytoHubba (hub ranking, mention MCC / Degree / Betweenness /
  Closeness / Radiality / EPC / MNC / DMNC / Stress / Bottleneck), g:Profiler
  (GO), Enrichr KEGG_2021_Human, AutoDock Vina 1.2.3 + Meeko + OpenBabel + RDKit,
  GROMACS with amber99sb-ildn + TIP3P.
- Results section MUST include sub-headings for every module and cite specific
  numbers from the DATA block below. Prefer sentences like "Compound X exhibited
  a docking affinity of −7.4 kcal/mol against Y".
- Discussion: 4-6 paragraphs interpreting biological significance.
- References: at least 15 real, well-known citations, formatted Vancouver style.
- Supplementary Tables: describe (do NOT embed) supplementary tables with
  captions (they will be attached as CSV/XLSX separately).

# Data
```json
{{
  "plant": "{plant}",
  "disease": "{disease}",
  "selected_compounds": {_kbytes(compounds)},
  "intersecting_genes": {_kbytes(intersect)},
  "hub_ranking_top10": {_kbytes(hubs[:10])},
  "top_go_terms": {_kbytes(go[:10])},
  "top_kegg_pathways": {_kbytes(kegg[:10])},
  "docking_results_top10": {_kbytes(docking[:10])},
  "md_config": {_kbytes(md_cfg)}
}}
```
Return **only Markdown**, no code fences, no meta commentary.
""".strip()


async def generate_report(workflow: Dict[str, Any],
                          model: str = "claude-sonnet-4-5-20250929") -> Dict[str, Any]:
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        return {"error": "EMERGENT_LLM_KEY not configured", "markdown": "", "meta": {}}
    session_id = uuid.uuid4().hex
    chat = LlmChat(api_key=api_key, session_id=session_id,
                   system_message=SYSTEM_PROMPT).with_model("anthropic", model)
    prompt = _build_prompt(workflow)
    msg = UserMessage(text=prompt)
    try:
        response = await chat.send_message(msg)
    except Exception as e:
        logger.exception("LLM call failed")
        return {"error": str(e), "markdown": "", "meta": {}}
    md = str(response).strip()
    return {
        "markdown": md,
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "model": f"anthropic/{model}",
            "plant": workflow.get("plant_name"),
            "disease": workflow.get("disease_name"),
            "session_id": session_id,
        },
    }


# ─────────────────────────── Export helpers ──────────────────────────────
def markdown_to_html(md: str, title: str = "PhytoNet AI — Research Report") -> str:
    try:
        import markdown as md_lib
        body = md_lib.markdown(md, extensions=["tables", "toc", "fenced_code"])
    except Exception:
        # Fallback: naive line-break rendering
        body = "<pre>" + md.replace("<", "&lt;") + "</pre>"
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>{title}</title>
<style>
body {{ font-family: 'Georgia', 'Times New Roman', serif; max-width: 820px; margin: 40px auto; padding: 0 24px; color: #0B0B18; line-height: 1.65; }}
h1, h2 {{ font-family: 'Inter', 'Helvetica', sans-serif; color: #5139ED; }}
h2 {{ margin-top: 2.5rem; border-bottom: 1px solid #E7E7F3; padding-bottom: 4px; }}
h3 {{ margin-top: 1.5rem; color: #0B0B18; }}
table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; }}
th, td {{ border: 1px solid #E7E7F3; padding: 6px 10px; text-align: left; font-size: 13px; }}
th {{ background: #FAFAFF; }}
code {{ background: #F1F1FA; padding: 1px 4px; border-radius: 3px; }}
.footer {{ margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #E7E7F3; color: #94A3B8; font-size: 12px; }}
</style></head>
<body>{body}
<p class="footer">Generated by PhytoNet AI · {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}</p>
</body></html>"""


def html_to_pdf(html: str) -> bytes:
    """Very light HTML-to-PDF via reportlab (text-only fallback if weasyprint absent)."""
    try:
        from weasyprint import HTML
        return HTML(string=html).write_pdf()
    except Exception:
        # Fallback: build a simple PDF via reportlab
        import io, re
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import LETTER
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=LETTER)
        w, h = LETTER
        text_only = re.sub(r"<[^>]+>", "", html)
        y = h - 60
        c.setFont("Times-Roman", 10)
        for line in text_only.splitlines():
            for chunk in [line[i:i + 100] for i in range(0, len(line) or 1, 100)]:
                if y < 60:
                    c.showPage(); c.setFont("Times-Roman", 10); y = h - 60
                c.drawString(60, y, chunk)
                y -= 14
        c.save()
        return buf.getvalue()


def markdown_to_docx(md: str) -> bytes:
    """Markdown → DOCX via python-docx (paragraph-level parsing)."""
    from docx import Document
    from docx.shared import Pt
    import io, re
    doc = Document()
    style = doc.styles["Normal"]; style.font.name = "Georgia"; style.font.size = Pt(11)
    for line in md.splitlines():
        s = line.rstrip()
        if not s:
            doc.add_paragraph("")
            continue
        m = re.match(r"^(#{1,4})\s+(.*)$", s)
        if m:
            lvl = min(len(m.group(1)), 4)
            doc.add_heading(m.group(2), level=lvl)
            continue
        if s.startswith("- ") or s.startswith("* "):
            doc.add_paragraph(s[2:], style="List Bullet")
            continue
        doc.add_paragraph(s)
    buf = io.BytesIO(); doc.save(buf); return buf.getvalue()
