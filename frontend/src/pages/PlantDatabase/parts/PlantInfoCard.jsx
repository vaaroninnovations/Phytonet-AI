// PlantInfoCard — botanical info card shown above the compound results.
// Two images: whole plant + medicinal part used. Data source: Wikipedia REST
// API (summary + media-list endpoints, free, no auth). Family and medicinal-
// part label come from vetted hint maps for common medicinal genera.
//
// FRONTEND-ONLY — the compound retrieval pipeline is untouched.
import { useEffect, useState, useCallback } from "react";
import { Loader2, ExternalLink, Leaf, X, ZoomIn } from "lucide-react";

const WIKI_SUMMARY   = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const WIKI_MEDIALIST = "https://en.wikipedia.org/api/rest_v1/page/media-list/";
const WIKIDATA_ENT   = "https://www.wikidata.org/wiki/Special:EntityData/";

// ── botanical fallback family map for common Ayurvedic/medicinal genera ──
const FAMILY_HINTS = {
  ocimum: "Lamiaceae", withania: "Solanaceae", bacopa: "Plantaginaceae",
  curcuma: "Zingiberaceae", zingiber: "Zingiberaceae", azadirachta: "Meliaceae",
  tinospora: "Menispermaceae", centella: "Apiaceae", emblica: "Phyllanthaceae",
  terminalia: "Combretaceae", aloe: "Asphodelaceae", moringa: "Moringaceae",
  glycyrrhiza: "Fabaceae", boswellia: "Burseraceae", camellia: "Theaceae",
};

// ── medicinal-part label hints (genus → part(s) used pharmaceutically) ──
const MEDICINAL_PART_HINTS = {
  withania: "Root",
  bacopa: "Whole herb / aerial parts",
  curcuma: "Rhizome",
  zingiber: "Rhizome",
  ocimum: "Leaves",
  centella: "Whole herb / leaves",
  azadirachta: "Leaves and bark",
  tinospora: "Stem",
  emblica: "Fruit",
  terminalia: "Fruit",
  aloe: "Leaf gel",
  moringa: "Leaves and pods",
  glycyrrhiza: "Root",
  boswellia: "Resin (gum)",
  camellia: "Leaves",
  ginkgo: "Leaves",
  cannabis: "Flowering tops",
  panax: "Root",
  papaver: "Latex / capsule",
};

/** Pick the top N reasonably-sized images from Wikipedia's media list. Filters
 *  out logos, icons, SVG diagrams, and taxonomic tree images so we get real
 *  photographs of the plant. */
async function fetchArticleImages(title, wantN = 2) {
  const url = WIKI_MEDIALIST + encodeURIComponent(title);
  const res = await fetch(url);
  if (!res.ok) return [];
  const j = await res.json();
  const items = (j.items || [])
    .filter((it) => it.type === "image")
    .filter((it) => {
      const t = (it.title || "").toLowerCase();
      // Skip icons/diagrams/logos/taxonomy trees
      return !/\.svg$/i.test(t)
        && !/(icon|logo|status|distribution|range|map|graph|chart|placeholder)/i.test(t)
        && !/(commons-logo)/i.test(t);
    });
  // Prefer higher-resolution originals
  return items
    .map((it) => {
      const src = it.srcset?.[it.srcset.length - 1]?.src || it.src || "";
      // media-list returns paths like //upload.wikimedia.org/... — add scheme
      return src.startsWith("//") ? "https:" + src : src;
    })
    .filter(Boolean)
    .slice(0, wantN * 3);      // return extras so caller can dedupe/pick
}

