// Hero3DProtein — real WebGL protein viewer for the homepage hero.
//
// Uses 3Dmol.js to fetch and render AKT1 (PDB 4EJN) as a green cartoon
// ribbon with an element-coloured ball-and-stick ligand in the pocket.
//
// Interactive:
//   • Drag-rotate — pointer events pass through to the 3Dmol canvas so the
//     visitor can grab and spin the protein at any moment.
//   • Auto-rotate — a slow rAF spin that pauses whenever the pointer enters
//     the viewer (so the user can inspect / drag) and resumes on leave.
//   • Imperative spotlight API — parent calls `ref.current.highlight(mode)`
//     to recolour matching residues in a brighter accent, e.g. active-site
//     residues near the ligand or the activation loop for the pathway card.
import {
  forwardRef, useEffect, useImperativeHandle, useRef, useState,
} from "react";

const PDB_ID = "4EJN";
const PDB_URL = `https://files.rcsb.org/download/${PDB_ID}.pdb`;

const PROTEIN_GREEN     = "#2BB673";
const PROTEIN_GREEN_DK  = "#1E8A55";
const PROTEIN_GREEN_HI  = "#7EE0B2";     // hover accent
const HIGHLIGHT_YELLOW  = "#F59E0B";     // ligand hover accent
const HIGHLIGHT_PURPLE  = "#8139ED";     // pathway hover accent

const SOLVENTS = ["HOH", "NA", "K", "CL", "MG", "ZN", "CA", "SO4", "PO4"];

// Base cartoon colour along backbone — subtle shade modulation so helices
// read as 3D. Called by 3Dmol per-atom.
function baseCartoonColor(atom) {
  const t = ((atom.resi || 0) % 60) / 60;
  const lerp = (a, b) => Math.round(a + (b - a) * t);
  const r = lerp(43, 30), g = lerp(182, 138), b = lerp(115, 85);
  return `rgb(${r},${g},${b})`;
}

