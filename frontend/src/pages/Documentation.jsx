// Documentation — in-app scientific documentation viewer at `/documentation`.
// Renders the canonical PhytoNet AI markdown (public/docs/phytonet-ai.md)
// with:
//   • Sticky left ToC that highlights the section currently in view.
//   • Copy-code buttons on every fenced block.
//   • A "walkthrough" thumbnail next to each module section — static
//     screenshots stored under public/docs/screens/. When a screenshot is
//     unavailable the slot renders a neutral placeholder so the layout stays
//     stable.
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, BookOpen, ExternalLink } from "lucide-react";
import { toast } from "sonner";

// Slug helper — matches the ids react-markdown gives to h2/h3 headings via
// `remark-gfm` + our custom heading renderer below.
const slug = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

// Static map: markdown section slug → public screenshot url.
// When a slug is missing the section renders without a preview.
const SECTION_SCREENSHOTS = {
  "1-what-is-phytonet-ai":                     "/docs/screens/home.jpg",
  "2-complete-phytonet-ai-workflow":            "/docs/screens/workspace.jpg",
  "3-phytochemical-module-routeslotuspy-plants_seedpy": "/docs/screens/plant-database.jpg",
  "4-target-prediction-module-target_servicepy": "/docs/screens/target-prediction.jpg",
  "5-disease-target-network-pharmacology-disease_servicepy-network_servicepy": "/docs/screens/network-analysis.jpg",
  "6-molecular-docking-module-docking_servicepy-docking_renderpy-docking_validationpy": "/docs/screens/docking.jpg",
  "7-ai-component":                            "/docs/screens/ai-report.jpg",
  "11-project-management-projects_servicepy":  "/docs/screens/projects.jpg",
};

