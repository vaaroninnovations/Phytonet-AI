// HeroPremiumScene — a refined, "premium-and-aesthetic" hero visualisation
// that symbolises the PhytoNet motto: a single central protein–ligand
// complex sitting inside an outward-radiating molecular network — the
// network-pharmacology "one compound → many targets → many pathways"
// story compressed into a single image.
//
// Composition (back → front):
//   1. Deep dark canvas + soft green/purple radial auras.
//   2. Constellation particle field — nodes drifting on 2 orbital shells
//      around the protein, connected by faint dashed edges (the "network"
//      layer). A few nodes carry tiny labels (Target · Pathway · Compound…)
//      to reinforce the story without cluttering the frame.
//   3. Real WebGL AKT1 protein (PDB 4EJN) with element-coloured ligand,
//      rendered in a clean single-tone emerald cartoon — auto-rotates
//      slowly, drag-rotates on interaction.
//   4. Subtle top-right watermark chip: "PhytoNet · Network Pharmacology".
//
// This component is stand-alone and side-effect-free — safe to mount on a
// preview route while we tune it, then drop into the hero later.
import { useEffect, useRef } from "react";
import Hero3DProtein from "./Hero3DProtein";

/* ─────────── Constellation particle network ─────────── */
// Two orbital shells around a central hub. Each node has a slow angular
// velocity; we redraw dashed links only between neighbours below a
// threshold distance so the network breathes without a fixed graph.
const HUB_X_RATIO = 0.5;
const HUB_Y_RATIO = 0.50;
const SHELL_1_RATIO = 0.34;   // inner shell radius (relative to min(w,h))
const SHELL_2_RATIO = 0.48;   // outer shell radius
const NODES_INNER = 14;
const NODES_OUTER = 22;
const CONNECT_RADIUS = 140;   // px

// Some outer nodes carry a subtle text label — the story labels.
const OUTER_LABELS = [
  "Target", "Pathway", "Compound", "Disease", "Evidence",
  "ADMET", "Docking", "Network",
];

