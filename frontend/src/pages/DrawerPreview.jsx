// DrawerPreview — quick sanity route for the Figure customization drawer.
// Not shipped to users; visible only at /drawer-preview so a dev / QA can
// verify the collapsible sections and tightened spacing without needing
// to reach a real docking/network page first.
import { useState } from "react";
import ChartStyleDrawer from "@/components/ChartStyleDrawer";
import { ChartStyleProvider } from "@/context/ChartStyleContext";

export default function DrawerPreview() {
  const [open, setOpen] = useState(true);
  return (
    <ChartStyleProvider>
      <div className="min-h-screen w-full bg-[#0F0E24] p-10">
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-[#5139ED] px-4 py-2 text-[13px] font-bold text-white"
        >
          Open Figure Customization
        </button>
        <ChartStyleDrawer open={open} onClose={() => setOpen(false)} chartType="docking" />
      </div>
    </ChartStyleProvider>
  );
}
