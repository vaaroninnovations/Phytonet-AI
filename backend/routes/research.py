"""AI Research Assistant HTTP router.

Endpoints
─────────
  POST   /api/research/projects             → create a new project
  GET    /api/research/projects             → list current user's projects
  GET    /api/research/projects/{pid}       → project with messages + runs
  DELETE /api/research/projects/{pid}       → hard delete

  POST   /api/research/projects/{pid}/message
      Body: {prompt: str, attachments?: [{name, kind, content_preview}]}
      Returns the planner's response (plan | followup | chat), stores the
      user + assistant messages on the project, and creates a pending run
      when a plan is produced.

  POST   /api/research/projects/{pid}/execute/{run_id}
      Kicks off sequential execution of the pending run. Returns immediately
      with the run doc; the client polls `/status/{run_id}` for progress.

  GET    /api/research/projects/{pid}/status/{run_id}
      Poll a run's status + step results.

  POST   /api/research/projects/{pid}/upload
      Multipart file upload (SMILES / CSV / Excel / MOL / SDF). Returns a
      lightweight descriptor the client can attach to the next message.
"""
from __future__ import annotations

import asyncio
import csv
import io
import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import (APIRouter, BackgroundTasks, Depends, File, Form,
                     HTTPException, Request, UploadFile)
from pydantic import BaseModel, Field

import auth_service
import research_service

logger = logging.getLogger(__name__)


class NewProjectPayload(BaseModel):
    title: Optional[str] = Field(None, max_length=200)


class MessagePayload(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=6000)
    attachments: list[dict] | None = None


def _serialize_project(d: dict, include_messages: bool = False) -> dict:
    out = {
        "id":        str(d["_id"]),
        "title":     d.get("title") or "New Research",
        "user_id":   d.get("user_id"),
        "created_at": d.get("created_at").isoformat() if d.get("created_at") else None,
        "updated_at": d.get("updated_at").isoformat() if d.get("updated_at") else None,
        "message_count": len(d.get("messages") or []),
        "run_count": len(d.get("runs") or []),
    }
    if include_messages:
        out["messages"] = d.get("messages") or []
        out["runs"] = [_serialize_run(r) for r in (d.get("runs") or [])]
    return out


def _serialize_run(r: dict) -> dict:
    return {
        "id":     r.get("id"),
        "title":  r.get("title"),
        "status": r.get("status", "pending"),
        "plan":   r.get("plan") or [],
        "results": r.get("results") or [],
        "interpretation": r.get("interpretation"),
        "created_at": r.get("created_at"),
        "completed_at": r.get("completed_at"),
    }


