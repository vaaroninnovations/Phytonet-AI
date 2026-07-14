// ProjectContext — Save / Resume / Autosave for the PhytoNet workflow.
//
// Responsibilities:
//   • Aggregate all downstream context (Network, Results, Selection, Workflow)
//     into a single serializable snapshot.
//   • Provide `saveAs(name)`, `save()`, `load(id)`, `duplicate(id)`, `rename(id,
//     name)`, `remove(id)`, `snapshot(label)`.
//   • Auto-save after every state change (debounced 2s) — writes to a per-user
//     "autosave" slot which is offered on next login as "Resume previous
//     session".
//   • On login, if an autosave exists, sets `resumePrompt=true` — the app
//     renders a modal offering Resume / Discard.
//
// Design note: the workflow_state blob is opaque to the backend; only the
// frontend understands its shape. This keeps schema evolution painless.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNetwork } from "@/context/NetworkContext";
import { useResults } from "@/context/ResultsContext";
import { useSelection } from "@/context/SelectionContext";
import { useWorkflow, WORKFLOW_STEPS } from "@/context/WorkflowContext";
import {
  createProject, updateProject, listProjects, getProject, deleteProject,
  duplicateProject, snapshotProject, listVersions, restoreVersion,
  getAutosave, upsertAutosave, clearAutosave, promoteAutosave,
} from "@/lib/api";

const ProjectContext = createContext(null);
const AUTOSAVE_DEBOUNCE_MS = 2000;
const STATE_VERSION = 1;

// Derive the "current step" as the first non-completed workflow step.
function deriveCurrentStep(completedIds) {
  const done = new Set(completedIds);
  for (const s of WORKFLOW_STEPS) {
    if (!done.has(s.id)) return s.id;
  }
  return WORKFLOW_STEPS[WORKFLOW_STEPS.length - 1].id;
}

