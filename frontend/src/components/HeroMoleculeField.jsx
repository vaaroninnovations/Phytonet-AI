// HeroMoleculeField — dominant hero visualisation for `/`.
//
// Composition (back → front):
//   1. Canvas particle field  → ~90 low-opacity "atoms" drift with faint
//      inter-atomic links. Sits absolutely behind everything; never competes
//      with the protein or floating cards.
//   2. Large SVG protein ribbon (α-helix + β-sheet) → the hero focal point.
//      Slowly tilts in perspective (CSS keyframes) so it feels 3D without
//      pulling in WebGL. Ligand pocket is highlighted at the active site.
//   3. Floating scientific cards → five glass chips positioned around the
//      protein (Protein Target · Binding Site · Top Compound · Pathway ·
//      Evidence). Each has a faint anchor line back to the ribbon so the
//      composition reads as a real annotated docking diagram.
//
// Pure Canvas2D + SVG + framer-motion — no dependencies beyond what the app
// already uses.
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Atom, Target, Beaker, Network, ShieldCheck } from "lucide-react";

/* ─────────── Particle field (background layer) ─────────── */
const PARTICLE_COUNT   = 90;
const CONNECT_RADIUS   = 78;
const PARTICLE_COLOR   = "rgba(196, 181, 253, 0.85)";   // #c4b5fd
const LINK_COLOR_BASE  = "rgba(129, 57, 237, ";         // #8139ED + dynamic alpha
const ACCENT_COLOR     = "rgba(43, 182, 115, 0.9)";     // #2BB673

function makeParticle(w, h) {
  return {
    x:  Math.random() * w,
    y:  Math.random() * h,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.35,
    r:  0.9 + Math.random() * 1.6,
    accent: Math.random() < 0.10,
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
      c.width  = s.w * s.dpr;
      c.height = s.h * s.dpr;
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
            ctx.strokeStyle = LINK_COLOR_BASE + alpha.toFixed(3) + ")";
            ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
      }
      for (const p of particles) {
        ctx.fillStyle = p.accent ? ACCENT_COLOR : PARTICLE_COLOR;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        if (p.accent) {
          ctx.fillStyle = "rgba(43,182,115,0.13)";
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.2, 0, Math.PI * 2); ctx.fill();
        }
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
      className="absolute inset-0 h-full w-full opacity-60"
      aria-hidden
    />
  );
}

/* ─────────── Protein ribbon (SVG focal element) ───────────
   A stylised α-helix + β-sheet composition. Not scientifically exact —
   but visually reads as a real ribbon diagram (PyMOL-style) with a bound
   ligand at the active site pocket. */
