import { Link } from "react-router-dom";
import { Github, Linkedin, Twitter, ArrowRight } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

const SECTIONS = [
  { title: "Platform",  links: [
    { label: "AI Scientist",  to: "/scientific-report" },
    { label: "Plant Database",to: "/phytonet-ai" },
    { label: "Research Tools",to: "/#modules" },
    { label: "Pricing",       to: "/#pricing" },
  ]},
  { title: "Resources", links: [
    { label: "Documentation", to: "/#docs" },
    { label: "API",           to: "/#api" },
    { label: "GitHub",        to: "https://github.com" },
    { label: "Community",     to: "/#community" },
  ]},
  { title: "Company",   links: [
    { label: "About",         to: "/#about" },
    { label: "Contact",       to: "/#contact" },
    { label: "Privacy",       to: "/#privacy" },
    { label: "Terms",         to: "/#terms" },
  ]},
];

export default function SiteFooter() {
  return (
    <footer data-testid="site-footer" className="border-t border-[#E7E7F3] bg-white">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <Link to="/" className="flex items-center gap-2.5">
              <BrandLogo className="h-8 w-8" />
              <span className="font-headline text-[17px] font-extrabold tracking-tight text-[#111827]">
                PhytoNet<span className="text-[#5139ED]"> AI</span>
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-[#6B7280]">
              AI Scientist for Medicinal Plant Drug Discovery. From LC-MS to publication-ready
              manuscript, all in one reproducible workspace.
            </p>

            {/* Newsletter */}
            <form
              data-testid="newsletter-form"
              onSubmit={(e) => { e.preventDefault(); }}
              className="mt-6 flex max-w-sm items-center gap-2 rounded-full border border-[#E7E7F3] bg-white p-1.5 shadow-[0_1px_2px_rgba(11,11,24,0.02)]"
            >
              <input
                data-testid="newsletter-email" type="email" required placeholder="you@lab.edu"
                className="flex-1 border-none bg-transparent px-3 py-1.5 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none"
                aria-label="Email for newsletter"
              />
              <button type="submit"
                      className="inline-flex items-center gap-1 rounded-full bg-[#5139ED] px-3.5 py-1.5 text-[12px] font-bold text-white hover:bg-[#4127c9]">
                Subscribe<ArrowRight className="h-3 w-3" />
              </button>
            </form>

            {/* Socials */}
            <div className="mt-6 flex items-center gap-2">
              {[
                { icon: Github,   href: "https://github.com",   label: "GitHub" },
                { icon: Linkedin, href: "https://linkedin.com", label: "LinkedIn" },
                { icon: Twitter,  href: "https://x.com",        label: "X" },
              ].map((s) => (
                <a key={s.label} href={s.href} aria-label={s.label} target="_blank" rel="noopener noreferrer"
                   className="grid h-9 w-9 place-items-center rounded-full border border-[#E7E7F3] bg-white text-[#374151] hover:border-[#5139ED]/40 hover:text-[#5139ED]">
                  <s.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {SECTIONS.map((sec) => (
            <div key={sec.title} className="md:col-span-2">
              <p className="font-headline text-[11px] font-extrabold uppercase tracking-[0.24em] text-[#111827]">
                {sec.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {sec.links.map((l) => (
                  <li key={l.label}>
                    <Link to={l.to} className="text-[13px] text-[#6B7280] hover:text-[#5139ED]">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-[#E7E7F3]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 text-[11.5px] text-[#6B7280]">
          <span>© {new Date().getFullYear()} PhytoNet AI · Research AI Platform</span>
          <span className="font-mono">v0.2 · preview</span>
        </div>
      </div>
    </footer>
  );
}
