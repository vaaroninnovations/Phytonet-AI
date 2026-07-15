"""PhytoNet AI — startup dependency verification.

Runs once at backend startup. Verifies:
  • System binaries: vina, obabel, gmx (optional)
  • Python libs   : rdkit, meeko, vina (Python bindings — optional)

Behaviour:
  • Missing REQUIRED dep  → sets DEPS_STATUS[key]["ok"] = False, logs a
    diagnostic. `/api/docking/run` and `/api/md/build` inspect DEPS_STATUS
    and refuse the request with HTTP 503 + a clear message rather than
    crashing mid-batch with `[Errno 2] No such file or directory: vina`.
  • Missing OPTIONAL dep  → logs a warning; the endpoint may still run
    with reduced functionality (e.g. GROMACS is required only for MD).

Configuration (env vars, all optional):
  VINA_EXECUTABLE     — override path to `vina` binary (default: shutil.which)
  OBABEL_EXECUTABLE   — override path to `obabel`
  GROMACS_EXECUTABLE  — override path to `gmx`
"""
from __future__ import annotations
import logging
import os
import shutil
import subprocess
from dataclasses import dataclass, field
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# Populated by check_all(). Consumed by routes that need a hard-fail
# short-circuit (docking/run, md/build).
DEPS_STATUS: Dict[str, "DepStatus"] = {}


@dataclass
class DepStatus:
    key: str
    kind: str                    # "binary" | "python"
    required: bool
    ok: bool = False
    path: Optional[str] = None
    version: Optional[str] = None
    error: Optional[str] = None


def _resolve_binary(env_var: str, default_name: str) -> Optional[str]:
    """Resolve a system binary path.

    Priority:
      1. Env-var override (absolute path, or a name to look up on PATH)
      2. shutil.which()
      3. Fallback well-known locations for Python-wheel-bundled binaries
         (e.g. openbabel-wheel installs `obabel` under sys.executable's dir).
    """
    override = os.environ.get(env_var, "").strip()
    if override:
        return override if os.path.isabs(override) else shutil.which(override)
    p = shutil.which(default_name)
    if p:
        return p
    # Fallback: same directory as the current Python interpreter (works for
    # openbabel-wheel etc. which install CLIs into $VENV/bin).
    import sys
    from pathlib import Path
    candidate = Path(sys.executable).parent / default_name
    if candidate.exists() and os.access(candidate, os.X_OK):
        return str(candidate)
    return None


def _run(cmd: list, timeout: int = 5) -> tuple[int, str]:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout + r.stderr).strip()
    except FileNotFoundError:
        return 127, f"{cmd[0]}: not found"
    except subprocess.TimeoutExpired:
        return 124, f"{cmd[0]}: timed out"
    except Exception as e:  # pragma: no cover
        return 1, str(e)


def _check_binary(key: str, env_var: str, default_name: str, version_args: list,
                  required: bool) -> DepStatus:
    st = DepStatus(key=key, kind="binary", required=required)
    st.path = _resolve_binary(env_var, default_name)
    if not st.path or not shutil.which(st.path):
        st.error = f"{default_name} binary not found (env {env_var} unset & not on PATH)"
        return st
    rc, out = _run([st.path] + version_args)
    if rc != 0 and rc != 127:
        # some tools (obabel -H) exit non-zero for help but still print version
        st.version = (out.splitlines() or ["unknown"])[0][:200]
    else:
        st.version = (out.splitlines() or ["unknown"])[0][:200]
    st.ok = True
    return st


def _check_python(key: str, import_name: str, required: bool,
                  version_attr: str = "__version__") -> DepStatus:
    st = DepStatus(key=key, kind="python", required=required)
    try:
        mod = __import__(import_name)
        st.version = str(getattr(mod, version_attr, "unknown"))
        st.ok = True
    except Exception as e:
        st.error = f"{import_name} import failed: {e}"
    return st