function ProteinRibbon() {
  return (
    <svg
      viewBox="0 0 520 460"
      aria-hidden
      data-testid="hero-protein-svg"
      className="relative z-10 h-full w-full [transform-style:preserve-3d] animate-[hero-tilt_22s_ease-in-out_infinite]"
      style={{ filter: "drop-shadow(0 24px 48px rgba(81,57,237,0.35)) drop-shadow(0 0 32px rgba(129,57,237,0.28))" }}
    >
      <defs>
        <linearGradient id="helixA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#c4b5fd" />
          <stop offset="55%"  stopColor="#8139ED" />
          <stop offset="100%" stopColor="#5139ED" />
        </linearGradient>
        <linearGradient id="helixB" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#7c3aed" />
          <stop offset="55%"  stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#c4b5fd" />
        </linearGradient>
        <linearGradient id="sheet" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"  stopColor="#2BB673" />
          <stop offset="100%" stopColor="#4ade80" />
        </linearGradient>
        <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stopColor="rgba(255,255,255,0.65)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
        </linearGradient>
        <radialGradient id="pocket" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%"  stopColor="rgba(43,182,115,0.55)" />
          <stop offset="60%" stopColor="rgba(43,182,115,0.15)" />
          <stop offset="100%" stopColor="rgba(43,182,115,0)" />
        </radialGradient>
      </defs>

      {/* Faint outer envelope — suggests the protein surface / solvent
          accessible surface without competing with the ribbon. */}
      <ellipse cx="260" cy="230" rx="205" ry="170"
               fill="rgba(129,57,237,0.05)"
               stroke="rgba(196,181,253,0.10)"
               strokeDasharray="2 5" />

      {/* Ribbon A — main α-helix winding across the composition.
          A wide gradient stroke + a thin white "specular" pass on top. */}
      <path d="M 60 340 C 100 220 220 260 260 200 S 400 130 470 80"
            fill="none" stroke="url(#helixA)" strokeWidth="26"
            strokeLinecap="round" />
      <path d="M 60 340 C 100 220 220 260 260 200 S 400 130 470 80"
            fill="none" stroke="url(#edge)" strokeWidth="2"
            strokeLinecap="round" />

      {/* Helix coils — short cross-strokes that make the tube read as
          a real α-helix instead of a flat ribbon. */}
      {[
        [82,300,96,332], [112,262,128,296], [150,238,168,272],
        [196,244,214,276], [244,222,262,254], [292,196,310,226],
        [340,168,358,196], [390,138,406,164], [432,110,446,134],
      ].map(([x1,y1,x2,y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="rgba(255,255,255,0.35)" strokeWidth="1.4"
              strokeLinecap="round" />
      ))}

      {/* Ribbon B — secondary helix crossing behind for depth. */}
      <path d="M 470 340 C 380 300 340 230 300 220 S 160 200 90 120"
            fill="none" stroke="url(#helixB)" strokeWidth="18"
            strokeLinecap="round" opacity="0.85" />
      <path d="M 470 340 C 380 300 340 230 300 220 S 160 200 90 120"
            fill="none" stroke="url(#edge)" strokeWidth="1.4"
            strokeLinecap="round" opacity="0.8" />

      {/* β-sheet arrow — thin dashed strand for visual variety. */}
      <path d="M 110 400 Q 220 380 320 400 T 470 400"
            fill="none" stroke="url(#sheet)" strokeWidth="4"
            strokeLinecap="round" strokeDasharray="10 6" opacity="0.9" />

      {/* Active site pocket — the ligand binding cavity, highlighted so
          the eye lands there. Radial green glow suggests the pocket. */}
      <g transform="translate(260,220)">
        <circle r="52" fill="url(#pocket)" />
        <circle r="52" fill="none" stroke="rgba(43,182,115,0.35)"
                strokeWidth="1" strokeDasharray="3 4" />
      </g>

      {/* Ligand — a stylised Quercetin-like flavonoid: three fused rings
          plus a hydroxyl "cluster". Rendered above the pocket. */}
      <g transform="translate(260,220)">
        {/* Bond skeleton */}
        <g stroke="#FAFAFF" strokeWidth="1.6" fill="none" strokeLinecap="round">
          {/* Ring A (chromen-4-one left) */}
          <polygon points="-24,-6 -14,-16 0,-10 0,4 -14,10 -24,4"
                   stroke="#FAFAFF" strokeWidth="1.6" fill="rgba(43,182,115,0.20)" />
          {/* Ring C (pyranone middle) */}
          <polygon points="0,-10 14,-16 24,-6 20,8 6,10 0,4"
                   stroke="#FAFAFF" strokeWidth="1.6" fill="rgba(196,181,253,0.20)" />
          {/* Ring B (catechol right, tilted) */}
          <polygon points="24,-6 40,-14 52,-4 48,10 32,14 20,8"
                   stroke="#FAFAFF" strokeWidth="1.6" fill="rgba(129,57,237,0.22)" />
          {/* Carbonyl */}
          <line x1="6" y1="10" x2="6" y2="22" />
        </g>
        {/* Atoms — coloured dots at ring junctions */}
        {[
          [-24,-6,"#2BB673"], [-14,-16,"#FAFAFF"], [0,-10,"#FAFAFF"], [0,4,"#FAFAFF"],
          [-14,10,"#FAFAFF"], [-24,4,"#FAFAFF"],
          [14,-16,"#FAFAFF"], [24,-6,"#FAFAFF"], [20,8,"#FAFAFF"], [6,10,"#FAFAFF"],
          [40,-14,"#c4b5fd"], [52,-4,"#c4b5fd"], [48,10,"#c4b5fd"], [32,14,"#c4b5fd"],
          [6,22,"#F59E0B"],
        ].map(([x,y,c], i) => (
          <circle key={i} cx={x} cy={y} r="2.1" fill={c} />
        ))}
      </g>

      {/* Ligand "landing" indicators — subtle vectors pointing into pocket */}
      <g stroke="rgba(43,182,115,0.35)" strokeWidth="0.8" strokeDasharray="2 3" fill="none">
        <line x1="200" y1="180" x2="240" y2="210" />
        <line x1="320" y1="180" x2="286" y2="210" />
      </g>

      {/* Anchor residues along ribbon A — key α-carbons */}
      {[
        [120, 290], [200, 250], [260, 220], [340, 172], [430, 110],
      ].map(([x, y], i) => (
        <g key={i} transform={`translate(${x},${y})`}>
          <circle r="7" fill="rgba(196,181,253,0.15)" />
          <circle r="3" fill="#c4b5fd" />
        </g>
      ))}
    </svg>
  );
}

/* ─────────── Floating annotation cards ─────────── */
function InfoCard({ Icon, label, value, accent = "#c4b5fd", className = "", testid, delay = 0 }) {
  return (
    <motion.div
      data-testid={testid}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      className={`absolute z-20 rounded-xl border border-[#FAFAFF]/12 bg-[#12102E]/80 px-3.5 py-2.5 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.35)] ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-lg border border-[#FAFAFF]/10"
              style={{ background: `${accent}1A`, color: accent }}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="leading-tight">
          <div className="font-body text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#E7E7F3]/60">
            {label}
          </div>
          <div className="font-headline text-[13px] font-semibold text-[#FAFAFF]">
            {value}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────── Public component ─────────── */
export default function HeroMoleculeField() {
  return (
    <div className="relative h-full w-full min-h-[440px]" data-testid="hero-molecule-field">
      {/* Layer 1 — background particle field */}
      <ParticleField />

      {/* Layer 2 — protein ribbon (focal point) */}
      <div className="absolute inset-0 flex items-center justify-center px-4 py-4">
        <div className="relative h-full w-full max-w-[560px]">
          <ProteinRibbon />
        </div>
      </div>

      {/* Layer 3 — floating scientific cards */}
      <InfoCard
        testid="hero-card-target"
        Icon={Target}
        label="Protein Target"
        value="AKT1"
        accent="#c4b5fd"
        className="left-2 top-4 sm:left-4"
        delay={0.15}
      />
      <InfoCard
        testid="hero-card-binding"
        Icon={Atom}
        label="Binding Site"
        value="Active Site"
        accent="#2BB673"
        className="left-2 bottom-16 sm:left-6"
        delay={0.35}
      />
      <InfoCard
        testid="hero-card-compound"
        Icon={Beaker}
        label="Top Compound"
        value="Quercetin"
        accent="#F59E0B"
        className="right-2 top-6 sm:right-4"
        delay={0.25}
      />
      <InfoCard
        testid="hero-card-pathway"
        Icon={Network}
        label="Pathway"
        value="PI3K / AKT"
        accent="#8139ED"
        className="right-2 top-1/2 -translate-y-1/2 sm:right-2"
        delay={0.45}
      />
      <InfoCard
        testid="hero-card-evidence"
        Icon={ShieldCheck}
        label="Evidence"
        value="High"
        accent="#2BB673"
        className="right-4 bottom-6"
        delay={0.55}
      />

      <style>{`
        @keyframes hero-tilt {
          0%,100% { transform: perspective(1000px) rotateX(6deg)  rotateY(-10deg); }
          50%     { transform: perspective(1000px) rotateX(-4deg) rotateY(12deg); }
        }
      `}</style>
    </div>
  );
}
