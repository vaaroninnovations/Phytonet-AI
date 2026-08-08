// HeroPremiumScene — oversized 3D protein ribbon used as an edge-to-edge
// abstract hero background. Intentionally cropped past the viewport edges
// so it reads as pure ribbon/texture — not a scientific analysis widget.
//
//   • No ligand, no atoms — just the cartoon ribbon.
//   • No interaction, no auto-rotation.
//   • The 3Dmol canvas host is scaled up (140%) and offset off-centre so
//     large chunks of the protein extend beyond the frame.
//   • A CSS mask fades the edges into transparent so the ribbon dissolves
//     softly into the dark hero rather than ending on a hard rectangle.
//   • A subtle radial green aura sits behind for atmosphere.
import Hero3DProtein from "./Hero3DProtein";

export default function HeroPremiumScene() {
  return (
    <div
      data-testid="hero-premium-scene"
      className="relative h-full w-full overflow-hidden"
      style={{
        background:
          "radial-gradient(65% 55% at 60% 45%, rgba(14,175,122,0.10) 0%, rgba(15,14,36,0.0) 60%), " +
          "radial-gradient(65% 55% at 85% 90%, rgba(129,57,237,0.14) 0%, rgba(15,14,36,0.0) 60%), " +
          "#0F0E24",
      }}
    >
      {/* Oversized protein — scale up and translate so the ribbon bleeds
          past the top-right and bottom-left edges of the container. A
          very slow CSS perspective drift makes the ribbon breathe without
          ever becoming a scientific widget (imperceptible per-frame — the
          whole cycle takes ~55s). */}
      <div
        className="pointer-events-none absolute inset-0 hero-ribbon-drift"
        style={{
          transformOrigin: "50% 50%",
          WebkitMaskImage:
            "radial-gradient(70% 62% at 50% 50%, #000 55%, rgba(0,0,0,0.55) 78%, transparent 100%)",
          maskImage:
            "radial-gradient(70% 62% at 50% 50%, #000 55%, rgba(0,0,0,0.55) 78%, transparent 100%)",
        }}
      >
        <Hero3DProtein
          autoRotate={false}
          interactive={false}
          zoom={2.4}
          showLigand={false}
          cartoonThickness={0.85}
        />
      </div>

      <style>{`
        @keyframes hero-ribbon-drift {
          0%   { transform: perspective(1400px) rotateX( 0.8deg) rotateY(-1.6deg) scale(1.45) translate(6%,  -4%); }
          50%  { transform: perspective(1400px) rotateX(-0.6deg) rotateY( 1.6deg) scale(1.48) translate(4%,  -2%); }
          100% { transform: perspective(1400px) rotateX( 0.8deg) rotateY(-1.6deg) scale(1.45) translate(6%,  -4%); }
        }
        .hero-ribbon-drift {
          animation: hero-ribbon-drift 55s ease-in-out infinite;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-ribbon-drift { animation: none; transform: perspective(1400px) scale(1.45) translate(6%, -4%); }
        }
      `}</style>
    </div>
  );
}
