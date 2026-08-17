// CommandPalette — global ⌘K launcher.
// Opens on ⌘K / Ctrl+K anywhere on the site, or when the header-search
// button is clicked. Sections: Modules · Marketing · Recent Projects.
// Uses shadcn's <Command …> (cmdk) primitives + Dialog.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Beaker, Atom, Dna, Target, Microscope, FlaskConical, Network,
  FileText, LayoutDashboard, Leaf, DollarSign, Book, Home as HomeIcon,
} from "lucide-react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const MODULES = [
  { icon: LayoutDashboard, label: "Workspace",          path: "/app",                 keywords: "workspace tabs" },
  { icon: Leaf,        label: "Plant Database",         path: "/plant-database",      keywords: "plants phytochemicals lotus" },
  { icon: Beaker,      label: "ADMET · Drug-Likeness",  path: "/drug-likeness",       keywords: "admet lipinski swissadme" },
  { icon: Target,      label: "Target Prediction",      path: "/target-prediction",   keywords: "compound target sea" },
  { icon: Microscope,  label: "Disease Targets",        path: "/disease-target-prediction", keywords: "disease disgenet" },
  { icon: Network,     label: "Network Analysis",       path: "/network-analysis",    keywords: "graph pathway" },
  { icon: Atom,        label: "Molecular Docking",      path: "/molecular-docking",   keywords: "docking vina autodock" },
  { icon: Dna,         label: "Molecular Dynamics",     path: "/molecular-dynamics",  keywords: "md gromacs simulation" },
  { icon: FileText,    label: "AI Scientific Report",   path: "/ai-scientific-report", keywords: "report writer paper" },
  { icon: FlaskConical, label: "My Projects",           path: "/projects",            keywords: "saved projects history" },
];

const MARKETING = [
  { icon: HomeIcon,   label: "Home",       path: "/",           keywords: "landing marketing" },
  { icon: DollarSign, label: "Pricing",    path: "/pricing",    keywords: "plans nodes bundles" },
  { icon: Book,       label: "Resources",  path: "/resources",  keywords: "databases docs sources" },
  { icon: Book,       label: "Documentation", path: "/documentation", keywords: "docs technical manual workflow architecture" },
];

export default function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);

  // Fetch recent projects when the palette opens (only if user is authed).
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/projects");
        if (cancelled) return;
        const list = Array.isArray(res.data?.projects) ? res.data.projects : [];
        setProjects(list.slice(0, 8));
      } catch {
        /* silently ignore — palette still works without projects */
      }
    })();
    return () => { cancelled = true; };
  }, [open, user]);

  const go = (path) => {
    onOpenChange(false);
    navigate(path);
  };

  const modules = useMemo(() => MODULES, []);
  const marketing = useMemo(() => MARKETING, []);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        data-testid="command-palette-input"
        placeholder="Search modules, projects, pages…"
      />
      <CommandList data-testid="command-palette-list">
        <CommandEmpty>No results.</CommandEmpty>

        <CommandGroup heading="Modules">
          {modules.map(({ icon: Icon, label, path, keywords }) => (
            <CommandItem
              key={path}
              value={`${label} ${keywords}`}
              onSelect={() => go(path)}
              data-testid={`cmd-item-${path.replace(/\//g, "")}`}
            >
              <Icon className="mr-2 h-4 w-4 text-[#5139ED]" />
              <span>{label}</span>
              <span className="ml-auto text-[10px] text-[#94A3B8]">{path}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {user && projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent Projects">
              {projects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.name} project`}
                  onSelect={() => go(`/app?project=${p.id}`)}
                  data-testid={`cmd-project-${p.id}`}
                >
                  <FlaskConical className="mr-2 h-4 w-4 text-[#2BB673]" />
                  <span className="truncate">{p.name || "Untitled project"}</span>
                  {p.current_step && (
                    <span className="ml-auto text-[10px] text-[#94A3B8]">
                      {p.current_step}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Marketing">
          {marketing.map(({ icon: Icon, label, path, keywords }) => (
            <CommandItem
              key={path}
              value={`${label} ${keywords}`}
              onSelect={() => go(path)}
              data-testid={`cmd-item-${path.replace(/\//g, "") || "home"}`}
            >
              <Icon className="mr-2 h-4 w-4 text-[#8139ED]" />
              <span>{label}</span>
              <span className="ml-auto text-[10px] text-[#94A3B8]">{path}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
