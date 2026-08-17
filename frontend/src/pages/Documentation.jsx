// Documentation — dark-theme in-app scientific documentation viewer.
// Matches the rest of the marketing pages (Home / Pricing / Resources) —
// dark #0F0E24 canvas · Clinical-Cyber palette · sticky ToC · copy-code
// buttons · walkthrough screenshots per section.
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, BookOpen, Download } from "lucide-react";
import { toast } from "sonner";

const slug = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

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
// react-markdown v10 dropped the `inline` prop — detect inline vs fenced by
// the presence of a language className (only fenced blocks get one) and by
// whether the content contains a newline.
function CodeBlock({ className, children, ...rest }) {
  const [copied, setCopied] = useState(false);
  const text = String(children).replace(/\n$/, "");
  const isBlock = /language-/.test(className || "") || text.includes("\n");

  if (!isBlock) {
    return (
      <code className="rounded bg-[#FAFAFF]/10 px-1.5 py-0.5 font-mono text-[12.5px] text-[#c4b5fd]">
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
    } catch { toast.error("Copy failed"); }
  };

  return (
    <div className="group relative my-4 overflow-hidden rounded-xl border border-[#FAFAFF]/10 bg-[#0B0A1D]">
      <button
        type="button"
        onClick={onCopy}
        data-testid="docs-copy-code"
        className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-[11px] font-body font-semibold text-white/85 backdrop-blur opacity-0 transition group-hover:opacity-100"
      >
        {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
      </button>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed text-[#E7E7F3]">
        <code className={className} {...rest}>{children}</code>
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
      1: "font-headline mt-2 mb-4 text-[32px] font-bold tracking-tight text-[#FAFAFF]",
      2: "font-headline mt-12 mb-4 scroll-mt-24 text-[26px] font-bold tracking-tight text-[#FAFAFF]",
      3: "font-headline mt-8 mb-2 scroll-mt-24 text-[18px] font-semibold text-[#FAFAFF]",
      4: "font-headline mt-5 mb-1 text-[13px] font-bold uppercase tracking-widest text-[#c4b5fd]",
    }[level] || "";
    return <Tag id={id} className={cls}>{children}</Tag>;
  };
}

/* ─────────── Walkthrough thumbnail ─────────── */
function Walkthrough({ src, label }) {
  const [broken, setBroken] = useState(false);
  return (
    <figure
      data-testid={`docs-walkthrough-${slug(label)}`}
      className="my-6 overflow-hidden rounded-2xl border border-[#FAFAFF]/10 bg-[#12102E] shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
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
        <div className="flex h-40 items-center justify-center bg-[#12102E] text-[12px] font-body text-[#E7E7F3]/50">
          Screenshot pending capture
        </div>
      )}
      <figcaption className="flex items-center justify-between border-t border-[#FAFAFF]/10 px-3 py-2 text-[10.5px] font-body text-[#E7E7F3]/60">
        <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-widest text-[#2BB673]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#2BB673]" /> Walkthrough
        </span>
        <span className="truncate">{label}</span>
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
      .map((l) => ({ text: l.replace(/^##\s+/, "").trim(), id: slug(l.replace(/^##\s+/, "").trim()) }));
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

  const chunks = useMemo(() => {
    if (!markdown) return [];
    const parts = markdown.split(/\n(?=##\s)/g);
    return parts.map((part) => {
      const m = part.match(/^##\s+([^\n]+)/);
      const heading = m ? m[1].trim() : "";
      return { heading, id: heading ? slug(heading) : "", md: part };
    });
  }, [markdown]);

  const toc = useToc(markdown);

  useEffect(() => {
    const roots = document.querySelectorAll("[data-doc-section]");
    if (!roots.length) return;
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActiveId(e.target.id); }),
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 }
    );
    roots.forEach((r) => obs.observe(r));
    return () => obs.disconnect();
  }, [chunks.length]);

  return (
    <div className="min-h-screen w-full bg-[#0F0E24] text-[#FAFAFF]">
      {/* Ambient background — matches marketing pages */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 opacity-[0.05]"
             style={{ backgroundImage:
               "linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)",
               backgroundSize: "56px 56px" }} />
        <div className="absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,#5139ED,transparent_75%)] opacity-15 blur-3xl" />
        <div className="absolute right-0 bottom-[-160px] h-[380px] w-[520px] rounded-full bg-[radial-gradient(closest-side,#2BB673,transparent_70%)] opacity-10 blur-3xl" />
      </div>

      {/* Top bar */}
      <div className="relative z-10 border-b border-[#FAFAFF]/10 bg-[#0F0E24]/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-[#c4b5fd]/25 bg-[#5139ED]/20 text-[#c4b5fd]">
              <BookOpen className="h-4 w-4" />
            </span>
            <div>
              <div className="font-headline text-[11px] font-bold uppercase tracking-[0.24em] text-[#c4b5fd]">
                PhytoNet AI
              </div>
              <h1 className="font-headline text-[18px] font-bold text-[#FAFAFF]">Documentation</h1>
            </div>
          </div>
          <a
            href="/docs/phytonet-ai.md"
            download
            data-testid="docs-download-md"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#FAFAFF]/15 bg-[#FAFAFF]/[0.04] px-3.5 py-2 text-[12px] font-semibold text-[#E7E7F3] hover:bg-[#FAFAFF]/[0.08]"
          >
            <Download className="h-3.5 w-3.5" /> Download Markdown
          </a>
        </div>
      </div>

      {/* Layout: sticky ToC + article */}
      <div className="relative z-10 mx-auto grid max-w-6xl grid-cols-12 gap-8 px-6 py-10">
        {/* ToC */}
        <aside className="col-span-12 md:col-span-3">
          <div
            className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-[#FAFAFF]/10 bg-[#12102E]/70 p-4 backdrop-blur"
            data-testid="docs-toc"
          >
            <div className="font-headline mb-3 flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.20em] text-[#E7E7F3]/60">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2BB673]" />
              On this page
            </div>
            <nav className="space-y-0.5">
              {toc.map(({ text, id }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  data-testid={`docs-toc-${id}`}
                  className={`block truncate rounded-md px-2 py-1.5 text-[12.5px] transition ${
                    activeId === id
                      ? "bg-[#5139ED]/15 text-[#c4b5fd] font-semibold ring-1 ring-[#5139ED]/35"
                      : "text-[#E7E7F3]/70 hover:bg-[#FAFAFF]/[0.06] hover:text-[#FAFAFF]"
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
          className="col-span-12 max-w-none md:col-span-9"
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
                      <a href={href} className="text-[#c4b5fd] underline decoration-[#c4b5fd]/40 hover:decoration-[#c4b5fd]">
                        {children}
                      </a>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-[#FAFAFF]">{children}</strong>
                    ),
                    table: ({ children }) => (
                      <div className="my-4 overflow-x-auto rounded-xl border border-[#FAFAFF]/10">
                        <table className="w-full border-collapse text-[13px]">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-[#12102E]">{children}</thead>
                    ),
                    th: ({ children }) => (
                      <th className="border-b border-[#FAFAFF]/10 px-3 py-2 text-left font-semibold text-[#FAFAFF]">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="border-b border-[#FAFAFF]/[0.06] px-3 py-2 align-top text-[#E7E7F3]/85">
                        {children}
                      </td>
                    ),
                    p: ({ children }) => (
                      <p className="my-3 text-[14px] leading-relaxed text-[#E7E7F3]/85">
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
                      <ul className="my-3 list-disc space-y-1 pl-6 text-[14px] leading-relaxed text-[#E7E7F3]/85 marker:text-[#c4b5fd]/60">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="my-3 list-decimal space-y-1 pl-6 text-[14px] leading-relaxed text-[#E7E7F3]/85 marker:text-[#c4b5fd]/60">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => <li>{children}</li>,
                    hr: () => <hr className="my-10 border-[#FAFAFF]/10" />,
                    blockquote: ({ children }) => (
                      <blockquote className="my-5 rounded-r-xl border-l-4 border-[#5139ED] bg-[#5139ED]/10 px-4 py-3 text-[13.5px] leading-relaxed text-[#E7E7F3]">
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
