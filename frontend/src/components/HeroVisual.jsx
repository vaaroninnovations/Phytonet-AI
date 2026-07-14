// PhytoNet AI hero visual — a central medicinal plant node surrounded by
// orbiting compound / protein / network / pathway / publication nodes with
// animated connecting lines and floating particles. Pure SVG + Framer Motion
// (no external images).
import { motion } from "framer-motion";
import { Atom, Dna, Network, Layers, FileText, Leaf } from "lucide-react";

const RADIUS = 175;

const NODES = [
  { key: "compounds", label: "Compounds",  icon: Atom,     angle: -110, color: "#5139ED" },
  { key: "proteins",  label: "Proteins",   icon: Dna,      angle: -50,  color: "#395AED" },
  { key: "ppi",       label: "PPI Network",icon: Network,  angle: 10,   color: "#8139ED" },
  { key: "pathways",  label: "Pathways",   icon: Layers,   angle: 70,   color: "#5139ED" },
  { key: "paper",     label: "Publication",icon: FileText, angle: 130,  color: "#2BB673" },
];

function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export default function HeroVisual() {
  const cx = 260, cy = 260;
  return (
    <div className="relative mx-auto h-[460px] w-full max-w-[520px] sm:h-[520px]" data-testid="hero-visual">
      {/* soft gradient background */}
      <div className="absolute inset-6 rounded-full bg-gradient-to-br from-[#5139ED]/10 via-[#395AED]/5 to-[#2BB673]/10 blur-2xl" />
      {/* radial dot grid */}
      <div className="absolute inset-0 dot-grid opacity-70" style={{ maskImage: "radial-gradient(circle at center, black 60%, transparent 85%)", WebkitMaskImage: "radial-gradient(circle at center, black 60%, transparent 85%)" }} />

      <svg viewBox="0 0 520 520" className="relative h-full w-full">
        <defs>
          <linearGradient id="hero-line" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"  stopColor="#5139ED" />
            <stop offset="100%" stopColor="#8139ED" />
          </linearGradient>
          <radialGradient id="core-g" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="#2BB673" />
            <stop offset="60%" stopColor="#5139ED" />
            <stop offset="100%" stopColor="#8139ED" />
          </radialGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>

        {/* Orbit rings */}
        {[0.55, 0.72, 0.9].map((s, i) => (
          <circle key={i} cx={cx} cy={cy} r={RADIUS * s}
                  fill="none" stroke="#5139ED" strokeOpacity="0.10" strokeDasharray="3 6" />
        ))}
        <circle cx={cx} cy={cy} r={RADIUS} fill="none" stroke="url(#hero-line)" strokeOpacity="0.35" />

        {/* Connecting lines from center to each node */}
        {NODES.map((n) => {
          const p = polar(cx, cy, RADIUS, n.angle);
          return (
            <motion.line
              key={"l" + n.key} x1={cx} y1={cy} x2={p.x} y2={p.y}
              stroke="url(#hero-line)" strokeWidth="1.3" strokeOpacity="0.75"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.75 }}
              transition={{ duration: 1.6, delay: 0.15 * NODES.indexOf(n) }}
            />
          );
        })}

        {/* Pulsing particles along a connection (animate opacity only, keep cx/cy fixed) */}
        {NODES.map((n, i) => {
          const p = polar(cx, cy, RADIUS, n.angle);
          const midX = (cx + p.x) / 2;
          const midY = (cy + p.y) / 2;
          return (
            <motion.circle
              key={"p" + n.key}
              cx={midX} cy={midY} r={2.8} fill="#5139ED"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0], scale: [0.6, 1.4, 0.6] }}
              transition={{ duration: 2.4, repeat: Infinity, delay: 0.4 * i, ease: "easeInOut" }}
              style={{ transformOrigin: `${midX}px ${midY}px` }}
            />
          );
        })}

        {/* Core "plant" node */}
        <motion.g
          animate={{ scale: [1, 1.03, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        >
          <circle cx={cx} cy={cy} r="56" fill="url(#core-g)" filter="url(#glow)" opacity="0.98" />
          <circle cx={cx} cy={cy} r="56" fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="1.2" />
        </motion.g>

        {/* Floating particles background */}
        {Array.from({ length: 18 }).map((_, i) => (
          <motion.circle key={"fp" + i}
            cx={40 + (i * 27) % 470}
            cy={20 + (i * 43) % 490}
            r={1.6} fill="#8139ED" opacity="0.35"
            animate={{ y: [0, -18, 0], opacity: [0.15, 0.6, 0.15] }}
            transition={{ duration: 4 + (i % 4), repeat: Infinity, delay: (i % 5) * 0.4, ease: "easeInOut" }} />
        ))}
      </svg>

      {/* Central plant icon (HTML overlay for crispness) */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="grid h-24 w-24 place-items-center rounded-full bg-white/95 shadow-[0_10px_40px_-12px_rgba(81,57,237,0.6)] backdrop-blur">
          <Leaf className="h-9 w-9 text-[#2BB673]" strokeWidth={2.2} />
        </div>
      </div>

      {/* Orbit nodes overlay */}
      {NODES.map((n, i) => {
        const p = polar(50, 50, 38, n.angle);  // % positioning
        return (
          <div
            key={n.key}
            className="pointer-events-none absolute"
            style={{ left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%,-50%)" }}
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.12, duration: 0.5 }}
              className="animate-float-slow flex items-center gap-2 rounded-full border border-white bg-white/95 px-3 py-1.5 shadow-[0_10px_28px_-10px_rgba(11,11,24,0.15)] backdrop-blur-md"
            >
              <span
                className="grid h-6 w-6 place-items-center rounded-full text-white"
                style={{ backgroundColor: n.color }}
              >
                <n.icon className="h-3.5 w-3.5" strokeWidth={2.4} />
              </span>
              <span className="text-[11px] font-bold text-[#111827]">{n.label}</span>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