export function ProjectProvider({ children }) {
  const { user } = useAuth();
  const net = useNetwork();
  const res = useResults();
  const sel = useSelection();
  const wf = useWorkflow();

  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeProjectName, setActiveProjectName] = useState(null);
  const [autosaveMeta, setAutosaveMeta] = useState(null);       // { updated_at, current_step, ... }
  const [resumePrompt, setResumePrompt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const suppressAutosaveRef = useRef(false);   // set true while loading a snapshot
  const autosaveTimerRef = useRef(null);
  const bootstrapDoneRef = useRef(false);

  // ─────────────────────── Snapshot serialization ─────────────────────
  const snapshotState = useCallback(() => {
    return {
      version: STATE_VERSION,
      // Network / downstream context
      selectedCompounds: net.selectedCompounds || [],
      compoundTargets:   net.compoundTargets   || [],
      diseaseTargets:    net.diseaseTargets    || [],
      selectedDisease:   net.selectedDisease   || null,
      plantName:         net.plantName         || "",
      selectedKeggPathways: net.selectedKeggPathways || [],
      intersectingGenes: net.intersectingGenes || [],
      hubScores:         net.hubScores         || [],
      ppiResult:         net.ppiResult         || null,
      goTerms:           net.goTerms           || [],
      dockingResults:    net.dockingResults    || null,
      mdConfig:          net.mdConfig          || null,
      // Results (compound table)
      compounds:         res.compounds         || [],
      meta:              res.meta              || null,
      source:            res.source            || null,
      // Selection (per-page selected rows)
      selection:         sel?.getAllSelections ? sel.getAllSelections() : null,
    };
  }, [net, res, sel]);

  // ─────────────────────── Hydration ────────────────────────────────
  const applySnapshot = useCallback((state) => {
    if (!state || typeof state !== "object") return;
    suppressAutosaveRef.current = true;
    try {
      if (state.plantName !== undefined)          net.setPlantName(state.plantName || "");
      if (state.selectedCompounds !== undefined)  net.setSelectedCompounds(state.selectedCompounds || []);
      if (state.compoundTargets !== undefined)    net.setCompoundTargets(state.compoundTargets || []);
      if (state.diseaseTargets !== undefined)     net.setDiseaseTargets(state.diseaseTargets || []);
      if (state.selectedDisease !== undefined)    net.setSelectedDisease(state.selectedDisease || null);
      if (state.selectedKeggPathways !== undefined) net.setSelectedKeggPathways(state.selectedKeggPathways || []);
      if (state.intersectingGenes !== undefined)  net.setIntersectingGenes(state.intersectingGenes || []);
      if (state.hubScores !== undefined)          net.setHubScores(state.hubScores || []);
      if (state.ppiResult !== undefined)          net.setPpiResult(state.ppiResult || null);
      if (state.goTerms !== undefined)            net.setGoTerms(state.goTerms || []);
      if (state.dockingResults !== undefined)     net.setDockingResults(state.dockingResults || null);
      if (state.mdConfig !== undefined)           net.setMdConfig(state.mdConfig || null);
      // Restore compound table (skip auto-standardization by setting standardized=true)
      if (Array.isArray(state.compounds) && state.compounds.length > 0) {
        const restoredMeta = { ...(state.meta || {}), standardized: true, restored: true };
        res.setResults(state.compounds, restoredMeta, state.source || null);
      }
      // Selection replay
      if (state.selection && sel?.replaceAllSelections) {
        sel.replaceAllSelections(state.selection);
      }
    } finally {
      // Release autosave suppression on next tick
      setTimeout(() => { suppressAutosaveRef.current = false; }, 400);
    }
  }, [net, res, sel]);

  // ─────────────────────── Autosave loop ──────────────────────────────
  const runAutosave = useCallback(async () => {
    if (!user) return;
    if (suppressAutosaveRef.current) return;
    const state = snapshotState();
    // Skip empty snapshots (nothing to save)
    const hasData = Boolean(
      state.plantName || (state.compounds && state.compounds.length) ||
      (state.selectedCompounds && state.selectedCompounds.length) ||
      state.dockingResults || (wf.completedIds && wf.completedIds.length)
    );
    if (!hasData) return;
    try {
      setSaving(true);
      const completed = wf.completedIds || [];
      const current = deriveCurrentStep(completed);
      if (activeProjectId) {
        await updateProject(activeProjectId, {
          workflow_state: state, current_step: current, completed_steps: completed,
        });
      } else {
        await upsertAutosave({ workflow_state: state, current_step: current, completed_steps: completed });
      }
      setLastSavedAt(new Date().toISOString());
    } catch (e) {
      // silent — best-effort autosave
    } finally {
      setSaving(false);
    }
  }, [user, activeProjectId, wf.completedIds, snapshotState]);

  // Debounced trigger on state changes.
  useEffect(() => {
    if (!user) return;
    if (!bootstrapDoneRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(runAutosave, AUTOSAVE_DEBOUNCE_MS);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
    // Purposely depend on the full snapshot so any downstream change triggers autosave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, net.selectedCompounds, net.compoundTargets, net.diseaseTargets,
      net.selectedDisease, net.plantName, net.selectedKeggPathways, net.intersectingGenes,
      net.hubScores, net.ppiResult, net.goTerms, net.dockingResults, net.mdConfig,
      res.compounds, wf.completedIds]);

  // On login, check for autosave and prompt "Resume?"
  useEffect(() => {
    (async () => {
      if (!user) {
        setAutosaveMeta(null); setResumePrompt(false); bootstrapDoneRef.current = false;
        return;
      }
      try {
        const { autosave } = await getAutosave();
        if (autosave && autosave.workflow_state) {
          setAutosaveMeta(autosave);
          // Only prompt if we haven't already restored (e.g. app just booted anonymously)
          const alreadyHasData = (net.selectedCompounds && net.selectedCompounds.length > 0) ||
            (res.compounds && res.compounds.length > 0);
          if (!alreadyHasData) {
            setResumePrompt(true);
          }
        }
      } catch (e) {} finally {
        bootstrapDoneRef.current = true;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ─────────────────────── Public API ─────────────────────────────────
  const resumeAutosave = useCallback(async () => {
    setResumePrompt(false);
    if (!autosaveMeta) return;
    try {
      applySnapshot(autosaveMeta.workflow_state);
      // Restore completed steps
      (autosaveMeta.completed_steps || []).forEach((s) => wf.markComplete(s));
    } catch (e) {}
  }, [autosaveMeta, applySnapshot, wf]);

  const discardAutosave = useCallback(async () => {
    setResumePrompt(false);
    try { await clearAutosave(); } catch (e) {}
    setAutosaveMeta(null);
  }, []);

  const saveAs = useCallback(async (name, description = "") => {
    if (!user) throw new Error("Sign in required");
    const state = snapshotState();
    const completed = wf.completedIds || [];
    const current = deriveCurrentStep(completed);
    const created = await createProject({
      name, description, workflow_state: state,
      current_step: current, completed_steps: completed,
    });
    setActiveProjectId(created.id); setActiveProjectName(created.name);
    setLastSavedAt(created.updated_at);
    // Clear autosave once a named project exists
    try { await clearAutosave(); } catch (e) {}
    setAutosaveMeta(null);
    return created;
  }, [user, snapshotState, wf.completedIds]);

  const save = useCallback(async () => {
    if (!activeProjectId) return null;
    const state = snapshotState();
    const completed = wf.completedIds || [];
    const current = deriveCurrentStep(completed);
    const updated = await updateProject(activeProjectId, {
      workflow_state: state, current_step: current, completed_steps: completed,
    });
    setLastSavedAt(updated.updated_at);
    return updated;
  }, [activeProjectId, snapshotState, wf.completedIds]);

  const load = useCallback(async (id) => {
    const p = await getProject(id);
    applySnapshot(p.workflow_state || {});
    (p.completed_steps || []).forEach((s) => wf.markComplete(s));
    setActiveProjectId(p.id); setActiveProjectName(p.name);
    setLastSavedAt(p.updated_at);
    return p;
  }, [applySnapshot, wf]);

  const rename = useCallback(async (id, name) => {
    const p = await updateProject(id, { name });
    if (id === activeProjectId) setActiveProjectName(p.name);
    return p;
  }, [activeProjectId]);

  const duplicate = useCallback(async (id) => {
    return await duplicateProject(id);
  }, []);

  const remove = useCallback(async (id) => {
    await deleteProject(id);
    if (id === activeProjectId) {
      setActiveProjectId(null); setActiveProjectName(null);
    }
  }, [activeProjectId]);

  const snapshot = useCallback(async (label) => {
    if (!activeProjectId) throw new Error("No active project");
    await save();
    return await snapshotProject(activeProjectId, label);
  }, [activeProjectId, save]);

  const versions = useCallback(async (id) => (await listVersions(id)).versions, []);
  const restore = useCallback(async (projectId, versionId) => {
    const p = await restoreVersion(projectId, versionId);
    applySnapshot(p.workflow_state || {});
    (p.completed_steps || []).forEach((s) => wf.markComplete(s));
    return p;
  }, [applySnapshot, wf]);

  const list = useCallback(async () => (await listProjects()).projects, []);

  const value = useMemo(() => ({
    activeProjectId, activeProjectName,
    saving, lastSavedAt,
    autosaveMeta, resumePrompt, setResumePrompt,
    resumeAutosave, discardAutosave,
    saveAs, save, load, rename, duplicate, remove, snapshot, versions, restore, list,
    promoteAutosave: async (name, description = "") => {
      const p = await promoteAutosave({ name, description, workflow_state: {}, current_step: null, completed_steps: [] });
      setActiveProjectId(p.id); setActiveProjectName(p.name);
      setAutosaveMeta(null);
      return p;
    },
  }), [activeProjectId, activeProjectName, saving, lastSavedAt, autosaveMeta, resumePrompt,
       resumeAutosave, discardAutosave, saveAs, save, load, rename, duplicate, remove,
       snapshot, versions, restore, list]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within a ProjectProvider");
  return ctx;
}
