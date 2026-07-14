"""Route modules for the PhytoNet AI backend.

Each module exposes a `build_router()` factory returning a FastAPI `APIRouter`
already scoped to the correct URL prefix. Modules that need shared
infrastructure (db, caches, config) receive it via the factory arguments —
this keeps them decoupled from `server.py`'s module-level state so they can
be unit-tested in isolation.
"""
