// PlantInfoCard — botanical info card shown above the compound results.
// Data source: Wikipedia REST API (free, no auth). Gives us image thumbnail,
// short article summary (used as "Traditional medicinal uses"), family via
// Wikidata property P171, and both required references (image + article).
//
// This is a FRONTEND-ONLY enhancement — the compound retrieval pipeline is
// completely untouched.
import { useEffect, useState } from "react";
import { Loader2, ExternalLink, Leaf } from "lucide-react";

const WIKI_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const WIKIDATA_ENTITY = "https://www.wikidata.org/wiki/Special:EntityData/";

// ── botanical fallback family map for common Ayurvedic/medicinal genera ──
const FAMILY_HINTS = {
  ocimum: "Lamiaceae",
  withania: "Solanaceae",
  bacopa: "Plantaginaceae",
  curcuma: "Zingiberaceae",
  zingiber: "Zingiberaceae",
  azadirachta: "Meliaceae",
  tinospora: "Menispermaceae",
  centella: "Apiaceae",
  emblica: "Phyllanthaceae",
  terminalia: "Combretaceae",
  aloe: "Asphodelaceae",
  moringa: "Moringaceae",
  glycyrrhiza: "Fabaceae",
  boswellia: "Burseraceae",
  camellia: "Theaceae",
};

async function fetchPlantSummary(name) {
  // 1. Summary endpoint — thumbnail + extract + article URL
  const url = WIKI_SUMMARY + encodeURIComponent(name);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Wikipedia lookup failed (${res.status})`);
  const s = await res.json();

  // Family resolution: prefer our vetted hint map (species→family), then
  // Wikidata as a fallback. Wikidata's P171 returns the IMMEDIATE parent
  // taxon (genus for a species), which is why we hint first.
  const genus = (name.split(/\s+/)[0] || "").toLowerCase();
  let family = FAMILY_HINTS[genus] || null;
  if (!family) {
    try {
      if (s.wikibase_item) {
        const wd = await fetch(WIKIDATA_ENTITY + s.wikibase_item + ".json");
        if (wd.ok) {
          const j = await wd.json();
          const claim = j?.entities?.[s.wikibase_item]?.claims?.P171?.[0];
          const familyQid = claim?.mainsnak?.datavalue?.value?.id;
          if (familyQid) {
            const fam = await fetch(WIKIDATA_ENTITY + familyQid + ".json");
            if (fam.ok) {
              const fj = await fam.json();
              family = fj?.entities?.[familyQid]?.labels?.en?.value || null;
            }
          }
        }
      }
    } catch { /* keep null */ }
  }

  return {
    title: s.title || name,
    scientificName: s.title || name,
    family,
    description: s.extract || "",
    imageUrl: s.originalimage?.source || s.thumbnail?.source || null,
    imageAttrPage: s.originalimage?.source
      ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(
          (s.originalimage.source.split("/").pop() || "").replace(/\.\w+$/, "")
        )}`
      : s.content_urls?.desktop?.page || null,
    articleUrl: s.content_urls?.desktop?.page || null,
  };
}

export default function PlantInfoCard({ plantName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  if (!plantName) return null;

  return (
    <section
      data-testid="plant-info-card"
      className="relative mx-auto mt-10 max-w-7xl px-4 sm:px-6"
    >
      <div className="overflow-hidden rounded-3xl border border-[#E7E7F3] bg-white shadow-[0_24px_80px_-40px_rgba(81,57,237,0.35)]">
        {loading && (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-[#64748B]">
            <Loader2 className="h-4 w-4 animate-spin text-[#5139ED]" />
            Fetching botanical information for <em className="ml-1">{plantName}</em>…
          </div>
        )}
        {error && !loading && (
          <div className="px-6 py-6 text-sm text-[#B91C1C]">
            Could not load botanical information for <em>{plantName}</em>: {error}
          </div>
        )}
        {data && !loading && (
          <>
            {/* Image band */}
            {data.imageUrl ? (
              <div
                data-testid="plant-info-image"
                className="relative h-56 w-full overflow-hidden bg-[#F5F5FC] sm:h-72 md:h-80"
              >
                <img
                  src={data.imageUrl}
                  alt={data.scientificName}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/40 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 px-4 py-3 sm:px-6">
                  <div>
                    <div className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-white/80">
                      Plant Information
                    </div>
                    <div className="mt-0.5 font-display text-xl italic text-white sm:text-2xl">
                      {data.scientificName}
                    </div>
                  </div>
                  {data.family && (
                    <span
                      data-testid="plant-info-family"
                      className="inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#5139ED] backdrop-blur"
                    >
                      <Leaf className="h-3 w-3" /> {data.family}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="px-6 pt-6">
                <div className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">
                  Plant Information
                </div>
                <h2 className="mt-1 font-display text-2xl italic text-[#0B0B18]">
                  {data.scientificName}
                </h2>
                {data.family && (
                  <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-[#5139ED]">
                    <Leaf className="mr-1 inline h-3 w-3" /> {data.family}
                  </p>
                )}
              </div>
            )}

            {/* Details */}
            <div className="px-4 py-5 sm:px-6 sm:py-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">
                Traditional medicinal uses
              </div>
              <p
                data-testid="plant-info-uses"
                className="mt-2 text-sm leading-relaxed text-[#374151] sm:text-[15px]"
              >
                {data.description || "No description available."}
              </p>

              {/* References */}
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#F1F1FA] pt-4 text-xs">
                <span className="font-semibold uppercase tracking-widest text-[#94A3B8]">
                  References:
                </span>
                {data.imageAttrPage && (
                  <a
                    data-testid="plant-info-image-source"
                    href={data.imageAttrPage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1 font-medium text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
                  >
                    Image Source <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {data.articleUrl && (
                  <a
                    data-testid="plant-info-botanical-source"
                    href={data.articleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1 font-medium text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
                  >
                    Botanical Information Source <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
