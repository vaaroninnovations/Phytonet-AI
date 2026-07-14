"""AI Scientific Report generation & multi-format download."""
from __future__ import annotations
import uuid
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

import report_service


class ReportGenerateRequest(BaseModel):
    workflow: Dict[str, Any]
    model: str = "claude-sonnet-4-5-20250929"


def build_router() -> APIRouter:
    router = APIRouter(prefix="/api", tags=["report"])
    cache: Dict[str, Dict[str, Any]] = {}

    @router.post("/report/generate")
    async def report_generate(payload: ReportGenerateRequest):
        result = await report_service.generate_report(payload.workflow, model=payload.model)
        if result.get("error"):
            raise HTTPException(status_code=500, detail=result["error"])
        rid = uuid.uuid4().hex
        cache[rid] = result
        return {"report_id": rid, "markdown": result["markdown"], "meta": result["meta"]}

    @router.get("/report/download/{report_id}")
    async def report_download(report_id: str, fmt: str = "md"):
        rec = cache.get(report_id)
        if not rec:
            raise HTTPException(status_code=404, detail="Report not found or expired")
        md = rec["markdown"]
        title = rec.get("meta", {}).get("plant") or "PhytoNet AI Report"
        if fmt == "md":
            return Response(content=md, media_type="text/markdown",
                            headers={"Content-Disposition": "attachment; filename=report.md"})
        if fmt == "html":
            html = report_service.markdown_to_html(md, title=f"{title} — Research Report")
            return Response(content=html, media_type="text/html",
                            headers={"Content-Disposition": "attachment; filename=report.html"})
        if fmt == "pdf":
            html = report_service.markdown_to_html(md, title=f"{title} — Research Report")
            pdf = report_service.html_to_pdf(html)
            return Response(content=pdf, media_type="application/pdf",
                            headers={"Content-Disposition": "attachment; filename=report.pdf"})
        if fmt == "docx":
            docx_bytes = report_service.markdown_to_docx(md, title=f"{title} — Research Report")
            return Response(content=docx_bytes,
                            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            headers={"Content-Disposition": "attachment; filename=report.docx"})
        raise HTTPException(status_code=400, detail=f"Unsupported format {fmt}")

    return router
