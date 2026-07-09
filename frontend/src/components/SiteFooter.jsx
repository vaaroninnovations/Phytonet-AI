import { Slash } from "lucide-react";

export default function SiteFooter() {
  return (
    <footer
      data-testid="site-footer"
      className="mt-24 border-t border-[#E7E7F3] bg-white"
    >
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED] text-white">
              <Slash className="h-4 w-4" strokeWidth={3} />
            </span>
            <span className="font-display text-base font-bold text-[#0B0B18]">
              Dr. <span className="text-[#5139ED]">/</span>
            </span>
          </div>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[#64748B]">
            An agentic orchestration engine for network pharmacology — from
            phytochemical mining to publication-ready reports.
          </p>
        </div>
        <div>
          <p className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-[#0B0B18]">
            Pipeline
          </p>
          <ul className="mt-4 space-y-2 text-sm text-[#64748B]">
            <li>Compound Extractor</li>
            <li>Target Identification</li>
            <li>PPI Networks</li>
            <li>Molecular Docking</li>
          </ul>
        </div>
        <div>
          <p className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-[#0B0B18]">
            Sources
          </p>
          <ul className="mt-4 space-y-2 text-sm text-[#64748B]">
            <li>IMPPAT</li>
            <li>LOTUS Natural Products</li>
            <li>KEGG · GO</li>
            <li>STRING</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[#E7E7F3]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 text-xs text-[#64748B]">
          <span>© {new Date().getFullYear()} Dr. / — Research AI Assistant</span>
          <span className="font-mono">v0.1 · preview</span>
        </div>
      </div>
    </footer>
  );
}
