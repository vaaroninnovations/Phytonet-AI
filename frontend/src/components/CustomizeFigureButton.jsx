// Small figure-scoped "Customize Figure" trigger.
// Place inside a figure's card header — clicking opens the ChartStyleDrawer
// scoped to that figure's chartType. Every graph on visualization pages
// should include one; the drawer is NOT globally mounted anymore.
import { useState } from "react";
import { Palette } from "lucide-react";
import ChartStyleDrawer from "@/components/ChartStyleDrawer";

/**
 * @param {{chartType: string, label?: string, testid?: string}} props
 * chartType: one of the keys in CHART_TYPES (ppi, hub, cpdTarget, go, kegg,
 *            docking, md, admet, heatmap, volcano, bubble, sankey, lollipop, venn).
 */
export function CustomizeFigureButton({ chartType, label = "Customize Figure", testid }) {
  const [open, setOpen] = useState(false);
  const t = testid || `customize-figure-${chartType}`;
  return (
    <>
      <button
        data-testid={t}
        onClick={() => setOpen(true)}
        title="Customize this figure"
        className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-[11px] font-bold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
      >
        <Palette className="h-3.5 w-3.5 text-[#5139ED]" />
        {label}
      </button>
      <ChartStyleDrawer open={open} onClose={() => setOpen(false)} chartType={chartType} />
    </>
  );
}

export default CustomizeFigureButton;