def _attempt_apt_install(pkgs: list[str]) -> bool:
    """Best-effort `apt-get install` fallback for the preview pod.

    Only runs when AUTO_INSTALL_MISSING_DEPS is truthy (default "on" so the
    preview pod self-heals after a container rebuild while /app/Dockerfile
    hasn't been shipped to prod yet). Silent on any failure — the caller
    still enforces the missing-dep short-circuit via /api/deps/status.
    """
    flag = os.environ.get("AUTO_INSTALL_MISSING_DEPS", "on").strip().lower()
    if flag not in {"1", "on", "true", "yes"}:
        return False
    if not shutil.which("apt-get"):
        return False
    try:
        logger.warning(
            "[deps] Attempting apt-get install %s (self-heal — ship /app/Dockerfile "
            "to make this permanent). Set AUTO_INSTALL_MISSING_DEPS=off to disable.",
            " ".join(pkgs),
        )
        env = {**os.environ, "DEBIAN_FRONTEND": "noninteractive"}
        subprocess.run(["apt-get", "install", "-y", "--no-install-recommends", *pkgs],
                       check=True, timeout=240, env=env,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        logger.info("[deps] apt-get install %s → OK", " ".join(pkgs))
        return True
    except Exception as e:
        logger.warning("[deps] apt-get self-heal failed: %s", e)
        return False


# Map dep-key → apt package name (subset that ships on Debian/Ubuntu with the
# executables we need). Only used by the preview-pod self-heal path.
_APT_PACKAGE_FOR_DEP = {
    "vina":   "autodock-vina",
    "obabel": "openbabel",
    "gmx":    "gromacs",
}


def check_all() -> Dict[str, DepStatus]:
    """Run all checks. Populates DEPS_STATUS and returns it."""
    global DEPS_STATUS
    DEPS_STATUS = {
        # System binaries
        "vina":     _check_binary("vina",   "VINA_EXECUTABLE",    "vina",   ["--version"], required=True),
        "obabel":   _check_binary("obabel", "OBABEL_EXECUTABLE",  "obabel", ["-V"],        required=True),
        "gmx":      _check_binary("gmx",    "GROMACS_EXECUTABLE", "gmx",    ["--version"], required=False),
        # Python libs
        "rdkit":    _check_python("rdkit",  "rdkit", required=True, version_attr="__version__"),
        "meeko":    _check_python("meeko",  "meeko", required=True),
        "vina_py":  _check_python("vina_py", "vina", required=False),   # optional Python bindings
    }

    # Self-heal: if any *required binary* is missing, attempt to install its
    # apt package and re-check. Keeps the preview pod usable across rebuilds
    # while the Dockerfile is still in the deploy pipeline.
    missing_bins = [k for k, s in DEPS_STATUS.items()
                    if s.kind == "binary" and not s.ok and k in _APT_PACKAGE_FOR_DEP]
    if missing_bins:
        pkgs = [_APT_PACKAGE_FOR_DEP[k] for k in missing_bins]
        if _attempt_apt_install(pkgs):
            # Re-check only the previously-missing binaries
            for k in missing_bins:
                if k == "vina":
                    DEPS_STATUS[k] = _check_binary("vina", "VINA_EXECUTABLE", "vina", ["--version"], required=True)
                elif k == "obabel":
                    DEPS_STATUS[k] = _check_binary("obabel", "OBABEL_EXECUTABLE", "obabel", ["-V"], required=True)
                elif k == "gmx":
                    DEPS_STATUS[k] = _check_binary("gmx", "GROMACS_EXECUTABLE", "gmx", ["--version"], required=False)

    for st in DEPS_STATUS.values():
        if st.ok:
            logger.info("[deps] ✓ %-8s %s (%s)", st.key, st.version, st.path or st.kind)
        elif st.required:
            logger.error(
                "[deps] ✗ REQUIRED %s missing — %s\n"
                "         → Add the corresponding package to the backend image "
                "(see /app/Dockerfile) and rebuild.\n"
                "         → Or set the *_EXECUTABLE env var to an existing path.",
                st.key, st.error,
            )
        else:
            logger.warning("[deps] ~ OPTIONAL %s missing — %s", st.key, st.error)

    return DEPS_STATUS


def get_missing_required() -> list[str]:
    return [k for k, s in DEPS_STATUS.items() if s.required and not s.ok]


def selftest_vina() -> DepStatus:
    """Run `vina --help` at startup as a functional smoke-test."""
    st = DEPS_STATUS.get("vina")
    if not st or not st.ok:
        return st or DepStatus(key="vina", kind="binary", required=True,
                                error="vina not present")
    rc, out = _run([st.path, "--help"], timeout=6)
    if rc != 0:
        st.ok = False
        st.error = f"vina --help returned {rc}: {out[:200]}"
        logger.error("[deps] Vina self-test FAILED: %s", st.error)
    else:
        logger.info("[deps] Vina --help OK (v %s)", (st.version or "?").split()[-1])
    return st


def vina_path() -> str:
    """Public helper — always returns a resolved absolute path or raises."""
    st = DEPS_STATUS.get("vina")
    if st and st.ok and st.path:
        return st.path
    # Fallback resolution (in case check_all wasn't called yet)
    p = _resolve_binary("VINA_EXECUTABLE", "vina")
    if p:
        return p
    raise FileNotFoundError(
        "AutoDock Vina is not installed. Add `autodock-vina` to the backend "
        "Docker image or set VINA_EXECUTABLE to the binary path."
    )
