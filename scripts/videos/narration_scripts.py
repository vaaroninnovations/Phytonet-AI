"""Narration scripts for PhytoNet AI module demos.

Timing target: 60-90 seconds per module. gTTS at default speed
gives approximately 150 wpm, so ~150-225 words per script.
"""

PLANT_DATABASE = """
Welcome to the PhytoNet AI Plant Database — your gateway to over four hundred thousand phytochemicals across LOTUS, IMPPAT, and PubChem. In this demo we'll resolve compounds from Withania somnifera, or Ashwagandha, in seconds.

Start by typing the plant's binomial name into the search field. As we submit, PhytoNet AI queries LOTUS live, pulling every compound reported in the literature for this species — no static snapshots, no stale data.

Results stream in with full provenance: molecular formula, exact mass, canonical SMILES, and the LOTUS identifier for each hit. Every row links back to the primary source so peer reviewers can trace evidence.

You can filter by molecular weight, refine by source database, or sort any column. Select the compounds you want to push downstream — target prediction, ADMET, or docking — with a single click.

This is the foundation of every network-pharmacology workflow: reproducible compound resolution with citations built in. Let's explore what happens next.
"""

TARGET_PREDICTION = """
Compound-to-target prediction — the second stage of the network pharmacology workflow. Here we ask: given a selected phytochemical, which human proteins is it likely to bind?

PhytoNet AI queries ChEMBL and BindingDB for known ligand-target interactions, then augments them with similarity-based predictions using Tanimoto scores against annotated bioactive compounds.

Each predicted target ships with a confidence tier — experimentally confirmed, homology inferred, or similarity predicted — plus the evidence trail. UniProt identifiers, target family, and mechanism-of-action are attached automatically.

Filter by confidence, protein family, or organism. Select the targets that matter to your therapeutic hypothesis and forward them to disease-linkage or docking downstream.

Every prediction is explainable — no black-box scores, only citations you can defend in a paper.
"""

DISEASE_TARGETS = """
Disease Target Identification maps a disease of interest to its molecular players. Give PhytoNet AI a condition — for example type-two diabetes — and it returns the full gene panel implicated in disease pathogenesis.

Under the hood we integrate Open Targets, CTD, and NCBI Gene, weighted by evidence strength: genetic association, transcriptomic signature, drug perturbation, or literature co-mention.

Each target arrives with a druggability score, its known modulators, and links to STRING for protein-protein interaction context. You can filter by evidence type, therapeutic area, or minimum score.

Combine these disease targets with the compound-target predictions from the previous stage and PhytoNet AI computes the overlap — your candidate mechanism map, ready for pathway enrichment.
"""

ADMET = """
ADMET Prediction — absorption, distribution, metabolism, excretion, and toxicity. Before spending on wet lab, every compound gets a drug-likeness verdict here.

Paste SMILES, or forward selected compounds from the Plant Database. PhytoNet AI computes over thirty molecular descriptors in a single pass: molecular weight, log-P, hydrogen bond donors and acceptors, polar surface area, rotatable bonds, and rule-of-five compliance.

Predicted properties include intestinal absorption, blood-brain-barrier penetration, CYP-450 substrate profile, hERG cardiotoxicity risk, and Ames mutagenicity. Everything is color-coded — green for favorable, red for risk flags.

Export as a spreadsheet for your medicinal chemistry team, or push the top-ranked compounds forward to molecular docking with one click.
"""

MOLECULAR_DOCKING = """
Molecular Docking — the geometric proof of a compound-target interaction. PhytoNet AI ships a validated AutoDock Vina pipeline with three-dimensional pose overlay.

Load a receptor from RCSB PDB — either by PDB ID or upload your own prepared structure. Load one or more ligands from your compound selection. PhytoNet AI handles receptor preparation, box detection, and Vina execution end-to-end.

Every dock returns a binding affinity score in kilocalories per mole, alongside the docked pose. The interactive three-dimensional viewer overlays the ligand inside the binding pocket — rotate, zoom, and switch between cartoon and surface representations.

For validated targets, redocking with a co-crystal ligand reports the RMSD — confirming the pipeline reproduces the crystal pose to sub-two-angstrom accuracy. This is publication-grade docking, no manual scripting required.
"""

PHYTONET_AI_AGENT = """
The PhytoNet AI Agent orchestrates the entire computational pharmacology workflow with a single natural-language prompt. Tell it your research question — a plant, a disease, and a hypothesis — and it drives every module autonomously.

Under the hood, Claude Sonnet reasons through the plan: search LOTUS for phytochemicals, predict compound targets via ChEMBL and BindingDB, identify disease targets from Open Targets, compute overlap, run ADMET filters, and dock the top-ranked compounds against the primary target.

Progress streams live to your screen — every step announced, every result explainable. Intermediate compound tables, network graphs, and docking scores populate as they complete.

At the end the AI Scientific Report generator synthesises everything into a manuscript-ready draft: methods, numbers, figures, and citations. What used to take a week of manual workflow orchestration now takes twenty minutes. This is network pharmacology, accelerated.
"""

# The long walkthrough is the concatenation of all six, plus intro and outro
LONG_WALKTHROUGH_INTRO = """
Welcome to PhytoNet AI — the explainable artificial intelligence platform for computational network pharmacology. In the next three minutes we'll walk you through every module, from raw plant compound resolution to a publication-ready scientific report.
"""

LONG_WALKTHROUGH_OUTRO = """
That's PhytoNet AI end-to-end — six integrated modules, one AI agent, one report. Every step is explainable, every prediction cited, every workflow reproducible. Sign up at phytonetai.com and get ten free credit nodes to try your first workflow today.
"""


ALL = {
    "01_plant_database":   PLANT_DATABASE,
    "02_target_prediction": TARGET_PREDICTION,
    "03_disease_targets":  DISEASE_TARGETS,
    "04_admet":            ADMET,
    "05_molecular_docking": MOLECULAR_DOCKING,
    "06_ai_agent":         PHYTONET_AI_AGENT,
    "00_walkthrough_intro": LONG_WALKTHROUGH_INTRO,
    "99_walkthrough_outro": LONG_WALKTHROUGH_OUTRO,
}