const Hero3DProtein = forwardRef(function Hero3DProtein({
  autoRotate = true,
  interactive = true,
  zoom = 1.35,
  showLigand = true,
  cartoonThickness = 0.55,
} = {}, ref) {
  const hostRef   = useRef(null);
  const viewerRef = useRef(null);
  const rafRef    = useRef(null);
  const pausedRef = useRef(false);
  const [ready, setReady] = useState(false);

  /* ── Reset all styles to the base state ──────────────────────── */
  const applyBaseStyle = (viewer) => {
    viewer.setStyle({}, {});
    viewer.setStyle(
      { hetflag: false },
      { cartoon: { colorfunc: baseCartoonColor, thickness: cartoonThickness, opacity: 1.0 } }
    );
    if (showLigand) {
      viewer.setStyle(
        { hetflag: true, not: { resn: SOLVENTS } },
        {
          stick:  { radius: 0.22, colorscheme: "default" },
          sphere: { scale: 0.28,  colorscheme: "default" },
        }
      );
    }
  };

  /* ── Highlight modes (called from the parent via ref) ────────── */
  const applyHighlight = (mode) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    applyBaseStyle(viewer);

    switch (mode) {
      case "target": {
        // Whole cartoon flashes brighter emerald + thicker.
        viewer.setStyle(
          { hetflag: false },
          { cartoon: { color: PROTEIN_GREEN, thickness: 0.85, opacity: 1.0 } }
        );
        break;
      }
      case "binding": {
        // Residues within 5Å of the ligand light up in pale green.
        viewer.addStyle(
          {
            hetflag: false,
            within: {
              distance: 5.0,
              sel: { hetflag: true, not: { resn: SOLVENTS } },
            },
          },
          { cartoon: { color: PROTEIN_GREEN_HI, thickness: 0.95, opacity: 1.0 } }
        );
        // And render the same residues as pale-green sticks for extra emphasis.
        viewer.addStyle(
          {
            hetflag: false,
            within: {
              distance: 5.0,
              sel: { hetflag: true, not: { resn: SOLVENTS } },
            },
          },
          { stick: { color: PROTEIN_GREEN_HI, radius: 0.14 } }
        );
        break;
      }
      case "compound": {
        // Amp the ligand — larger sticks + spheres + yellow-tinted carbons.
        viewer.setStyle(
          { hetflag: true, not: { resn: SOLVENTS } },
          {
            stick:  { colorscheme: "yellowCarbon", radius: 0.32 },
            sphere: { colorscheme: "yellowCarbon", scale: 0.38 },
          }
        );
        break;
      }
      case "pathway": {
        // Activation loop of AKT1 kinase — rough range 285-315 in 4EJN
        // numbering. Recolour in brand purple.
        viewer.addStyle(
          { hetflag: false, resi: "285-315" },
          { cartoon: { color: HIGHLIGHT_PURPLE, thickness: 0.90, opacity: 1.0 } }
        );
        break;
      }
      case "evidence": {
        // Subtle "confidence pulse" — brighten cartoon slightly.
        viewer.setStyle(
          { hetflag: false },
          { cartoon: { color: PROTEIN_GREEN_HI, thickness: 0.70, opacity: 1.0 } }
        );
        break;
      }
      default:
        /* no-op — base style already applied */
        break;
    }
    viewer.render();
  };

  useImperativeHandle(ref, () => ({
    highlight: (mode) => applyHighlight(mode),
  }), []);

  /* ── Bootstrap: fetch PDB, mount viewer, start auto-rotate ───── */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mod = await import("3dmol");
        const $3Dmol = mod.default || mod;
        if (cancelled || !hostRef.current) return;

        const res = await fetch(PDB_URL);
        if (!res.ok) throw new Error(`PDB fetch failed: ${res.status}`);
        const pdbText = await res.text();
        if (cancelled || !hostRef.current) return;

        const viewer = $3Dmol.createViewer(hostRef.current, {
          backgroundColor: "#0F0E24",
          antialias: true,
        });
        try { viewer.setBackgroundColor(0x0F0E24, 0); } catch { /* noop */ }
        viewerRef.current = viewer;
        viewer.addModel(pdbText, "pdb");
        applyBaseStyle(viewer);
        viewer.zoomTo();
        viewer.zoom(zoom);
        viewer.render();

        const spin = () => {
          if (!viewerRef.current) return;
          if (autoRotate && !pausedRef.current) {
            viewerRef.current.rotate(0.20, "y");
            viewerRef.current.render();
          }
          rafRef.current = requestAnimationFrame(spin);
        };
        if (autoRotate) rafRef.current = requestAnimationFrame(spin);

        setReady(true);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[Hero3DProtein] failed to load PDB:", err);
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const host = hostRef.current;
      if (host) { while (host.firstChild) host.removeChild(host.firstChild); }
      viewerRef.current = null;
    };
  }, []);

  /* ── Pause spin while pointer is over the viewer (so drag feels
       instant and the user has a moment to inspect the structure). */
  const onEnter = () => { pausedRef.current = true; };
  const onLeave = () => { pausedRef.current = false; };

  return (
    <div
      className={`relative h-full w-full ${interactive ? "" : "pointer-events-none"}`}
      data-testid="hero-3d-protein"
      data-ready={ready ? "1" : "0"}
      onPointerEnter={interactive ? onEnter : undefined}
      onPointerLeave={interactive ? onLeave : undefined}
    >
      <div
        ref={hostRef}
        className={`absolute inset-0 h-full w-full ${interactive ? "cursor-grab active:cursor-grabbing" : ""}`}
        style={{
          filter: `drop-shadow(0 24px 40px rgba(43,182,115,0.22)) drop-shadow(0 0 28px rgba(126,224,178,0.28))`,
        }}
      />
    </div>
  );
});

export default Hero3DProtein;

export const HERO_PROTEIN_PALETTE = {
  green: PROTEIN_GREEN,
  greenDark: PROTEIN_GREEN_DK,
  surface: PROTEIN_GREEN_HI,
  yellow: HIGHLIGHT_YELLOW,
  purple: HIGHLIGHT_PURPLE,
};
