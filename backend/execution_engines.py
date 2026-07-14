"""PhytoNet AI — MD execution-engine abstraction.

Frontend-agnostic registry pattern. Adding a new engine (e.g. AWS, RunPod)
requires implementing `render_extra_files()` and registering — the frontend
picks up the new engine automatically via `/api/md/engines`.

Each engine returns a dict of `filename -> content` that is spliced into the
GROMACS project ZIP by `md_service.build_md_project`.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional

_REGISTRY: Dict[str, "BaseEngine"] = {}


def register(engine: "BaseEngine"):
    _REGISTRY[engine.key] = engine


def get(key: str) -> Optional["BaseEngine"]:
    return _REGISTRY.get(key)


def list_engines() -> List[dict]:
    return [e.describe() for e in _REGISTRY.values()]


class BaseEngine:
    key: str = "base"
    label: str = "Base"
    category: str = "generic"          # local | hpc | cloud
    available: bool = True
    description: str = ""
    options_schema: List[dict] = []    # UI hints — [{key,label,type,default,...}]

    def describe(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "category": self.category,
            "available": self.available,
            "description": self.description,
            "options": self.options_schema,
        }

    def render_extra_files(self, compound: Dict[str, Any], target: Dict[str, Any],
                           cfg_dict: Dict[str, Any], opts: Dict[str, Any]) -> Dict[str, str]:
        """Return extra files (path → content) to include in the MD project ZIP."""
        return {}


# ══════════════════════════════ LOCAL ══════════════════════════════
class LocalEngine(BaseEngine):
    key = "local"
    label = "Local Workstation"
    category = "local"
    description = ("Run GROMACS on your own Linux or Windows workstation. "
                   "Includes ready-to-execute Bash and PowerShell drivers.")
    options_schema = [
        {"key": "threads", "label": "OpenMP Threads",  "type": "number",
         "default": 8,  "min": 1, "max": 128,
         "help": "Number of OMP threads for gmx mdrun (-ntomp)."},
        {"key": "use_gpu", "label": "Enable GPU (CUDA)", "type": "bool",
         "default": True, "help": "Attach -nb gpu / -pme gpu when CUDA is available."},
        {"key": "extra_flags", "label": "Extra mdrun flags", "type": "text",
         "default": "-pin on", "help": "Passed verbatim to every gmx mdrun call."},
    ]

    def render_extra_files(self, compound, target, cfg_dict, opts):
        threads = int(opts.get("threads", 8))
        use_gpu = bool(opts.get("use_gpu", True))
        extra = str(opts.get("extra_flags", "") or "").strip()
        gpu_flags = "-nb gpu -pme gpu " if use_gpu else ""
        mdrun_flags = f"-ntomp {threads} {gpu_flags}{extra}".strip()
        readme = f"""# Local Workstation Execution
Runtime: Linux/macOS/WSL/Windows
GROMACS: >= 2021 with CUDA build strongly recommended.

Run:
```bash
bash run_local.sh
```
or on Windows PowerShell:
```powershell
pwsh -File run_md.ps1
```

Default mdrun flags:
    {mdrun_flags}
"""
        run_sh = f"""#!/usr/bin/env bash
