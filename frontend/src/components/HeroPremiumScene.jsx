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
          "radial-gradient(70% 60% at 45% 55%, rgba(43,182,115,0.10) 0%, rgba(15,14,36,0.0) 60%), #0F0E24",
      }}
    >
      {/* Oversized protein — scale up and translate so the ribbon bleeds
          past the top-right and bottom-left edges of the container. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          transform: "scale(1.45) translate(6%, -4%)",
          transformOrigin: "50% 50%",
          // Feather the edges so the ribbon fades into the dark canvas
          // instead of ending on a hard rectangle.
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
    </div>
  );
}
