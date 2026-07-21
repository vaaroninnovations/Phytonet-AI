// PhytoNet AI brand logo — DNA-and-leaf biosciences mark.
// The asset lives in `/app/frontend/public/logo512.png` and is served at
// `/logo512.png`. Kept as an <img> (not inlined) so browsers can cache it
// separately from the JS bundle.
export default function BrandLogo({ className = "h-8 w-8" }) {
  return (
    <img
      src="/logo512.png"
      alt="PhytoNet AI"
      className={className}
      draggable={false}
      loading="eager"
      decoding="async"
    />
  );
}