async function fetchPlantSummary(name) {
  // 1. Summary — thumbnail + extract + article URL
  const res = await fetch(WIKI_SUMMARY + encodeURIComponent(name),
                          { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Wikipedia lookup failed (${res.status})`);
  const s = await res.json();

  // 2. Family: prefer vetted hint (species→family), then Wikidata P171 fallback
  const genus = (name.split(/\s+/)[0] || "").toLowerCase();
  let family = FAMILY_HINTS[genus] || null;
  if (!family) {
    try {
      if (s.wikibase_item) {
        const wd = await fetch(WIKIDATA_ENT + s.wikibase_item + ".json");
        if (wd.ok) {
          const j = await wd.json();
          const claim = j?.entities?.[s.wikibase_item]?.claims?.P171?.[0];
          const qid = claim?.mainsnak?.datavalue?.value?.id;
          if (qid) {
            const fam = await fetch(WIKIDATA_ENT + qid + ".json");
            if (fam.ok) {
              const fj = await fam.json();
              family = fj?.entities?.[qid]?.labels?.en?.value || null;
            }
          }
        }
      }
    } catch { /* keep null */ }
  }

  // 3. Two images — the summary thumbnail becomes image 1; media-list supplies image 2
  const wholePlant = s.originalimage?.source || s.thumbnail?.source || null;
  let medicinalPart = null;
  try {
    const extras = await fetchArticleImages(s.title || name, 2);
    // Prefer an image that ISN'T identical to the whole-plant one
    medicinalPart = extras.find((u) => u && u !== wholePlant) || null;
    if (!medicinalPart && extras.length) medicinalPart = extras[0];
  } catch { /* leave null */ }

  const medicinalLabel = MEDICINAL_PART_HINTS[genus] || "Medicinal part";

  return {
    scientificName: s.title || name,
    family,
    description: s.extract || "",
    wholePlantUrl: wholePlant,
    medicinalPartUrl: medicinalPart,
    medicinalLabel,
    articleUrl: s.content_urls?.desktop?.page || null,
  };
}

/* ─────────────── Lightbox modal ─────────────── */
function Lightbox({ src, caption, onClose }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onWheel = (e) => {
    e.preventDefault();
    setScale((s) => Math.min(6, Math.max(1, s + (e.deltaY < 0 ? 0.2 : -0.2))));
  };
  const onMouseDown = (e) => setDragging({ x: e.clientX - pos.x, y: e.clientY - pos.y });
  const onMouseMove = (e) => {
    if (!dragging) return;
    setPos({ x: e.clientX - dragging.x, y: e.clientY - dragging.y });
  };
  const stopDrag = () => setDragging(null);

  return (
    <div
      data-testid="plant-info-lightbox"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur"
    >
      <button
        data-testid="plant-info-lightbox-close"
        onClick={onClose}
        className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
      <div
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        style={{ cursor: dragging ? "grabbing" : "grab" }}
        className="relative flex max-h-[90vh] max-w-[92vw] items-center justify-center overflow-hidden"
      >
        <img
          src={src}
          alt={caption}
          draggable={false}
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transition: dragging ? "none" : "transform 150ms ease-out",
          }}
          className="max-h-[90vh] max-w-[92vw] select-none object-contain"
        />
      </div>
      <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/95 px-4 py-1.5 text-xs font-semibold text-[#0B0B18]">
        {caption} · scroll to zoom · drag to pan · Esc to close
      </div>
    </div>
  );
}

/* ─────────────── Image tile with hover zoom + click-to-lightbox ─────────────── */
function ImageTile({ src, caption, testid, onOpen }) {
  if (!src) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-[#E7E7F3] bg-[#F5F5FC] text-xs text-[#94A3B8] sm:h-64 md:h-72">
        No image available for “{caption}”
      </div>
    );
  }
  return (
    <figure className="group">
      <button
        type="button"
        data-testid={testid}
        onClick={() => onOpen(src, caption)}
        title={`${caption} — click to enlarge`}
        className="relative block w-full cursor-zoom-in overflow-hidden rounded-2xl border border-[#E7E7F3] bg-[#F5F5FC] shadow-sm transition-shadow duration-300 hover:shadow-[0_18px_60px_-12px_rgba(81,57,237,0.35)]"
      >
        <div className="h-56 w-full overflow-hidden sm:h-64 md:h-72">
          <img
            src={src}
            alt={caption}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.08]"
          />
        </div>
        <span className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[#5139ED] opacity-0 transition-opacity group-hover:opacity-100">
          <ZoomIn className="h-3 w-3" /> Zoom
        </span>
      </button>
      <figcaption className="mt-2 text-center text-[11.5px] font-semibold uppercase tracking-widest text-[#5139ED]">
        {caption}
      </figcaption>
    </figure>
  );
}

/* ─────────────── Main card ─────────────── */
export default function PlantInfoCard({ plantName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lb, setLb] = useState(null); // { src, caption } | null

  useEffect(() => {
    if (!plantName) { setData(null); return; }
    let cancelled = false;
    setLoading(true); setError(null); setData(null);
    fetchPlantSummary(plantName)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message || "Lookup failed"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [plantName]);

  const openLightbox = useCallback((src, caption) => setLb({ src, caption }), []);

  if (!plantName) return null;

  return (
    <section
      data-testid="plant-info-card"
      className="relative mx-auto mt-10 max-w-7xl px-4 sm:px-6"
    >
      <div className="overflow-hidden rounded-3xl border border-[#E7E7F3] bg-white shadow-[0_24px_80px_-40px_rgba(81,57,237,0.35)]">
        {/* Header strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-5 sm:px-6">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Plant Information
            </div>
            <h2 className="mt-1 font-display text-xl italic text-[#0B0B18] sm:text-2xl">
              {data?.scientificName || plantName}
            </h2>
          </div>
          {data?.family && (
            <span
              data-testid="plant-info-family"
              className="inline-flex items-center gap-1 rounded-full bg-[#5139ED]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#5139ED]"
            >
              <Leaf className="h-3 w-3" /> {data.family}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="px-4 py-5 sm:px-6 sm:py-6">
          {loading && (
            <div className="flex items-center gap-2 py-6 text-sm text-[#64748B]">
              <Loader2 className="h-4 w-4 animate-spin text-[#5139ED]" />
              Fetching botanical information…
            </div>
          )}
          {error && !loading && (
            <div className="py-4 text-sm text-[#B91C1C]">
              Could not load botanical information: {error}
            </div>
          )}

          {data && !loading && (
            <>
              {/* Two images — side-by-side on desktop, stacked on mobile */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ImageTile
                  src={data.wholePlantUrl}
                  caption="Whole Plant"
                  testid="plant-info-image-whole"
                  onOpen={openLightbox}
                />
                <ImageTile
                  src={data.medicinalPartUrl || data.wholePlantUrl}
                  caption={`Medicinal Part Used${data.medicinalLabel ? ` — ${data.medicinalLabel}` : ""}`}
                  testid="plant-info-image-medicinal"
                  onOpen={openLightbox}
                />
              </div>

              {/* Traditional medicinal uses */}
              <div className="mt-6">
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">
                  Traditional medicinal uses
                </div>
                <p
                  data-testid="plant-info-uses"
                  className="mt-2 text-sm leading-relaxed text-[#374151] sm:text-[15px]"
                >
                  {data.description || "No description available."}
                </p>
              </div>

              {/* References */}
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#F1F1FA] pt-4 text-xs">
                <span className="font-semibold uppercase tracking-widest text-[#94A3B8]">
                  References:
                </span>
                {data.articleUrl && (
                  <a
                    data-testid="plant-info-image-source"
                    href={data.articleUrl}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1 font-medium text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
                  >
                    Image Source <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {data.articleUrl && (
                  <a
                    data-testid="plant-info-botanical-source"
                    href={data.articleUrl}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1 font-medium text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
                  >
                    Botanical Information Source <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {lb && <Lightbox src={lb.src} caption={lb.caption} onClose={() => setLb(null)} />}
    </section>
  );
}
