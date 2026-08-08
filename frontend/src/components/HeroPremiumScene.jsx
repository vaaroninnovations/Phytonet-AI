// HeroPremiumScene — hero visual reduced to just a docked protein.
// No particle field, no animation, no interaction. A single elegant
// image of an AKT1 protein with the ligand at the active site, sitting
// on a soft dark backdrop that matches the rest of the site.
import Hero3DProtein from "./Hero3DProtein";

export default function HeroPremiumScene() {
  return (
    <div
      data-testid="hero-premium-scene"
      className="relative h-full w-full overflow-hidden"
      style={{
        background:
          "radial-gradient(70% 60% at 50% 50%, rgba(43,182,115,0.10) 0%, rgba(15,14,36,0.0) 55%), #0F0E24",
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative h-full w-full max-w-[720px] px-6 py-6">
          <Hero3DProtein autoRotate={false} interactive={false} />
        </div>
      </div>
    </div>
  );
}