def build_router(db) -> APIRouter:
    router = APIRouter(prefix="/research", tags=["research"])
    col = db["research_projects"]
    require_user = auth_service.make_get_current_user(db)

    @router.post("/projects")
    async def create_project(payload: NewProjectPayload, user=Depends(require_user)):
        now = datetime.now(timezone.utc)
        doc = {
            "user_id": str(user["_id"]),
            "title":   payload.title or "New Research",
            "messages": [],
            "runs":     [],
            "created_at": now,
            "updated_at": now,
        }
        res = await col.insert_one(doc)
        doc["_id"] = res.inserted_id
        return _serialize_project(doc, include_messages=True)

    @router.get("/projects")
    async def list_projects(user=Depends(require_user)):
        cur = col.find({"user_id": str(user["_id"])}).sort("updated_at", -1)
        return [_serialize_project(d) async for d in cur]

    @router.get("/projects/{pid}")
    async def get_project(pid: str, user=Depends(require_user)):
        d = await _fetch_owned(col, pid, user)
        return _serialize_project(d, include_messages=True)

    @router.delete("/projects/{pid}")
    async def delete_project(pid: str, user=Depends(require_user)):
        d = await _fetch_owned(col, pid, user)
        await col.delete_one({"_id": d["_id"]})
        return {"ok": True}

    @router.post("/projects/{pid}/message")
    async def send_message(pid: str, payload: MessagePayload,
                           user=Depends(require_user)):
        d = await _fetch_owned(col, pid, user)
        now_iso = datetime.now(timezone.utc).isoformat()

        # User message
        user_msg = {
            "role": "user", "text": payload.prompt,
            "attachments": payload.attachments or [],
            "created_at": now_iso,
        }
        history = d.get("messages") or []

        planner = await research_service.plan(
            payload.prompt, history, pid, payload.attachments,
        )
        assistant_msg: dict = {"role": "assistant", "created_at": now_iso,
                               "mode": planner.get("mode", "chat")}
        run_doc: Optional[dict] = None
        title_updates: dict = {}

        if planner.get("mode") == "plan" and planner.get("plan"):
            run_id = str(ObjectId())
            run_doc = {
                "id":     run_id,
                "title":  planner.get("title") or "Workflow",
                "status": "pending",
                "reasoning": planner.get("reasoning"),
                "plan":   planner["plan"],
                "results": [],
                "created_at": now_iso,
                "completed_at": None,
            }
            assistant_msg.update({
                "text": planner.get("reasoning") or "Here's the plan I'll run.",
                "run_id": run_id,
                "title":  run_doc["title"],
                "plan":   run_doc["plan"],
            })
            # Auto-set project title on the first plan run
            if (d.get("title") in (None, "", "New Research")
                    and run_doc["title"]):
                title_updates["title"] = run_doc["title"][:120]
        elif planner.get("mode") == "followup":
            assistant_msg["text"] = (planner.get("followup_question")
                                     or "Could you share more detail?")
        else:  # chat
            assistant_msg["text"] = (planner.get("reply")
                                     or "Let me know when you're ready.")

        update = {
            "$push": {"messages": {"$each": [user_msg, assistant_msg]}},
            "$set":  {"updated_at": datetime.now(timezone.utc), **title_updates},
        }
        if run_doc:
            update["$push"]["runs"] = run_doc
        await col.update_one({"_id": d["_id"]}, update)
        return {"user_message": user_msg, "assistant_message": assistant_msg,
                "run": run_doc}

    @router.post("/projects/{pid}/execute/{run_id}")
    async def execute_run(pid: str, run_id: str, bg: BackgroundTasks,
                          user=Depends(require_user)):
        d = await _fetch_owned(col, pid, user)
        run = next((r for r in (d.get("runs") or []) if r.get("id") == run_id),
                   None)
        if not run:
            raise HTTPException(404, "Run not found")
        if run.get("status") == "running":
            raise HTTPException(409, "Run already in progress")
        if run.get("status") == "completed":
            return _serialize_run(run)

        # Mark running
        await col.update_one(
            {"_id": d["_id"], "runs.id": run_id},
            {"$set": {"runs.$.status": "running"}},
        )
        bg.add_task(_execute_in_background, db, str(d["_id"]), pid, run_id)
        run["status"] = "running"
        return _serialize_run(run)

    @router.get("/projects/{pid}/status/{run_id}")
    async def status(pid: str, run_id: str, user=Depends(require_user)):
        d = await _fetch_owned(col, pid, user)
        run = next((r for r in (d.get("runs") or []) if r.get("id") == run_id),
                   None)
        if not run:
            raise HTTPException(404, "Run not found")
        return _serialize_run(run)

    @router.post("/projects/{pid}/upload")
    async def upload(pid: str, file: UploadFile = File(...),
                     user=Depends(require_user)):
        await _fetch_owned(col, pid, user)
        raw = await file.read()
        kind, preview, extracted = _parse_upload(file.filename, raw)
        return {
            "name": file.filename,
            "kind": kind,
            "size": len(raw),
            "content_preview": preview,
            "extracted": extracted,   # e.g. list of SMILES parsed from CSV
        }

    return router


# ─────────────────────── helpers ─────────────────────────────────
async def _fetch_owned(col, pid: str, user) -> dict:
    try:
        oid = ObjectId(pid)
    except Exception:
        raise HTTPException(400, "Invalid project id")
    d = await col.find_one({"_id": oid, "user_id": str(user["_id"])})
    if not d:
        raise HTTPException(404, "Project not found")
    return d