function Constellation() {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const stateRef  = useRef({ nodes: [], w: 0, h: 0, dpr: 1, t0: performance.now() });

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    const s   = stateRef.current;

    const seed = () => {
      const { w, h } = s;
      const hx = w * HUB_X_RATIO, hy = h * HUB_Y_RATIO;
      const rMin = Math.min(w, h);
      const r1 = rMin * SHELL_1_RATIO;
      const r2 = rMin * SHELL_2_RATIO;

      const inner = Array.from({ length: NODES_INNER }, (_, i) => {
        const a = (i / NODES_INNER) * Math.PI * 2 + Math.random() * 0.2;
        return {
          hx, hy,
          r: r1 * (0.85 + Math.random() * 0.25),
          angle: a,
          omega: 0.00006 + Math.random() * 0.00006,       // rad / ms
          size: 1.6 + Math.random() * 1.4,
          color: Math.random() < 0.75
            ? "rgba(43,182,115," // green
            : "rgba(196,181,253,",                        // lavender
          label: null,
        };
      });
      const outer = Array.from({ length: NODES_OUTER }, (_, i) => {
        const a = (i / NODES_OUTER) * Math.PI * 2 + Math.random() * 0.15;
        return {
          hx, hy,
          r: r2 * (0.9 + Math.random() * 0.20),
          angle: a,
          omega: 0.00003 + Math.random() * 0.00004,
          size: 1.3 + Math.random() * 1.0,
          color: Math.random() < 0.60
            ? "rgba(129,57,237,"                          // purple
            : "rgba(43,182,115,",
          // Only a subset carry labels (every ~3rd) so the frame stays clean.
          label: i % Math.ceil(NODES_OUTER / OUTER_LABELS.length) === 0
            ? OUTER_LABELS[Math.floor(i / Math.ceil(NODES_OUTER / OUTER_LABELS.length)) % OUTER_LABELS.length]
            : null,
        };
      });

      s.nodes = [...inner, ...outer];
    };

    const resize = () => {
      const rect = c.getBoundingClientRect();
      s.w = rect.width; s.h = rect.height;
      s.dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width  = s.w * s.dpr;
      c.height = s.h * s.dpr;
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      seed();
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (t) => {
      const { w, h, nodes } = s;
      const hx = w * HUB_X_RATIO, hy = h * HUB_Y_RATIO;
      ctx.clearRect(0, 0, w, h);

      // Advance angles + compute positions
      for (const n of nodes) {
        n.angle += n.omega * 16;                              // ~60fps
        n.x = hx + Math.cos(n.angle) * n.r;
        n.y = hy + Math.sin(n.angle) * n.r * 0.86;            // gentle ellipse (perspective)
      }

      // Dashed edges — nearest-neighbour graph
      ctx.setLineDash([2.5, 5]);
      ctx.lineWidth = 0.7;
      for (let i = 0; i < nodes.length; i++) {
        const p = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const q = nodes[j];
          const dx = p.x - q.x, dy = p.y - q.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < CONNECT_RADIUS * CONNECT_RADIUS) {
            const alpha = 0.20 * (1 - Math.sqrt(d2) / CONNECT_RADIUS);
            ctx.strokeStyle = `rgba(196,181,253,${alpha.toFixed(3)})`;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
      }
      // Also draw very faint spokes from hub to a handful of nodes so the
      // "one compound → many targets" visual metaphor reads instantly.
      for (let i = 0; i < nodes.length; i += 4) {
        const p = nodes[i];
        ctx.strokeStyle = "rgba(43,182,115,0.10)";
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      ctx.setLineDash([]);

      // Nodes — glow halo + solid core
      for (const n of nodes) {
        ctx.fillStyle = n.color + "0.10)";
        ctx.beginPath(); ctx.arc(n.x, n.y, n.size * 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = n.color + "0.85)";
        ctx.beginPath(); ctx.arc(n.x, n.y, n.size,       0, Math.PI * 2); ctx.fill();
      }

      // Labels — small, low-key, only on outer shell nodes that carry one
      ctx.font = "500 10.5px ui-sans-serif, system-ui";
      ctx.fillStyle = "rgba(231,231,243,0.65)";
      ctx.textBaseline = "middle";
      for (const n of nodes) {
        if (!n.label) continue;
        const tx = n.x + (n.x > hx ? 8 : -8);
        const ty = n.y;
        ctx.textAlign = n.x > hx ? "left" : "right";
        ctx.fillText(n.label, tx, ty);
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="hero-constellation"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}

/* ─────────── Public component ─────────── */
export default function HeroPremiumScene() {
  const proteinRef = useRef(null);

  return (
    <div
      data-testid="hero-premium-scene"
      className="relative h-full w-full overflow-hidden"
      style={{
        background:
          "radial-gradient(70% 60% at 50% 50%, rgba(43,182,115,0.10) 0%, rgba(15,14,36,0.0) 55%), " +
          "radial-gradient(80% 60% at 15% 20%, rgba(129,57,237,0.14) 0%, rgba(15,14,36,0.0) 60%), " +
          "radial-gradient(80% 60% at 85% 80%, rgba(43,182,115,0.10) 0%, rgba(15,14,36,0.0) 60%), " +
          "#0F0E24",
      }}
    >
      {/* Very faint grid — the same texture as the rest of the marketing pages */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.05]"
           style={{ backgroundImage:
             "linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)",
             backgroundSize: "56px 56px" }} />

      {/* Layer 1 — constellation network */}
      <Constellation />

      {/* Layer 2 — protein complex (interactive) */}
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <div className="relative h-full w-full max-w-[720px] px-6 py-6">
          <Hero3DProtein ref={proteinRef} />
        </div>
      </div>

      {/* Watermark chip — reinforces the motto */}
      <div className="pointer-events-none absolute right-4 top-4 z-20 inline-flex items-center gap-2 rounded-full border border-[#FAFAFF]/12 bg-[#0F0E24]/60 px-3 py-1 text-[10.5px] font-body font-semibold uppercase tracking-[0.18em] text-[#E7E7F3]/70 backdrop-blur">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#2BB673]" />
        PhytoNet · Network Pharmacology
      </div>

      {/* Ligand caption — a small, cinematic annotation near the pocket
          that names the story without any card clutter. */}
      <div className="pointer-events-none absolute bottom-6 left-6 z-20 max-w-[280px]">
        <div className="text-[10.5px] font-body font-semibold uppercase tracking-[0.18em] text-[#2BB673]">
          Compound → Target
        </div>
        <div className="mt-1 font-headline text-[16px] font-bold leading-tight text-[#FAFAFF]">
          Quercetin bound to AKT1
        </div>
        <div className="mt-1 font-body text-[11.5px] text-[#E7E7F3]/65">
          Active-site docking · PI3K / AKT pathway · Evidence: High
        </div>
      </div>
    </div>
  );
}
