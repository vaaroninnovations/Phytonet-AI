// Research Workspace — Empty state + suggested prompts grid
import { Sparkles, Beaker, Atom, Dna, FlaskConical, Microscope } from "lucide-react";

export const SUGGESTIONS = [
  { icon: Beaker,       text: "Find phytochemicals from Withania somnifera" },
  { icon: Atom,         text: "Predict protein targets for Quercetin" },
  { icon: Dna,          text: "Show me disease-associated genes for Type 2 diabetes" },
  { icon: FlaskConical, text: "Run ADMET prediction for Curcumin" },
  { icon: Microscope,   text: "Compare the phytochemistry of Turmeric and Ginger" },
  { icon: Sparkles,     text: "Design a workflow to study the anti-inflammatory potential of turmeric" },
];

export function SuggestedPromptsGrid({ onPick }) {
  return (
    <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 text-left">
      {SUGGESTIONS.map((s, i) => {
        const Icon = s.icon;
        return (
          <button key={i} data-testid={`suggestion-${i}`}
                  onClick={() => onPick(s.text)}
                  className="group flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10 transition-colors">
            <Icon size={16} className="mt-0.5 text-[#a48bff]" />
            <span className="text-[13px] text-slate-200 group-hover:text-white">{s.text}</span>
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({ onPick }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5139ED] to-[#8139ED] shadow-2xl shadow-purple-500/30">
          <Sparkles className="text-white" size={26} />
        </div>
        <h1 className="mt-5 text-[26px] font-bold tracking-tight text-slate-100">
          Your AI Research Assistant
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-400">
          Describe a research question in plain language. I'll orchestrate the right modules —
          plant search, target prediction, disease mapping, ADMET — and cite every source.
        </p>
        <SuggestedPromptsGrid onPick={onPick} />
      </div>
    </div>
  );
}
