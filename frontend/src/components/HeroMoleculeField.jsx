// HeroMoleculeField — dark hero scene matching the reference design:
//   • Full dark canvas (no light panel) so the visual bleeds into the hero.
//   • Real 3D AKT1 protein via 3Dmol.js — emerald cartoon + element-coloured
//     ball-and-stick ligand — with a bright green surface halo hugging the
//     binding pocket.
//   • Orbital particle field — small green + purple spheres with dashed
//     inter-atomic connection lines (network-graph feel).
//   • Small icon anchors (Target · Compound · Pathway) with green rings.
//   • Five detail cards in dark glass with green-tinted borders, each with
//     value + sub-text + "View X →" CTA.
//   • Interactive: drag-rotate the protein, hover any card to spotlight the
//     matching residues (see Hero3DProtein.jsx for the imperative API).
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Target, Leaf, Network as NetworkIcon,
  FlaskConical, MapPin, ShieldCheck, FileText, ArrowRight,
} from "lucide-react";
import Hero3DProtein from "./Hero3DProtein";

/* ─────────── Orbital particle field ─────────── */
const PARTICLE_COUNT = 55;
const CONNECT_RADIUS = 130;

// Small green + purple orbs (dark bg friendly). Sizes are small so they read
// as network nodes rather than fireworks.
const COLORS = [
  { fill: "rgba(43,182,115,0.85)",   glow: "rgba(43,182,115,0.20)"  }, // green
  { fill: "rgba(43,182,115,0.60)",   glow: "rgba(43,182,115,0.12)"  },
  { fill: "rgba(129,57,237,0.75)",   glow: "rgba(129,57,237,0.16)"  }, // purple
  { fill: "rgba(196,181,253,0.75)",  glow: "rgba(196,181,253,0.14)" }, // lavender
];
const LINK_COLOR = "rgba(43,182,115,";

function makeParticle(w, h) {
  const c = COLORS[Math.floor(Math.random() * COLORS.length)];
  return {
    x:  Math.random() * w,
    y:  Math.random() * h,
    vx: (Math.random() - 0.5) * 0.25,
    vy: (Math.random() - 0.5) * 0.25,
    r:  1.4 + Math.random() * 2.2,
    fill: c.fill,
    glow: c.glow,
  };
}

