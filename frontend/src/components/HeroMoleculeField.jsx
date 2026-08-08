// HeroMoleculeField — hero scene for `/`, matching the design reference:
//   • Light rounded panel (sits on the dark hero page, "spotlights" the
//     protein like a product showcase card).
//   • Orbital particle field — green + purple spheres drifting with faint
//     dashed inter-atomic links.
//   • Real 3D protein (WebGL via 3Dmol.js) — green cartoon with translucent
//     green surface around the ligand pocket, ball-and-stick ligand inside.
//   • Small anchor labels (Target / Compound / Pathway) with dashed leader
//     lines to the protein.
//   • Five detail cards (Protein Target · Binding Site · Top Compound ·
//     Pathway · Evidence) — each with a value, sub-text and "View X →" link.
//
// Pure Canvas2D + SVG + framer-motion.
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Target, Leaf, Network as NetworkIcon,
  FlaskConical, MapPin, ShieldCheck, FileText, ArrowRight,
} from "lucide-react";
import Hero3DProtein from "./Hero3DProtein";

/* ─────────── Orbital particle field (background layer) ─────────── */
const PARTICLE_COUNT = 60;
const CONNECT_RADIUS = 110;

// Two colour classes — green primary + purple accents — matching the ref.
const COLORS = [
  { fill: "rgba(43,182,115,0.55)",   glow: "rgba(43,182,115,0.16)"  }, // green
  { fill: "rgba(43,182,115,0.30)",   glow: "rgba(43,182,115,0.10)"  }, // pale green
  { fill: "rgba(129,57,237,0.45)",   glow: "rgba(129,57,237,0.12)"  }, // purple
  { fill: "rgba(196,181,253,0.55)",  glow: "rgba(196,181,253,0.12)" }, // lavender
];
const LINK_COLOR = "rgba(43,182,115,";  // dynamic alpha, dashed

function makeParticle(w, h) {
  const c = COLORS[Math.floor(Math.random() * COLORS.length)];
  return {
    x:  Math.random() * w,
    y:  Math.random() * h,
    vx: (Math.random() - 0.5) * 0.30,
    vy: (Math.random() - 0.5) * 0.30,
    r:  2.4 + Math.random() * 3.6,       // larger, "orbital" spheres
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

      // Dashed links between close particles
      ctx.setLineDash([3, 5]);
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
            const alpha = 0.30 * (1 - Math.sqrt(d2) / CONNECT_RADIUS);
            ctx.strokeStyle = LINK_COLOR + alpha.toFixed(3) + ")";
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }
      ctx.setLineDash([]);

      // Atoms on top of links — glow halo + solid core
      for (const p of particles) {
        ctx.fillStyle = p.glow;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.fill;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r,       0, Math.PI * 2); ctx.fill();
        // small specular highlight
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.beginPath(); ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.35, 0, Math.PI * 2); ctx.fill();
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

/* ─────────── Small anchor labels (icon + text) ─────────── */
function AnchorLabel({ Icon, label, className = "", accent = "#2BB673", testid, delay = 0 }) {
  return (
    <motion.div
      data-testid={testid}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      className={`absolute z-20 flex items-center gap-1.5 text-[12px] font-body font-semibold text-[#E7E7F3] ${className}`}
    >
      <span
        className="grid h-7 w-7 place-items-center rounded-full border shadow-sm"
        style={{ borderColor: `${accent}55`, background: "#FFFFFF", color: accent }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span>{label}</span>
    </motion.div>
  );
}

/* ─────────── Rich detail cards ─────────── */
function DetailCard({
  Icon, label, value, valueColor = "#1E8A55", sub, cta = "View",
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
      whileHover={{ y: -3, boxShadow: "0 18px 40px rgba(15,14,36,0.22)" }}
      className={`absolute z-30 w-[176px] cursor-pointer rounded-xl border border-[#E7E7F3] bg-white/95 backdrop-blur-sm p-3 shadow-[0_12px_30px_rgba(15,14,36,0.12)] transition-shadow ${className}`}
    >
      <div className="flex items-center gap-1.5 text-[10.5px] font-body font-semibold uppercase tracking-[0.12em] text-[#64748B]">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1.5 font-headline text-[16px] font-bold leading-tight" style={{ color: valueColor }}>
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 font-body text-[10.5px] text-[#64748B]">{sub}</div>
      )}
      <button
        type="button"
        className="mt-2 inline-flex items-center gap-1 font-body text-[11px] font-semibold hover:underline"
        style={{ color: valueColor }}
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
      className="relative h-full w-full min-h-[440px]"
      data-testid="hero-molecule-field"
    >
      {/* Layer 1 — orbital particle field */}
      <ParticleField />

      {/* Faint dashed orbit — sweeping arc behind the protein */}
      <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none"
           className="pointer-events-none absolute inset-0 h-full w-full">
        <ellipse cx="50" cy="55" rx="42" ry="34"
                 fill="none" stroke="rgba(43,182,115,0.18)"
                 strokeWidth="0.15" strokeDasharray="0.6 0.8" />
        <ellipse cx="50" cy="55" rx="30" ry="24"
                 fill="none" stroke="rgba(129,57,237,0.14)"
                 strokeWidth="0.12" strokeDasharray="0.5 0.8" />
      </svg>

      {/* Layer 2 — real 3D protein (drag-rotate; auto-spin pauses on hover) */}
      <div className="absolute inset-0 z-10 flex items-center justify-center px-6 py-6">
        <div className="relative h-full w-full max-w-[540px]">
          <Hero3DProtein ref={proteinRef} />
        </div>
      </div>

      {/* Interaction hint */}
      <div data-testid="hero-drag-hint"
           className="pointer-events-none absolute left-1/2 bottom-1 z-20 -translate-x-1/2 rounded-full border border-white/15 bg-black/30 px-2.5 py-1 text-[10px] font-body font-semibold uppercase tracking-[0.14em] text-white/70 backdrop-blur-sm">
        Drag to rotate · Hover cards to spotlight
      </div>

      {/* Layer 3 — small anchor labels around the protein */}
      <AnchorLabel
        testid="hero-anchor-target"
        Icon={Target}   label="Target"    accent="#2BB673"
        className="left-1/2 top-3 -translate-x-1/2" delay={0.10}
      />
      <AnchorLabel
        testid="hero-anchor-compound"
        Icon={Leaf}     label="Compound"  accent="#2BB673"
        className="left-4 top-[30%]" delay={0.15}
      />
      <AnchorLabel
        testid="hero-anchor-pathway"
        Icon={NetworkIcon} label="Pathway" accent="#5139ED"
        className="right-6 bottom-3" delay={0.20}
      />

      {/* Layer 4 — rich detail cards (5) */}
      <DetailCard
        testid="hero-card-target"
        Icon={FileText}
        label="Protein Target"
        value="AKT1"
        sub="UniProt ID: P31749"
        cta="View Details"
        valueColor="#1E8A55"
        className="right-6 top-6"
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
        valueColor="#0B4635"
        className="right-2 top-[35%]"
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
        valueColor="#5139ED"
        className="right-2 top-[62%]"
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
        valueColor="#1E8A55"
        className="left-1/2 bottom-6 -translate-x-1/2"
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
        valueColor="#1E8A55"
        className="left-4 bottom-4"
        delay={0.40}
        onHoverEnter={hover("evidence")} onHoverLeave={clear}
      />
    </div>
  );
}
