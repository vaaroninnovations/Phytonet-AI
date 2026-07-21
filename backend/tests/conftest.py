"""Pytest shared configuration for PhytoNet AI backend tests.

Centralizes test-only credentials and base URLs so individual test modules
never hardcode secrets. Falls back to the same admin credentials that the
backend seeds on startup (see `admin_seed.py`) so local `pytest` runs still
work without extra setup, but CI / prod environments can override via env.
"""
from __future__ import annotations
import os

# Base URL for hitting the running FastAPI instance.
# Individual tests read these via `from conftest import TEST_BASE_URL, ...`.
TEST_BASE_URL: str = (
    os.environ.get("PHYTONET_TEST_BASE_URL")
    or os.environ.get("BASE_URL")
    or os.environ.get("REACT_APP_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")

# Admin credentials used to exercise auth-gated endpoints. Defaults match the
# `ADMIN_EMAIL` / `ADMIN_PASSWORD` seed in `/app/backend/.env`.
TEST_ADMIN_EMAIL: str = os.environ.get("PHYTONET_TEST_ADMIN_EMAIL", "admin@phytonet.ai")
TEST_ADMIN_PASSWORD: str = os.environ.get("PHYTONET_TEST_ADMIN_PASSWORD", "Admin123!")
