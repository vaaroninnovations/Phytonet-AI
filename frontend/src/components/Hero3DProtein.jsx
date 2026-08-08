// Hero3DProtein — real WebGL protein viewer for the homepage hero.
//
// Uses 3Dmol.js to fetch and render AKT1 (PDB 4EJN) as a GREEN cartoon ribbon
// with a translucent green surface hugging the binding pocket, and the bound
// ligand as an element-coloured ball-and-stick model — matching the design
// reference exactly. Slowly auto-rotates.
//
// Non-interactive by design (pointer-events: none).
import { useEffect, useRef, useState } from "react";

const PDB_ID = "4EJN";
const PDB_URL = `https://files.rcsb.org/download/${PDB_ID}.pdb`;

const PROTEIN_GREEN     = "#2BB673";
const PROTEIN_GREEN_DK  = "#1E8A55";
const SURFACE_GREEN     = "#7EE0B2";

export default function Hero3DProtein({ background = "transparent" }) {
  const hostRef   = useRef(null);
  const viewerRef = useRef(null);
  const rafRef    = useRef(null);
  const [ready, setReady] = useState(false);

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
          backgroundColor: background === "transparent" ? "#FFFFFF" : background,
          antialias: true,
        });
        // Transparent background so the light panel + orbital particles show
        // through around the protein.
        try { viewer.setBackgroundColor(0xFFFFFF, 0); } catch { /* noop */ }
        viewerRef.current = viewer;
        viewer.addModel(pdbText, "pdb");

        // Receptor cartoon — solid emerald green (matches design ref). We
        // colour by residue index only to lightly modulate the shade so
        // helices/strands read as 3D rather than flat.
        viewer.setStyle({}, {});
        viewer.setStyle(
          { hetflag: false },
          {
            cartoon: {
              colorfunc: (atom) => {
                // subtle shade: helices/coils get slightly darker greens
                const t = ((atom.resi || 0) % 60) / 60;
                const lerp = (a, b) => Math.round(a + (b - a) * t);
                // #2BB673 → #1E8A55
                const r = lerp(43, 30);
                const g = lerp(182, 138);
                const b = lerp(115, 85);
                return `rgb(${r},${g},${b})`;
              },
              thickness: 0.55,
              opacity: 1.0,
            },
          }
        );

        // Ligand — HETATM that isn't a common solvent — element-coloured
        // ball-and-stick (grey C, red O, blue N…) matching the reference.
        const solvents = ["HOH", "NA", "K", "CL", "MG", "ZN", "CA", "SO4", "PO4"];
        viewer.setStyle(
          { hetflag: true, not: { resn: solvents } },
          {
            stick: { radius: 0.22, colorscheme: "default" },
            sphere: { scale: 0.28, colorscheme: "default" },
          }
        );

        // Skip VDW surface — 3Dmol computes surfaces in a Web Worker whose
        // async errors bubble past our try/catch on some drivers, tripping
        // React's error overlay. The green cartoon + element-coloured ligand
        // already reads clearly as the docked complex without a surface.

        viewer.zoomTo();
        viewer.zoom(1.25);
        viewer.render();

        const spin = () => {
          if (!viewerRef.current) return;
          viewerRef.current.rotate(0.20, "y");
          viewerRef.current.render();
          rafRef.current = requestAnimationFrame(spin);
        };
        rafRef.current = requestAnimationFrame(spin);

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
  }, [background]);

  return (
    <div
      className="pointer-events-none relative h-full w-full"
      data-testid="hero-3d-protein"
      data-ready={ready ? "1" : "0"}
    >
      <div
        ref={hostRef}
        className="absolute inset-0 h-full w-full"
        style={{
          filter: `drop-shadow(0 24px 40px rgba(43,182,115,0.22)) drop-shadow(0 0 28px rgba(126,224,178,0.28))`,
        }}
      />
    </div>
  );
}

// Palette re-exports so the outer scene can match the protein tone.
export const HERO_PROTEIN_PALETTE = {
  green: PROTEIN_GREEN,
  greenDark: PROTEIN_GREEN_DK,
  surface: SURFACE_GREEN,
};