/* ─────────── Code block with copy button ─────────── */
function CodeBlock({ inline, className, children }) {
  const [copied, setCopied] = useState(false);
  const text = String(children).replace(/\n$/, "");

  if (inline) {
    return (
      <code className="rounded bg-[#F1F1FA] px-1.5 py-0.5 font-mono text-[12.5px] text-[#5139ED]">
        {children}
      </code>
    );
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="group relative my-3 overflow-hidden rounded-xl border border-[#E7E7F3] bg-[#0F0E24]">
      <button
        type="button"
        onClick={onCopy}
        data-testid="docs-copy-code"
        className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-[11px] font-body font-semibold text-white/85 backdrop-blur opacity-0 transition group-hover:opacity-100"
        aria-label="Copy code"
      >
        {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
      </button>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed text-[#E7E7F3]">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

/* ─────────── Heading with id (used for ToC anchors) ─────────── */
function makeHeading(level) {
  return function Heading({ children }) {
    const text = Array.isArray(children) ? children.join(" ") : String(children);
    const id = slug(text);
    const Tag = `h${level}`;
    const cls = {
      2: "font-headline mt-10 mb-3 scroll-mt-24 text-[24px] font-bold text-[#0B0B18]",
      3: "font-headline mt-6 mb-2 scroll-mt-24 text-[17px] font-semibold text-[#0B0B18]",
      4: "font-headline mt-4 mb-1 text-[14px] font-semibold uppercase tracking-widest text-[#5139ED]",
    }[level] || "";
    return <Tag id={id} className={cls}>{children}</Tag>;
  };
}

/* ─────────── Walkthrough thumbnail slot ─────────── */
function Walkthrough({ src, label }) {
  const [broken, setBroken] = useState(false);
  return (
    <figure
      data-testid={`docs-walkthrough-${slug(label)}`}
      className="my-4 overflow-hidden rounded-xl border border-[#E7E7F3] bg-[#F8FAFC]"
    >
      {!broken && src ? (
        <img
          src={src}
          alt={`${label} walkthrough`}
          onError={() => setBroken(true)}
          className="block h-auto w-full"
          loading="lazy"
        />
      ) : (
        <div className="flex h-40 items-center justify-center bg-gradient-to-br from-[#F8FAFC] to-[#EDF2FA] text-[12px] font-body text-[#64748B]">
          Screenshot pending capture
        </div>
      )}
      <figcaption className="flex items-center justify-between border-t border-[#E7E7F3] px-3 py-2 text-[11px] font-body text-[#64748B]">
        <span className="font-semibold uppercase tracking-widest text-[#5139ED]">Walkthrough</span>
        <span>{label}</span>
      </figcaption>
    </figure>
  );
}

/* ─────────── ToC (built from headings) ─────────── */
function useToc(markdown) {
  return useMemo(() => {
    const lines = markdown.split("\n");
    return lines
      .filter((l) => /^##\s+/.test(l))
      .map((l) => {
        const text = l.replace(/^##\s+/, "").trim();
        return { text, id: slug(text) };
      });
  }, [markdown]);
}

/* ─────────── Public page ─────────── */
export default function Documentation() {
  const [markdown, setMarkdown] = useState("");
  const [activeId, setActiveId] = useState("");
  const scrollerRef = useRef(null);

  useEffect(() => {
    fetch("/docs/phytonet-ai.md")
      .then((r) => r.text())
      .then(setMarkdown)
      .catch(() => setMarkdown("# Documentation\n\nCould not load."));
  }, []);

  // Split markdown into (section) chunks so we can inject walkthroughs
  // between the heading and its body without a custom markdown extension.
  const chunks = useMemo(() => {
    if (!markdown) return [];
    // Chunk on `## ` boundaries; keep any preamble (title, description) as
    // the first chunk with id = "".
    const parts = markdown.split(/\n(?=##\s)/g);
    return parts.map((part) => {
      const m = part.match(/^##\s+([^\n]+)/);
      const heading = m ? m[1].trim() : "";
      return { heading, id: heading ? slug(heading) : "", md: part };
    });
  }, [markdown]);

  const toc = useToc(markdown);

  // Active-section detection via IntersectionObserver on the section headings.
  useEffect(() => {
    const roots = document.querySelectorAll("[data-doc-section]");
    if (!roots.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActiveId(e.target.id); });
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 }
    );
    roots.forEach((r) => obs.observe(r));
    return () => obs.disconnect();
  }, [chunks.length]);

  return (
    <div className="min-h-screen w-full bg-white text-[#0B0B18]">
      {/* Top bar */}
      <div className="border-b border-[#E7E7F3] bg-[#FAFAFF]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#5139ED] text-white">
              <BookOpen className="h-4 w-4" />
            </span>
            <div>
              <div className="font-headline text-[11px] font-bold uppercase tracking-widest text-[#5139ED]">
                PhytoNet AI
              </div>
              <h1 className="font-headline text-[18px] font-bold">Documentation</h1>
            </div>
          </div>
          <a
            href="/docs/phytonet-ai.md"
            download
            data-testid="docs-download-md"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E7F3] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0B0B18] hover:bg-[#F8FAFC]"
          >
            Download Markdown <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Layout: sticky ToC + article */}
      <div className="mx-auto grid max-w-6xl grid-cols-12 gap-8 px-6 py-8">
        {/* ToC */}
        <aside className="col-span-12 md:col-span-3">
          <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-xl border border-[#E7E7F3] bg-[#FAFAFF] p-4"
               data-testid="docs-toc">
            <div className="font-headline mb-3 text-[10.5px] font-bold uppercase tracking-widest text-[#64748B]">
              On this page
            </div>
            <nav className="space-y-1">
              {toc.map(({ text, id }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  data-testid={`docs-toc-${id}`}
                  className={`block truncate rounded-md px-2 py-1.5 text-[12.5px] transition ${
                    activeId === id
                      ? "bg-white text-[#5139ED] font-semibold shadow-sm ring-1 ring-[#5139ED]/25"
                      : "text-[#334155] hover:bg-white/70"
                  }`}
                >
                  {text}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* Article */}
        <article
          ref={scrollerRef}
          className="prose col-span-12 max-w-none md:col-span-9"
          data-testid="docs-article"
        >
          {chunks.map((chunk, idx) => {
            const screenshot = SECTION_SCREENSHOTS[chunk.id];
            return (
              <section
                key={idx}
                id={chunk.id || undefined}
                data-doc-section={chunk.heading || undefined}
              >
                {screenshot && (
                  <Walkthrough src={screenshot} label={chunk.heading} />
                )}
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: makeHeading(1),
                    h2: makeHeading(2),
                    h3: makeHeading(3),
                    h4: makeHeading(4),
                    code: CodeBlock,
                    a: ({ href, children }) => (
                      <a href={href} className="text-[#5139ED] underline decoration-[#5139ED]/40 hover:decoration-[#5139ED]">
                        {children}
                      </a>
                    ),
                    table: ({ children }) => (
                      <div className="my-3 overflow-x-auto">
                        <table className="w-full border-collapse text-[13px]">
                          {children}
                        </table>
                      </div>
                    ),
                    th: ({ children }) => (
                      <th className="border-b border-[#E7E7F3] bg-[#F8FAFC] px-3 py-2 text-left font-semibold text-[#0B0B18]">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="border-b border-[#F1F1FA] px-3 py-2 align-top text-[#334155]">
                        {children}
                      </td>
                    ),
                    p: ({ children }) => (
                      <p className="my-3 text-[14px] leading-relaxed text-[#334155]">
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
                      <ul className="my-3 list-disc space-y-1 pl-6 text-[14px] leading-relaxed text-[#334155]">
                        {children}
                      </ul>
                    ),
                    li: ({ children }) => <li>{children}</li>,
                    hr: () => <hr className="my-8 border-[#E7E7F3]" />,
                    blockquote: ({ children }) => (
                      <blockquote className="my-4 rounded-r-lg border-l-4 border-[#5139ED] bg-[#F5F3FE] px-4 py-3 text-[13.5px] leading-relaxed text-[#0B0B18]">
                        {children}
                      </blockquote>
                    ),
                  }}
                >
                  {chunk.md}
                </ReactMarkdown>
              </section>
            );
          })}
        </article>
      </div>
    </div>
  );
}
