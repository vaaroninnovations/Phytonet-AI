// HeroPreview — temporary preview route so the user can see the oversized
// protein ribbon acting as an edge-to-edge hero background BEFORE we wire
// it into the real homepage. Mocks the hero content (headline / CTAs) on
// top of the visual so the composition can be judged in context.
import HeroPremiumScene from "@/components/HeroPremiumScene";

export default function HeroPreview() {
  return (
    <div className="min-h-screen w-full bg-[#0F0E24]">
      {/* Hero mockup — full-bleed */}
      <section className="relative isolate overflow-hidden">
        {/* Background — oversized cropped protein */}
        <div className="absolute inset-0 -z-10">
          <HeroPremiumScene />
        </div>

        {/* Readability veil — dark scrim on the left so the copy pops */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10"
             style={{
               background:
                 "linear-gradient(90deg, rgba(15,14,36,0.85) 0%, rgba(15,14,36,0.55) 45%, rgba(15,14,36,0.0) 75%)",
             }} />

        <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#FAFAFF]/10 bg-[#FAFAFF]/[0.04] px-3 py-1.5 text-[11px] font-body font-semibold uppercase tracking-[0.16em] text-[#E7E7F3]/80">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2BB673]" />
              Preview · Not wired into homepage yet
            </div>
            <h1 className="mt-6 font-headline text-[44px] leading-[1.02] tracking-[-0.02em] text-[#FAFAFF] sm:text-[60px] lg:text-[76px]">
              Decode complex biology<br/>
              <span className="bg-gradient-to-r from-[#c4b5fd] via-[#8139ED] to-[#5139ED] bg-clip-text text-transparent">
                with PhytoNet AI.
              </span>
            </h1>
            <p className="mt-6 max-w-xl font-body text-[15.5px] leading-relaxed text-[#E7E7F3]/85">
              The natural-language research intelligence platform for pharmacologists,
              phytochemists and drug-discovery scientists. Plan multi-step network-pharmacology
              workflows in plain English.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button className="inline-flex items-center gap-2 rounded-lg bg-[#5139ED] px-5 py-3 text-[13.5px] font-bold text-white">
                Launch Workspace
              </button>
              <button className="inline-flex items-center gap-2 rounded-lg border border-[#FAFAFF]/15 bg-[#FAFAFF]/[0.04] px-5 py-3 text-[13.5px] font-semibold text-[#E7E7F3]">
                Try the AI Assistant
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
