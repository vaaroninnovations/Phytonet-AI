# PhytoNet AI — Backend runtime image
# ------------------------------------------------------------------
# Includes the system-level scientific tooling required by the
# docking pipeline so that runtime installation is never needed.
#
# Build:   docker build -t phytonet-backend .
# Verify:  docker run --rm phytonet-backend vina --help
#
# System deps:
#   - autodock-vina    → /usr/bin/vina           (used by docking_service.py)
#   - openbabel        → /usr/bin/obabel         (PDB / PDBQT / ligand prep)
#   - build-essential + swig + libboost-*        (needed to compile RDKit / Meeko wheels
#                                                 that don't ship prebuilt for arm64)
#
# NOTE: Molecular Dynamics is a downloadable GROMACS project generator only.
# The image no longer bundles GROMACS itself — users run the generated
# project on their own workstation / HPC / cloud VM.
#
# Python deps: rdkit, meeko, vina (pip), emergentintegrations — all in requirements.txt

FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    # Explicit path so docking_service.py doesn't rely on PATH lookup
    VINA_EXECUTABLE=/usr/bin/vina \
    OBABEL_EXECUTABLE=/usr/bin/obabel

# ─────────────────────────── System dependencies ───────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        autodock-vina \
        openbabel \
        libopenbabel-dev \
        build-essential \
        swig \
        libboost-all-dev \
        libeigen3-dev \
        curl \
        ca-certificates \
        && rm -rf /var/lib/apt/lists/*

# ─────────────────────────── Build-time sanity check ───────────────────────────
# Verify that the docking binaries are present in PATH. Fails the build
# early if the apt install layer changed and dropped a package.
RUN set -eux; \
    which vina;   vina --version | head -1; \
    which obabel; obabel -H 2>&1 | head -1

# ─────────────────────────── Python deps ───────────────────────────
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir emergentintegrations \
        --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/

# ─────────────────────────── App code ───────────────────────────
COPY backend/ /app/backend/

# ─────────────────────────── Runtime ───────────────────────────
EXPOSE 8001
# Fails fast on the very first boot if the container was mis-built.
HEALTHCHECK --interval=30s --timeout=6s --start-period=15s --retries=3 \
    CMD python -c "import shutil,sys;sys.exit(0 if shutil.which('vina') else 1)"

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