# Local execution wrapper — PhytoNet AI
set -euo pipefail
export OMP_NUM_THREADS={threads}
MDRUN_FLAGS="{mdrun_flags}"
export MDRUN_FLAGS
bash run_md.sh
"""
        return {
            "execution/local/README.md": readme,
            "execution/local/run_local.sh": run_sh,
        }


# ══════════════════════════════ HPC SLURM ══════════════════════════════
class HPCSlurmEngine(BaseEngine):
    key = "hpc_slurm"
    label = "HPC Cluster (SLURM)"
    category = "hpc"
    description = ("Submit as a SLURM batch job on an academic/institutional HPC. "
                   "Generates sbatch script with module loads, resource requests, "
                   "and mdrun MPI/OMP mapping.")
    options_schema = [
        {"key": "partition", "label": "SLURM Partition", "type": "text",
         "default": "gpu", "help": "-p / --partition value."},
        {"key": "account", "label": "SLURM Account", "type": "text",
         "default": "", "help": "-A / --account (blank for default)."},
        {"key": "nodes", "label": "Nodes", "type": "number",
         "default": 1, "min": 1, "max": 32},
        {"key": "ntasks_per_node", "label": "MPI Tasks / Node", "type": "number",
         "default": 1, "min": 1, "max": 128},
        {"key": "cpus_per_task", "label": "CPUs / Task (OMP threads)", "type": "number",
         "default": 16, "min": 1, "max": 256},
        {"key": "memory_gb", "label": "Memory (GB)", "type": "number",
         "default": 64, "min": 8, "max": 2048},
        {"key": "gpus", "label": "GPUs", "type": "number",
         "default": 1, "min": 0, "max": 8,
         "help": "--gres=gpu:N. Set 0 for CPU-only nodes."},
        {"key": "walltime", "label": "Walltime (HH:MM:SS)", "type": "text",
         "default": "24:00:00"},
        {"key": "modules", "label": "module load commands", "type": "text",
         "default": "gromacs/2023 cuda/12.1 openmpi/4.1",
         "help": "Space-separated modules — one 'module load' per token."},
        {"key": "email", "label": "Notify Email", "type": "text",
         "default": "", "help": "SBATCH --mail-user (blank to disable)."},
    ]

    def render_extra_files(self, compound, target, cfg_dict, opts):
        partition   = opts.get("partition") or "gpu"
        account     = opts.get("account") or ""
        nodes       = int(opts.get("nodes", 1))
        ntasks_pn   = int(opts.get("ntasks_per_node", 1))
        cpus_pt     = int(opts.get("cpus_per_task", 16))
        mem_gb      = int(opts.get("memory_gb", 64))
        gpus        = int(opts.get("gpus", 1))
        walltime    = opts.get("walltime") or "24:00:00"
        modules     = [m for m in (opts.get("modules") or "gromacs").split() if m]
        email       = opts.get("email") or ""

        job_name    = f"phytonet_md_{(target.get('gene_symbol') or 'x')}"[:32]
        gres_line   = f"#SBATCH --gres=gpu:{gpus}\n" if gpus > 0 else ""
        account_l   = f"#SBATCH --account={account}\n" if account else ""
        email_lines = f"#SBATCH --mail-type=END,FAIL\n#SBATCH --mail-user={email}\n" if email else ""
        module_lines = "\n".join(f"module load {m}" for m in modules)

        gpu_flags = "-nb gpu -pme gpu -bonded gpu -update gpu " if gpus > 0 else ""
        mpi_prefix = f"srun --mpi=pmix -n {nodes * ntasks_pn} " if (nodes * ntasks_pn) > 1 else ""

        sbatch = f"""#!/bin/bash
#SBATCH --job-name={job_name}
#SBATCH --partition={partition}
{account_l}#SBATCH --nodes={nodes}
#SBATCH --ntasks-per-node={ntasks_pn}
#SBATCH --cpus-per-task={cpus_pt}
#SBATCH --mem={mem_gb}G
{gres_line}#SBATCH --time={walltime}
#SBATCH --output=slurm-%j.out
#SBATCH --error=slurm-%j.err
{email_lines}
set -euo pipefail
echo "[SLURM] Job $SLURM_JOB_ID on $SLURM_NODELIST"
echo "[SLURM] Working dir: $SLURM_SUBMIT_DIR"
cd "$SLURM_SUBMIT_DIR"

{module_lines}
export OMP_NUM_THREADS={cpus_pt}
GMX="gmx_mpi"
if ! command -v $GMX >/dev/null 2>&1; then GMX="gmx"; fi

# ── ligand params ─────────────────────────────────────────────
if [ ! -f ligand.acpype/LIG_GMX.gro ]; then
  acpype -i ligand.mol2 -b LIG -c gas
fi

# ── topology & preparation ────────────────────────────────────
$GMX pdb2gmx -f receptor.pdb -o protein.gro -p topol.top -water {cfg_dict.get('water_model','tip3p')} -ff {cfg_dict.get('force_field','amber99sb-ildn')} -ignh
python merge_topology.py
$GMX editconf -f complex.gro -o complex_box.gro -bt {cfg_dict.get('box_type','dodecahedron')} -d {cfg_dict.get('box_padding_nm',1.0)} -c
$GMX solvate -cp complex_box.gro -cs spc216.gro -p topol.top -o complex_solv.gro
$GMX grompp -f ions.mdp -c complex_solv.gro -p topol.top -o ions.tpr -maxwarn 2
echo "SOL" | $GMX genion -s ions.tpr -o complex_ions.gro -p topol.top -pname {cfg_dict.get('positive_ion','NA')} -nname {cfg_dict.get('negative_ion','CL')} -conc {cfg_dict.get('ion_concentration',0.15)} -neutral

# ── EM / NVT / NPT / production ──────────────────────────────
$GMX grompp -f minim.mdp -c complex_ions.gro -p topol.top -o em.tpr -maxwarn 2
{mpi_prefix}$GMX mdrun -deffnm em {gpu_flags}
$GMX grompp -f nvt.mdp   -c em.gro  -r em.gro  -p topol.top -o nvt.tpr -n index.ndx -maxwarn 2
{mpi_prefix}$GMX mdrun -deffnm nvt {gpu_flags}
$GMX grompp -f npt.mdp   -c nvt.gro -r nvt.gro -t nvt.cpt -p topol.top -o npt.tpr -n index.ndx -maxwarn 2
{mpi_prefix}$GMX mdrun -deffnm npt {gpu_flags}
$GMX grompp -f md.mdp    -c npt.gro -t npt.cpt -p topol.top -o md.tpr  -n index.ndx -maxwarn 2
{mpi_prefix}$GMX mdrun -deffnm md {gpu_flags}
"""

        readme = f"""# HPC (SLURM) Execution Package