function ParticleField() {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const stateRef  = useRef({ particles: [], w: 0, h: 0, dpr: 1 });

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    const s   = stateRef.current;

    const resize = () => {
      const rect = c.getBoundingClientRect();
      s.w = rect.width; s.h = rect.height;
      s.dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = s.w * s.dpr; c.height = s.h * s.dpr;
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      if (s.particles.length !== PARTICLE_COUNT) {
        s.particles = Array.from({ length: PARTICLE_COUNT }, () => makeParticle(s.w, s.h));
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const { w, h, particles } = s;
      ctx.clearRect(0, 0, w, h);

      // Dashed inter-atomic links
      ctx.setLineDash([2.5, 5]);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x, dy = p.y - q.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < CONNECT_RADIUS * CONNECT_RADIUS) {
            const alpha = 0.28 * (1 - Math.sqrt(d2) / CONNECT_RADIUS);
            ctx.strokeStyle = LINK_COLOR + alpha.toFixed(3) + ")";
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }
      ctx.setLineDash([]);

      // Atoms — glow halo + solid core + tiny specular
      for (const p of particles) {
        ctx.fillStyle = p.glow;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.fill;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r,       0, Math.PI * 2); ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="hero-molecule-canvas"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}

/* ─────────── Small icon anchor labels (dark-mode) ─────────── */
function AnchorLabel({ Icon, label, className = "", accent = "#2BB673", testid, delay = 0 }) {
  return (
    <motion.div
      data-testid={testid}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      className={`absolute z-20 flex items-center gap-1.5 text-[12px] font-body font-semibold text-[#E7E7F3]/85 ${className}`}
    >
      <span
        className="grid h-7 w-7 place-items-center rounded-full border-2"
        style={{
          borderColor: `${accent}88`,
          background: "rgba(15,14,36,0.65)",
          color: accent,
          boxShadow: `0 0 12px ${accent}55`,
        }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span>{label}</span>
    </motion.div>
  );
}

/* ─────────── Dark glass detail cards ─────────── */
function DetailCard({
  Icon, label, value, sub, cta = "View",
  accent = "#2BB673",
  className = "", testid, delay = 0,
  onHoverEnter, onHoverLeave,
}) {
  return (
    <motion.div
      data-testid={testid}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      whileHover={{ y: -3 }}
      style={{
        borderColor: `${accent}55`,
        boxShadow: `0 12px 30px rgba(0,0,0,0.45), 0 0 0 1px ${accent}22, inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
      className={`absolute z-30 w-[196px] cursor-pointer rounded-2xl border bg-[#0F0E24]/85 backdrop-blur-md p-3.5 transition-shadow ${className}`}
    >
      <div className="flex items-center gap-2 text-[10.5px] font-body font-semibold uppercase tracking-[0.14em] text-[#E7E7F3]/60">
        <span
          className="grid h-6 w-6 place-items-center rounded-md"
          style={{ background: `${accent}1F`, color: accent }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        {label}
      </div>
      <div className="mt-2 font-headline text-[18px] font-bold leading-tight" style={{ color: accent }}>
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 font-body text-[11px] text-[#E7E7F3]/60">{sub}</div>
      )}
      <button
        type="button"
        className="mt-2.5 inline-flex items-center gap-1 font-body text-[11.5px] font-semibold hover:underline"
        style={{ color: accent }}
      >
        {cta} <ArrowRight className="h-3 w-3" />
      </button>
    </motion.div>
  );
}

/* ─────────── Public component ─────────── */
export default function HeroMoleculeField() {
  const proteinRef = useRef(null);
  const hover = (mode) => () => proteinRef.current?.highlight?.(mode);
  const clear = () => proteinRef.current?.highlight?.(null);

  return (
    <div
      className="relative h-full w-full min-h-[520px]"
      data-testid="hero-molecule-field"
    >
      {/* Layer 1 — orbital particle field (dashed network) */}
      <ParticleField />

      {/* Faint dashed orbital ellipses behind the protein */}
      <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none"
           className="pointer-events-none absolute inset-0 h-full w-full">
        <ellipse cx="52" cy="52" rx="42" ry="34"
                 fill="none" stroke="rgba(43,182,115,0.22)"
                 strokeWidth="0.14" strokeDasharray="0.6 0.9" />
        <ellipse cx="52" cy="52" rx="30" ry="22"
                 fill="none" stroke="rgba(129,57,237,0.18)"
                 strokeWidth="0.12" strokeDasharray="0.5 0.9" />
      </svg>

      {/* Radial green halo — makes the protein glow like the reference */}
      <div aria-hidden
           className="pointer-events-none absolute inset-0"
           style={{
             background:
               "radial-gradient(closest-side at 55% 50%, rgba(43,182,115,0.22), rgba(43,182,115,0.06) 40%, transparent 70%)",
           }} />

      {/* Layer 2 — the 3D protein (drag-rotates; hover cards to spotlight) */}
      <div className="absolute inset-0 z-10 flex items-center justify-center px-2 py-2">
        <div className="relative h-full w-full max-w-[640px]">
          <Hero3DProtein ref={proteinRef} />
        </div>
      </div>

      {/* Layer 3 — small icon anchors */}
      <AnchorLabel
        testid="hero-anchor-target"
        Icon={Target}   label="Target"   accent="#2BB673"
        className="left-1/2 top-3 -translate-x-1/2" delay={0.10}
      />
      <AnchorLabel
        testid="hero-anchor-compound"
        Icon={Leaf}     label="Compound" accent="#2BB673"
        className="left-6 top-[28%]" delay={0.15}
      />
      <AnchorLabel
        testid="hero-anchor-pathway"
        Icon={NetworkIcon} label="Pathway" accent="#8139ED"
        className="right-1/3 bottom-2" delay={0.20}
      />

      {/* Layer 4 — dark glass detail cards */}
      <DetailCard
        testid="hero-card-target"
        Icon={FileText}
        label="Protein Target"
        value="AKT1"
        sub="UniProt ID: P31749"
        cta="View Details"
        accent="#2BB673"
        className="right-2 top-3"
        delay={0.25}
        onHoverEnter={hover("target")} onHoverLeave={clear}
      />
      <DetailCard
        testid="hero-card-binding"
        Icon={MapPin}
        label="Binding Site"
        value="Active Site"
        sub="Confidence: 0.92"
        cta="View Site"
        accent="#2BB673"
        className="right-0 top-[30%]"
        delay={0.35}
        onHoverEnter={hover("binding")} onHoverLeave={clear}
      />
      <DetailCard
        testid="hero-card-pathway"
        Icon={NetworkIcon}
        label="Pathway"
        value="PI3K / AKT"
        sub="Relevance: High"
        cta="Explore"
        accent="#8139ED"
        className="right-2 top-[58%]"
        delay={0.45}
        onHoverEnter={hover("pathway")} onHoverLeave={clear}
      />
      <DetailCard
        testid="hero-card-compound"
        Icon={FlaskConical}
        label="Top Compound"
        value="Quercetin"
        sub="Score: −9.3 kcal/mol"
        cta="View Docking"
        accent="#2BB673"
        className="left-1/2 bottom-2 -translate-x-1/2"
        delay={0.30}
        onHoverEnter={hover("compound")} onHoverLeave={clear}
      />
      <DetailCard
        testid="hero-card-evidence"
        Icon={ShieldCheck}
        label="Evidence"
        value="High"
        sub="128 Publications"
        cta="View Evidence"
        accent="#2BB673"
        className="left-2 bottom-2"
        delay={0.40}
        onHoverEnter={hover("evidence")} onHoverLeave={clear}
      />
    </div>
  );
}
