import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { compoundKey } from "@/context/SelectionContext";
import { standardizeStart, standardizeStatus } from "@/lib/api";

const ResultsContext = createContext(null);

const POLL_INTERVAL_MS = 700;

/**
 * Shared results state consumed by the PlantDatabase table.
 *
 * Also runs COMPOUND STANDARDIZATION automatically: whenever a new dataset
 * arrives (via setResults) that hasn't already been standardized, a background
 * job is kicked off on the backend, polled for progress, and the standardized
 * rows replace the raw ones once the job completes.
 */
export function ResultsProvider({ children }) {
  const [compounds, setCompoundsState] = useState([]);
  const [meta, setMetaState] = useState(null);
  const [source, setSourceState] = useState(null);
  // Standardization job progress
  const [standardizing, setStandardizing] = useState(null); // {done, total, jobId} | null
  const [stdStats, setStdStats] = useState(null);
  const pollRef = useRef(null);
  const activeJobRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    activeJobRef.current = null;
  }, []);

  const setResults = useCallback(
    (next, nextMeta = null, nextSource = null) => {
      stopPolling();
      setStandardizing(null);
      setStdStats(null);
      setCompoundsState(next || []);
      setMetaState(nextMeta);
      setSourceState(nextSource);
    },
    [stopPolling]
  );

  const clearResults = useCallback(() => {
    stopPolling();
    setStandardizing(null);
    setStdStats(null);
    setCompoundsState([]);
    setMetaState(null);
    setSourceState(null);
  }, [stopPolling]);

  const updateCompound = useCallback((key, patch) => {
    setCompoundsState((rows) =>
      rows.map((r) => (compoundKey(r) === key ? { ...r, ...patch } : r))
    );
  }, []);

  // Auto-standardize whenever a fresh (un-standardized) dataset lands.
  useEffect(() => {
    if (!compounds || compounds.length === 0) return;
    if (meta?.standardized) return; // already standardized
    if (activeJobRef.current) return; // job in flight

    let cancelled = false;
    (async () => {
      try {
        const startRes = await standardizeStart(compounds);
        if (cancelled) return;
        const jobId = startRes.job_id;
        if (!jobId) return;
        activeJobRef.current = jobId;
        setStandardizing({ done: 0, total: startRes.total, jobId });
        pollRef.current = setInterval(async () => {
          try {
            const s = await standardizeStatus(jobId);
            if (cancelled) return;
            setStandardizing({
              done: s.done,
              total: s.total,
              jobId,
            });
            if (s.status === "done") {
              stopPolling();
              setStdStats(s.stats || null);
              setStandardizing(null);
              setCompoundsState(s.compounds || []);
              setMetaState((m) => ({
                ...(m || {}),
                standardized: true,
                stats: s.stats || null,
              }));
            } else if (s.status === "failed") {
              stopPolling();
              setStandardizing(null);
            }
          } catch (e) {
            // Non-fatal; keep polling until interval clears
          }
        }, POLL_INTERVAL_MS);
      } catch (e) {
        // silent — table still renders un-standardized compounds
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [compounds, meta?.standardized, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const value = useMemo(
    () => ({
      compounds,
      meta,
      source,
      setResults,
      clearResults,
      updateCompound,
      standardizing,
      stdStats,
    }),
    [
      compounds,
      meta,
      source,
      setResults,
      clearResults,
      updateCompound,
      standardizing,
      stdStats,
    ]
  );

  return (
    <ResultsContext.Provider value={value}>{children}</ResultsContext.Provider>
  );
}

export function useResults() {
  const ctx = useContext(ResultsContext);
  if (!ctx) throw new Error("useResults must be used within a ResultsProvider");
  return ctx;
}
