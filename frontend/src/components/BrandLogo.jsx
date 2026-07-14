// PhytoNet AI brand logo — a molecular hexagon whose inner nodes trace a leaf.
// Purely SVG, no external assets.
export default function BrandLogo({ className = "h-8 w-8" }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="pn-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stopColor="#5139ED" />
          <stop offset="55%" stopColor="#395AED" />
          <stop offset="100%" stopColor="#8139ED" />
        </linearGradient>
        <linearGradient id="pn-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stopColor="#2BB673" />
          <stop offset="100%" stopColor="#5139ED" />
        </linearGradient>
      </defs>
      {/* Outer hex */}
      <path
        d="M20 2 L34.8 10.5 L34.8 27.5 L20 36 L5.2 27.5 L5.2 10.5 Z"
        fill="none"
        stroke="url(#pn-g)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* Leaf silhouette formed by inner nodes */}
      <path
        d="M20 10 C 26 12, 29 18, 24 26 C 20 30, 15 28, 13 22 C 12 17, 15 12, 20 10 Z"
        fill="url(#pn-leaf)"
        opacity="0.9"
      />
      {/* Leaf midrib */}
      <path d="M20 10 L20 30" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" opacity="0.85" />
      {/* Molecular nodes */}
      <circle cx="20"  cy="2"    r="1.9" fill="#8139ED" />
      <circle cx="34.8" cy="10.5" r="1.9" fill="#5139ED" />
      <circle cx="34.8" cy="27.5" r="1.9" fill="#395AED" />
      <circle cx="20"  cy="36"   r="1.9" fill="#5139ED" />
      <circle cx="5.2" cy="27.5" r="1.9" fill="#395AED" />
      <circle cx="5.2" cy="10.5" r="1.9" fill="#8139ED" />
    </svg>
  );
}
