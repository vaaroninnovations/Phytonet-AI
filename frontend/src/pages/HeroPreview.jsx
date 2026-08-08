// HeroPreview — temporary preview route (/hero-preview) so the user can see
// the new hero visual in isolation, on the actual dark canvas, before we
// wire it into the homepage.
import HeroPremiumScene from "@/components/HeroPremiumScene";

export default function HeroPreview() {
  return (
    <div className="min-h-screen w-full bg-[#0F0E24]">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-4 font-body text-[11px] font-bold uppercase tracking-[0.24em] text-[#E7E7F3]/60">
          Hero Preview · Not wired into homepage yet
        </div>
        <div className="relative h-[720px] w-full rounded-3xl border border-[#FAFAFF]/10 overflow-hidden">
          <HeroPremiumScene />
        </div>
      </div>
    </div>
  );
}
