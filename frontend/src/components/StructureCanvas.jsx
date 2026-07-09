import { useEffect, useRef } from "react";
import SmilesDrawer from "smiles-drawer";

const drawer = new SmilesDrawer.Drawer({
  width: 180,
  height: 120,
  bondThickness: 1.1,
  bondLength: 18,
  shortBondLength: 0.85,
  padding: 6,
  fontSizeLarge: 8,
  fontSizeSmall: 6,
  compactDrawing: true,
  atomVisualization: "default",
  themes: {
    dr: {
      C: "#0B0B18",
      O: "#DC2626",
      N: "#2563EB",
      F: "#059669",
      CL: "#059669",
      BR: "#B45309",
      I: "#7C3AED",
      P: "#EA580C",
      S: "#B45309",
      B: "#059669",
      SI: "#64748B",
      H: "#0B0B18",
      BACKGROUND: "#FFFFFF",
    },
  },
});

export default function StructureCanvas({ smiles, size = 160 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!smiles || !ref.current) return;
    let cancelled = false;
    SmilesDrawer.parse(
      smiles,
      (tree) => {
        if (cancelled || !ref.current) return;
        try {
          drawer.draw(tree, ref.current, "dr", false);
        } catch (e) {
          // ignore render errors
        }
      },
      () => {
        // parse error — leave canvas blank
      }
    );
    return () => {
      cancelled = true;
    };
  }, [smiles]);

  if (!smiles) {
    return (
      <div
        style={{ width: size, height: size * 0.7 }}
        className="grid place-items-center rounded-md border border-dashed border-[#E7E7F3] text-[10px] text-[#B4B4CD]"
      >
        no SMILES
      </div>
    );
  }
  return (
    <canvas
      ref={ref}
      width={size}
      height={size * 0.7}
      className="rounded-md border border-[#E7E7F3] bg-white"
      data-testid="structure-canvas"
    />
  );
}
