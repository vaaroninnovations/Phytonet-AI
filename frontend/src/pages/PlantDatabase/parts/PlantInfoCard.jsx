// PlantInfoCard — botanical info card shown above the compound results.
// Left: hero image (whole plant). Right: description + medicinal part label.
// Data source: Wikipedia REST API (summary + media-list endpoints, free, no
// auth). Family and medicinal-part label come from vetted hint maps for common
// medicinal genera. Lightbox includes a "Download image" button that pulls the
// original-resolution file from Wikimedia Commons.
//
// FRONTEND-ONLY — the compound retrieval pipeline is untouched.
import { useEffect, useState, useCallback } from "react";
import { Loader2, ExternalLink, Leaf, X, ZoomIn, Camera } from "lucide-react";

const WIKI_SUMMARY   = "https://en.wikipedia.org/api/rest_v1/page/summary/";
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

/** Fetch summary + best-effort family from Wikipedia REST API. */
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

  // Hero image — use Wikipedia's "originalimage" (full resolution) when available,
  // otherwise fall back to the summary thumbnail. This same URL is passed to the
  // lightbox "Download image" button so users can save the publication-quality file.
  const wholePlant = s.originalimage?.source || s.thumbnail?.source || null;

  const medicinalLabel = MEDICINAL_PART_HINTS[genus] || null;

  return {
    scientificName: s.title || name,
    family,
    description: s.extract || "",
    wholePlantUrl: wholePlant,
    medicinalLabel,
    articleUrl: s.content_urls?.desktop?.page || null,
  };
}

/* ─────────────── Lightbox modal ─────────────── */
function Lightbox({ src, caption, downloadUrl, onClose }) {
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

  // Wikimedia serves images cross-origin without CORS; a fetch→blob download
  // often fails. We try blob first (best UX — real "Save As" dialog) and fall
  // back to opening the original file in a new tab so users can right-click →
  // Save Image without leaving the app.
  const handleDownload = async (e) => {
    e.stopPropagation();
    const url = downloadUrl || src;
    if (!url) return;
    const filename = (() => {
      try {
        const raw = decodeURIComponent(url.split("/").pop() || "plant-image.jpg");
        return raw.split("?")[0] || "plant-image.jpg";
      } catch { return "plant-image.jpg"; }
    })();
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1500);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

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

      {/* Camera-icon Download badge — floats top-left of the lightbox */}
      <button
        data-testid="plant-info-lightbox-download"
        onClick={handleDownload}
        title="Download original-resolution image from Wikimedia Commons"
        className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full bg-white/95 px-3.5 py-2 text-xs font-bold uppercase tracking-widest text-[#5139ED] shadow-lg transition hover:-translate-y-0.5 hover:bg-white hover:shadow-xl"
      >
        <Camera className="h-4 w-4" />
        Download image
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
function ImageTile({ src, caption, testid, onOpen, tall = false }) {
  const heightCls = tall
    ? "h-64 sm:h-80 md:h-[26rem] lg:h-[30rem]"
    : "h-56 sm:h-64 md:h-72";
  if (!src) {
    return (
      <div className={`flex ${heightCls} items-center justify-center rounded-2xl border border-dashed border-[#E7E7F3] bg-[#F5F5FC] text-xs text-[#94A3B8]`}>
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
        <div className={`${heightCls} w-full overflow-hidden`}>
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

  const openLightbox = useCallback((src, caption) => setLb({ src, caption, downloadUrl: src }), []);

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
              {/* Left: single hero image · Right: description */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-5 md:gap-8">
                <div className="md:col-span-2">
                  <ImageTile
                    src={data.wholePlantUrl}
                    caption="Whole Plant"
                    testid="plant-info-image-whole"
                    onOpen={openLightbox}
                    tall
                  />
                </div>

                <div className="md:col-span-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">
                    Traditional medicinal uses
                  </div>
                  <p
                    data-testid="plant-info-uses"
                    className="mt-2 text-sm leading-relaxed text-[#374151] sm:text-[15px]"
                  >
                    {data.description || "No description available."}
                  </p>
                  {data.medicinalLabel && (
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-[#F5F5FC] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#5139ED]">
                      <Leaf className="h-3 w-3" />
                      Part used: {data.medicinalLabel}
                    </div>
                  )}
                </div>
              </div>

              {/* References */}
              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[#F1F1FA] pt-4 text-xs">
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

      {lb && <Lightbox src={lb.src} caption={lb.caption} downloadUrl={lb.downloadUrl} onClose={() => setLb(null)} />}
    </section>
  );
}
