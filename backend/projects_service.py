"""PhytoNet AI — Project persistence service.

Stores complete workflow state per authenticated user with:
  • Named projects (Save / Rename / Duplicate / Delete)
  • Version snapshots (per-project history)
  • Auto-save "latest session" (upserted on state change) → resume prompt on login

Mongo collections:
  projects           — {_id, user_id, name, description, workflow_state,
                        current_step, completed_steps, is_autosave, created_at,
                        updated_at}
  project_versions   — {_id, project_id, user_id, label, workflow_state,
                        current_step, completed_steps, created_at}

`workflow_state` is an opaque JSON blob populated by the frontend — the backend
never inspects it and merely echoes it back on load. Kept simple to future-proof
against workflow schema changes.

NOTE ON ROUTE ORDER: FastAPI matches routes in registration order. All literal
/autosave routes MUST be declared before the /{project_id} parameterized route.
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects")

AUTOSAVE_NAME = "__autosave__"
MAX_VERSIONS_PER_PROJECT = 50


class ProjectPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = ""
    workflow_state: Dict[str, Any] = Field(default_factory=dict)
    current_step: Optional[str] = None
    completed_steps: List[str] = Field(default_factory=list)


class ProjectUpdatePayload(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    workflow_state: Optional[Dict[str, Any]] = None
    current_step: Optional[str] = None
    completed_steps: Optional[List[str]] = None


class AutosavePayload(BaseModel):
    workflow_state: Dict[str, Any] = Field(default_factory=dict)
    current_step: Optional[str] = None
    completed_steps: List[str] = Field(default_factory=list)


class SnapshotPayload(BaseModel):
    label: Optional[str] = None


def _serialize(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name"),
        "description": doc.get("description") or "",
        "current_step": doc.get("current_step"),
        "completed_steps": doc.get("completed_steps", []),
        "workflow_state": doc.get("workflow_state", {}),
        "is_autosave": bool(doc.get("is_autosave")),
        "created_at": (doc.get("created_at").isoformat() if doc.get("created_at") else None),
        "updated_at": (doc.get("updated_at").isoformat() if doc.get("updated_at") else None),
        "version_count": doc.get("version_count", 0),
    }


def _serialize_version(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "project_id": str(doc.get("project_id")),
        "label": doc.get("label") or "",
        "current_step": doc.get("current_step"),
        "completed_steps": doc.get("completed_steps", []),
        "workflow_state": doc.get("workflow_state", {}),
        "created_at": (doc.get("created_at").isoformat() if doc.get("created_at") else None),
    }


async def initialize(db):
    await db["projects"].create_index([("user_id", 1), ("updated_at", -1)])
    await db["projects"].create_index([("user_id", 1), ("name", 1)])
    await db["project_versions"].create_index([("project_id", 1), ("created_at", -1)])


def build_router(db, get_current_user):
    """Build the projects router. `get_current_user` is the FastAPI dependency
    that returns the authenticated user document."""
    dep_user = get_current_user

    async def _find_owned(project_id: str, uid: str):
        try:
            oid = ObjectId(project_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid project id")
        doc = await db["projects"].find_one({"_id": oid, "user_id": uid})
        if not doc:
            raise HTTPException(status_code=404, detail="Project not found")
        return doc

    # ═════════════════════ Autosave (literal — must precede /{project_id}) ═════
    @router.get("/autosave/latest")
    async def get_autosave(user=Depends(dep_user)):
        uid = str(user["_id"])
        doc = await db["projects"].find_one({"user_id": uid, "is_autosave": True})
        if not doc:
            return {"autosave": None}
        return {"autosave": _serialize(doc)}

    @router.post("/autosave")
    async def upsert_autosave(payload: AutosavePayload, user=Depends(dep_user)):
        uid = str(user["_id"])
        now = datetime.now(timezone.utc)
        update = {
            "$set": {
                "workflow_state": payload.workflow_state,
                "current_step": payload.current_step,
                "completed_steps": payload.completed_steps,
                "updated_at": now,
                "is_autosave": True,
                "name": AUTOSAVE_NAME,
            },
            "$setOnInsert": {"user_id": uid, "created_at": now},
        }
        await db["projects"].update_one(
            {"user_id": uid, "is_autosave": True}, update, upsert=True
        )
        return {"ok": True, "saved_at": now.isoformat()}

    @router.delete("/autosave")
    async def clear_autosave(user=Depends(dep_user)):
        uid = str(user["_id"])
        await db["projects"].delete_one({"user_id": uid, "is_autosave": True})
        return {"ok": True}

    @router.post("/autosave/promote")
    async def promote_autosave(payload: ProjectPayload, user=Depends(dep_user)):
        """Convert current autosave into a named project."""
        uid = str(user["_id"])
        auto = await db["projects"].find_one({"user_id": uid, "is_autosave": True})
        state = payload.workflow_state or (auto.get("workflow_state", {}) if auto else {})
        cs = payload.completed_steps or (auto.get("completed_steps", []) if auto else [])
        step = payload.current_step or (auto.get("current_step") if auto else None)
        now = datetime.now(timezone.utc)
        doc = {
            "user_id": uid,
            "name": payload.name.strip(),
            "description": (payload.description or "").strip(),
            "workflow_state": state,
            "current_step": step,
            "completed_steps": cs,
            "is_autosave": False,
            "created_at": now,
            "updated_at": now,
            "version_count": 0,
        }
        res = await db["projects"].insert_one(doc)
        doc["_id"] = res.inserted_id
        return _serialize(doc)

    # ═════════════════════ CRUD ═════════════════════
    @router.get("")
    async def list_projects(user=Depends(dep_user)):
        uid = str(user["_id"])
        cursor = db["projects"].find(
            {"user_id": uid, "is_autosave": {"$ne": True}}
        ).sort("updated_at", -1)
        docs = await cursor.to_list(length=200)
        return {"projects": [_serialize(d) for d in docs]}

    @router.post("")
    async def create_project(payload: ProjectPayload, user=Depends(dep_user)):
        uid = str(user["_id"])
        now = datetime.now(timezone.utc)
        doc = {
            "user_id": uid,
            "name": payload.name.strip(),
            "description": (payload.description or "").strip(),
            "workflow_state": payload.workflow_state,
            "current_step": payload.current_step,
            "completed_steps": payload.completed_steps,
            "is_autosave": False,
            "created_at": now,
            "updated_at": now,
            "version_count": 0,
        }
        res = await db["projects"].insert_one(doc)
        doc["_id"] = res.inserted_id
        return _serialize(doc)

    @router.get("/{project_id}")
    async def get_project(project_id: str, user=Depends(dep_user)):
        uid = str(user["_id"])
        doc = await _find_owned(project_id, uid)
        return _serialize(doc)

    @router.put("/{project_id}")
    async def update_project(project_id: str, payload: ProjectUpdatePayload,
                             user=Depends(dep_user)):
        uid = str(user["_id"])
        await _find_owned(project_id, uid)
        update: dict = {"updated_at": datetime.now(timezone.utc)}
        if payload.name is not None:
            update["name"] = payload.name.strip()
        if payload.description is not None:
            update["description"] = payload.description.strip()
        if payload.workflow_state is not None:
            update["workflow_state"] = payload.workflow_state
        if payload.current_step is not None:
            update["current_step"] = payload.current_step
        if payload.completed_steps is not None:
            update["completed_steps"] = payload.completed_steps
        await db["projects"].update_one({"_id": ObjectId(project_id)}, {"$set": update})
        doc = await db["projects"].find_one({"_id": ObjectId(project_id)})
        return _serialize(doc)

    @router.delete("/{project_id}")
    async def delete_project(project_id: str, user=Depends(dep_user)):
        uid = str(user["_id"])
        doc = await _find_owned(project_id, uid)
        await db["projects"].delete_one({"_id": doc["_id"]})
        await db["project_versions"].delete_many({"project_id": doc["_id"]})
        return {"ok": True}

    @router.post("/{project_id}/duplicate")
    async def duplicate_project(project_id: str, user=Depends(dep_user)):
        uid = str(user["_id"])
        src = await _find_owned(project_id, uid)
        now = datetime.now(timezone.utc)
        doc = {
            "user_id": uid,
            "name": f"{src.get('name', 'Project')} (copy)",
            "description": src.get("description", ""),
            "workflow_state": src.get("workflow_state", {}),
            "current_step": src.get("current_step"),
            "completed_steps": src.get("completed_steps", []),
            "is_autosave": False,
            "created_at": now,
            "updated_at": now,
            "version_count": 0,
        }
        res = await db["projects"].insert_one(doc)
        doc["_id"] = res.inserted_id
        return _serialize(doc)

    # ═════════════════════ Versioning ═════════════════════
    @router.post("/{project_id}/snapshot")
    async def snapshot(project_id: str, payload: SnapshotPayload, user=Depends(dep_user)):
        uid = str(user["_id"])
        src = await _find_owned(project_id, uid)
        vdoc = {
            "project_id": src["_id"],
            "user_id": uid,
            "label": (payload.label or f"Snapshot {datetime.now(timezone.utc):%Y-%m-%d %H:%M}"),
            "workflow_state": src.get("workflow_state", {}),
            "current_step": src.get("current_step"),
            "completed_steps": src.get("completed_steps", []),
            "created_at": datetime.now(timezone.utc),
        }
        vres = await db["project_versions"].insert_one(vdoc)
        vdoc["_id"] = vres.inserted_id
        count = await db["project_versions"].count_documents({"project_id": src["_id"]})
        if count > MAX_VERSIONS_PER_PROJECT:
            excess = count - MAX_VERSIONS_PER_PROJECT
            oldest = db["project_versions"].find(
                {"project_id": src["_id"]}
            ).sort("created_at", 1).limit(excess)
            oids = [d["_id"] async for d in oldest]
            if oids:
                await db["project_versions"].delete_many({"_id": {"$in": oids}})
        await db["projects"].update_one(
            {"_id": src["_id"]},
            {"$set": {"updated_at": datetime.now(timezone.utc)},
             "$inc": {"version_count": 1}}
        )
        return _serialize_version(vdoc)

    @router.get("/{project_id}/versions")
    async def list_versions(project_id: str, user=Depends(dep_user)):
        uid = str(user["_id"])
        src = await _find_owned(project_id, uid)
        cursor = db["project_versions"].find(
            {"project_id": src["_id"]}
        ).sort("created_at", -1)
        docs = await cursor.to_list(length=100)
        return {"versions": [_serialize_version(d) for d in docs]}

    @router.post("/{project_id}/restore/{version_id}")
    async def restore_version(project_id: str, version_id: str, user=Depends(dep_user)):
        uid = str(user["_id"])
        src = await _find_owned(project_id, uid)
        try:
            vid = ObjectId(version_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid version id")
        v = await db["project_versions"].find_one({"_id": vid, "project_id": src["_id"]})
        if not v:
            raise HTTPException(status_code=404, detail="Version not found")
        await db["projects"].update_one(
            {"_id": src["_id"]},
            {"$set": {
                "workflow_state": v.get("workflow_state", {}),
                "current_step": v.get("current_step"),
                "completed_steps": v.get("completed_steps", []),
                "updated_at": datetime.now(timezone.utc),
            }}
        )
        doc = await db["projects"].find_one({"_id": src["_id"]})
        return _serialize(doc)

    return router