async def _execute_in_background(db, oid_str: str, pid: str, run_id: str):
    """Sequential executor. Streams progress by mutating the run doc as each
    step completes, so the client's poller can render live progress."""
    col = db["research_projects"]
    oid = ObjectId(oid_str)
    d = await col.find_one({"_id": oid})
    run = next(r for r in d.get("runs", []) if r.get("id") == run_id)
    plan_steps = run.get("plan") or []

    # Cross-run context — flat list of every step from earlier COMPLETED runs.
    # Placeholder resolution + admet_predict auto-injection use this when the
    # current run's plan doesn't include a producing step.
    project_context: list[dict] = []
    for prior_run in (d.get("runs") or []):
        if prior_run.get("id") == run_id:
            break
        if prior_run.get("status") != "completed":
            continue
        for r in (prior_run.get("results") or []):
            if r.get("status") == "done":
                project_context.append(r)

    # Also treat uploaded attachments as pseudo-steps so ADMET can auto-inject
    # SMILES from any CSV / SMI / XLSX the user has attached in this project.
    for msg in (d.get("messages") or []):
        for att in (msg.get("attachments") or []):
            smis = att.get("extracted") or []
            if isinstance(smis, list) and smis:
                project_context.append({
                    "id":     f"attachment_{att.get('name','file')}",
                    "status": "done",
                    "tool":   "user_attachment",
                    "result": {"status": "ok",
                               "card":   "compound_table",
                               "data":   {
                                   "smiles_extracted": smis,
                                   "compounds": [{"smiles": s} for s in smis],
                               }},
                })

    results: list[dict] = []
    for idx, step in enumerate(plan_steps):
        step_id = step.get("id")
        # Mark running on this step
        await col.update_one(
            {"_id": oid, "runs.id": run_id},
            {"$set": {
                f"runs.$.plan.{idx}.status":   "running",
                f"runs.$.plan.{idx}.progress": {"stage": "starting",
                                                "detail": "Starting…"},
            }},
        )

        # Progress callback — updates Mongo so the frontend poller sees
        # live sub-status (e.g. "Querying IMPPAT…", "Removing duplicates…").
        async def _step_progress(stage: str, detail: str = "",
                                   _idx=idx):
            try:
                await col.update_one(
                    {"_id": oid, "runs.id": run_id},
                    {"$set": {
                        f"runs.$.plan.{_idx}.progress": {
                            "stage": stage,
                            "detail": detail,
                            "at": datetime.now(timezone.utc).isoformat(),
                        }
                    }},
                )
            except Exception as e:
                logger.warning(f"[research] progress persist failed: {e}")

        result = await research_service.execute_step(
            step, prior_results=results, project_context=project_context,
            progress=_step_progress,
        )
        status = "done" if result.get("status") == "ok" else "error"
        step_out = {
            "id": step_id,
            "label": step.get("label"),
            "tool": step.get("tool"),
            "args": step.get("args"),
            "status": status,
            "result": result,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
        results.append(step_out)
        await col.update_one(
            {"_id": oid, "runs.id": run_id},
            {"$set": {
                f"runs.$.plan.{idx}.status":   status,
                f"runs.$.plan.{idx}.progress": {
                    "stage":  "completed" if status == "done" else "failed",
                    "detail": (result.get("message")
                               if status == "done"
                               else result.get("message") or "Failed"),
                    "at": datetime.now(timezone.utc).isoformat(),
                },
                "runs.$.results": results,
            }},
        )
        # Stop on hard error
        if status == "error":
            break

    # Ask Claude for a natural-language interpretation of the run
    interpretation = ""
    try:
        interpretation = await research_service.interpret(
            {"title": run.get("title"),
             "reasoning": run.get("reasoning"),
             "plan": plan_steps},
            results, pid,
        )
    except Exception as e:
        logger.warning(f"[research] interpret error: {e}")

    final_status = "completed" if all(
        r["status"] == "done" for r in results) else "failed"
    now_iso = datetime.now(timezone.utc).isoformat()
    await col.update_one(
        {"_id": oid, "runs.id": run_id},
        {"$set": {
            "runs.$.status":         final_status,
            "runs.$.interpretation": interpretation,
            "runs.$.completed_at":   now_iso,
        }},
    )
    # Append the interpretation as an assistant message so it stays in chat
    if interpretation:
        await col.update_one(
            {"_id": oid},
            {"$push": {"messages": {
                "role": "assistant",
                "text": interpretation,
                "mode": "interpretation",
                "run_id": run_id,
                "created_at": now_iso,
            }},
             "$set": {"updated_at": datetime.now(timezone.utc)}},
        )


def _parse_upload(name: str, raw: bytes) -> tuple[str, str, list]:
    """Return (kind, preview_text, extracted_list). Extracts SMILES from
    CSV/TXT/XLSX where possible."""
    name_lc = (name or "").lower()
    text = ""
    try:
        text = raw.decode("utf-8", errors="ignore")
    except Exception:
        pass

    extracted: list[str] = []
    kind = "unknown"

    if name_lc.endswith(".smi") or name_lc.endswith(".txt"):
        kind = "smiles"
        for line in text.splitlines():
            s = line.strip().split()
            if s and _looks_like_smiles(s[0]):
                extracted.append(s[0])
    elif name_lc.endswith(".csv"):
        kind = "csv"
        try:
            reader = csv.reader(io.StringIO(text))
            header = next(reader, [])
            smi_idx = next((i for i, h in enumerate(header)
                            if h.strip().lower() in ("smiles", "canonical_smiles")),
                           None)
            for row in reader:
                if smi_idx is not None and smi_idx < len(row):
                    if _looks_like_smiles(row[smi_idx]):
                        extracted.append(row[smi_idx].strip())
                elif row and _looks_like_smiles(row[0]):
                    extracted.append(row[0].strip())
        except Exception:
            pass
    elif name_lc.endswith((".xlsx", ".xls")):
        kind = "excel"
        try:
            import openpyxl  # lazy — only when needed
            wb = openpyxl.load_workbook(io.BytesIO(raw), data_only=True, read_only=True)
            ws = wb.active
            header = [str(c.value or "").strip().lower() for c in next(ws.iter_rows(max_row=1))]
            smi_idx = next((i for i, h in enumerate(header)
                            if h in ("smiles", "canonical_smiles")), None)
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not row:
                    continue
                cand = str(row[smi_idx] if smi_idx is not None else row[0] or "")
                if _looks_like_smiles(cand):
                    extracted.append(cand.strip())
        except Exception as e:
            logger.warning(f"excel parse failed: {e}")
    elif name_lc.endswith((".mol", ".sdf")):
        kind = "sdf"  # backend/openbabel handles it downstream; we keep raw
    elif text:
        kind = "text"

    preview = text[:400] if text else f"<binary {len(raw)} bytes>"
    return kind, preview, extracted[:250]


def _looks_like_smiles(s: str) -> bool:
    s = (s or "").strip()
    if not (3 <= len(s) <= 300):
        return False
    # Cheap heuristic: contains at least one letter typical of SMILES
    return any(c.isalpha() for c in s) and any(c in s for c in "CNOSFPBH()[]=#")