Submit with:
```bash
sbatch submit.sh
```

Requested resources:
- Nodes: {nodes} × ntasks {ntasks_pn} × cpus-per-task {cpus_pt}
- Memory: {mem_gb} GB
- GPUs:   {gpus}
- Wall:   {walltime}
- Partition: {partition}{" — Account " + account if account else ""}

Modules loaded: {" ".join(modules)}

Adjust `submit.sh` to match your cluster (module names & gpu flags vary).
"""
        return {
            "execution/hpc_slurm/README.md": readme,
            "execution/hpc_slurm/submit.sh": sbatch,
        }


# ══════════════════════════════ CLOUD ══════════════════════════════
class CloudEngine(BaseEngine):
    key = "cloud"
    label = "Cloud GPU (Preview)"
    category = "cloud"
    available = True     # API preview — no actual execution
    description = ("Design-only preview. Generates provider-agnostic launch "
                   "specifications for AWS, Azure, GCP, RunPod, Lambda Labs. "
                   "Actual cloud dispatch will be added in a future release.")
    options_schema = [
        {"key": "provider", "label": "Provider", "type": "select",
         "options": ["aws", "azure", "gcp", "runpod", "lambda"],
         "default": "aws"},
        {"key": "instance_type", "label": "Instance Type", "type": "text",
         "default": "g5.2xlarge",
         "help": "AWS: g5.2xlarge · GCP: a2-highgpu-1g · Azure: NC6s_v3 · RunPod: A100-40G."},
        {"key": "region", "label": "Region", "type": "text", "default": "us-east-1"},
        {"key": "docker_image", "label": "Container Image", "type": "text",
         "default": "gromacs/gromacs:2023.1"},
        {"key": "spot", "label": "Spot / Preemptible", "type": "bool", "default": True},
        {"key": "gpu_type", "label": "GPU Type", "type": "text", "default": "A10G"},
    ]

    def render_extra_files(self, compound, target, cfg_dict, opts):
        provider = opts.get("provider", "aws")
        instance = opts.get("instance_type", "g5.2xlarge")
        region   = opts.get("region", "us-east-1")
        image    = opts.get("docker_image", "gromacs/gromacs:2023.1")
        spot     = bool(opts.get("spot", True))
        gpu_type = opts.get("gpu_type", "A10G")

        import json as _json
        spec = {
            "phytonet_execution_spec_version": "0.1",
            "provider": provider,
            "region": region,
            "instance_type": instance,
            "gpu": {"type": gpu_type, "count": 1},
            "spot": spot,
            "container": {"image": image, "entrypoint": "bash run_md.sh"},
            "environment": {
                "OMP_NUM_THREADS": "8",
                "GMX_MAXBACKUP": "-1",
            },
            "storage": {"scratch_gb": 200, "persistent_gb": 50},
            "workflow_state": {
                "compound": compound.get("name"),
                "target":   target.get("gene_symbol") or target.get("uniprot_id"),
                "production_ns": cfg_dict.get("production_ns"),
                "force_field": cfg_dict.get("force_field"),
            },
            "future_dispatch_endpoints": {
                "aws":    "s3://phytonet-jobs/{job_id}/  +  AWS Batch (planned)",
                "azure":  "Azure Batch Service (planned)",
                "gcp":    "Vertex AI Custom Jobs (planned)",
                "runpod": "https://api.runpod.io/v2/dispatch (planned)",
                "lambda": "https://cloud.lambdalabs.com/api/v1/instance-operations/launch (planned)",
            },
        }
        readme = (
            f"# Cloud GPU Preview — {provider.upper()}\n\n"
            "This directory contains a *provider-agnostic execution specification* "
            "for future automated cloud dispatch. The current release generates the "
            "spec and leaves execution to the user.\n\n"
            f"- **Provider:** {provider}\n"
            f"- **Instance:** {instance}  (region {region})\n"
            f"- **GPU:** {gpu_type}  |  **Spot:** {spot}\n"
            f"- **Container:** {image}\n\n"
            "## Manual dispatch guides (until API preview lands)\n"
            "- AWS: launch `EC2 g5.2xlarge` with the Deep Learning AMI, `docker run "
            f"-v $PWD:/work {image} bash /work/run_md.sh`.\n"
            "- Azure: `NC6s_v3` on Ubuntu 22.04 + CUDA 12.\n"
            "- GCP: `a2-highgpu-1g` with the GROMACS Cloud VM image.\n"
            "- RunPod / Lambda Labs: any A10G / A100 pod.\n"
        )
        return {
            f"execution/cloud/{provider}/README.md": readme,
            f"execution/cloud/{provider}/dispatch.json": _json.dumps(spec, indent=2),
        }


# Register on import
register(LocalEngine())
register(HPCSlurmEngine())
register(CloudEngine())
