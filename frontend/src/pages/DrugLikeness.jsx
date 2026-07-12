import { Link } from "react-router-dom";
import { useSelection } from "@/context/SelectionContext";
import {
  ArrowLeft,
  Trash2,
  BeakerIcon,
  ChevronRight,
  FlaskConical,
  Sparkles,
} from "lucide-react";
import StructureCanvas from "@/components/StructureCanvas";

export default function DrugLikeness() {
  const { selectedCompounds, count, clear, sourcePlant } = useSelection();

  return (
    <main
      data-testid="drug-likeness-page"
      className="relative mx-auto max-w-7xl px-6 pb-24 pt-14"
    >
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
            Module · 02
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#0B0B18] sm:text-5xl">
            Drug-Likeness Screening
          </h1>
          <p className="mt-3 max-w-2xl text-[#64748B]">
            {count > 0
              ? `Ready to screen ${count} compound${count === 1 ? "" : "s"}${
                  sourcePlant ? ` from ${sourcePlant}` : ""
                } against Lipinski, Veber, Ghose & Egan rules.`
              : "No compounds are currently selected. Return to the Plant Database to pick candidates."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/phytonet-ai"
            data-testid="modify-selection-link"
            className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white px-5 py-2.5 text-sm font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
          >
            <ArrowLeft className="h-4 w-4" />
            Modify selection
          </Link>
          <button
            data-testid="clear-selection-btn"
            onClick={clear}
            disabled={!count}
            className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white px-5 py-2.5 text-sm font-semibold text-[#0B0B18] hover:border-red-500/40 hover:text-red-500 disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
            Clear selection
          </button>
        </div>
      </div>

      {/* Status card */}
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        <StatCard
          testid="stat-selected"
          label="Selected compounds"
          value={count}
          icon={FlaskConical}
        />
        <StatCard
          testid="stat-source"
          label="Source plant"
          value={sourcePlant || "—"}
          italic
          icon={BeakerIcon}
        />
        <StatCard
          testid="stat-status"
          label="Screening status"
          value="Awaiting run"
          icon={Sparkles}
        />
      </div>

      {/* Roadmap ribbon */}
      <div className="mt-10 rounded-3xl border border-[#E7E7F3] bg-[#FAFAFF] p-6">
        <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
          Downstream pipeline
        </p>
        <ol className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#0B0B18]">
          {[
            "Drug-Likeness Screening",
            "SwissADME",
            "Target Prediction",
            "Disease Target Identification",
            "PPI Networks",
            "GO / KEGG Enrichment",
            "Molecular Docking",
            "AI Report",
          ].map((step, i, arr) => (
            <li key={step} className="flex items-center gap-2">
              <span
                className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-2 text-[10px] font-bold ${
                  i === 0
                    ? "bg-[#5139ED] text-white"
                    : "bg-white text-[#64748B] ring-1 ring-inset ring-[#E7E7F3]"
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={
                  i === 0 ? "font-semibold text-[#0B0B18]" : "text-[#64748B]"
                }
              >
                {step}
              </span>
              {i < arr.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 text-[#B4B4CD]" />
              )}
            </li>
          ))}
        </ol>
      </div>

      {/* Selected compounds preview */}
      <div className="mt-10 rounded-3xl border border-[#E7E7F3] bg-white p-5 shadow-sm md:p-6">
        <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
          Selection preview
        </p>
        {count === 0 ? (
          <div className="py-14 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#F5F5FC] text-[#5139ED]">
              <FlaskConical className="h-5 w-5" />
            </div>
            <p className="mt-4 font-heading text-base font-semibold text-[#0B0B18]">
              No compounds selected yet.
            </p>
            <p className="mt-1 text-sm text-[#64748B]">
              Pick compounds from the Plant Database, then proceed.
            </p>
          </div>
        ) : (
          <div
            data-testid="selected-list"
            className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3"
          >
            {selectedCompounds.slice(0, 30).map((c) => (
              <div
                key={c.imppat_id || c.lotus_id || c.inchi_key || c.compound_name}
                className="flex items-start gap-3 rounded-2xl border border-[#F1F1FA] bg-[#FAFAFF] p-3"
              >
                <StructureCanvas smiles={c.smiles} size={120} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-heading text-sm font-semibold text-[#0B0B18]">
                    {c.compound_name || "Unknown"}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-medium text-[#64748B]">
                    {c.molecular_formula && (
                      <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-inset ring-[#E7E7F3]">
                        {c.molecular_formula}
                      </span>
                    )}
                    {c.molecular_weight && (
                      <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-inset ring-[#E7E7F3]">
                        {Number(c.molecular_weight).toFixed(1)} g/mol
                      </span>
                    )}
                    <span className="rounded-full bg-[#5139ED]/10 px-2 py-0.5 font-bold text-[#5139ED]">
                      {c.source}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {count > 30 && (
              <div className="col-span-full text-center text-xs text-[#64748B]">
                + {count - 30} more compounds
              </div>
            )}
          </div>
        )}
      </div>

      {/* Run action (coming soon) */}
      <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-3xl border border-[#E7E7F3] bg-white p-6 md:flex-row md:items-center">
        <div>
          <div className="font-heading text-base font-semibold text-[#0B0B18]">
            Run screening
          </div>
          <p className="mt-1 text-sm text-[#64748B]">
            The screening engine (Lipinski / Veber / Ghose / Egan +
            SwissADME) is being tuned. Your selection is safely stored and will
            be used automatically once the module is live.
          </p>
        </div>
        <button
          data-testid="run-screening-btn"
          disabled
          className="inline-flex items-center gap-2 rounded-full bg-[#0B0B18] px-6 py-3 text-sm font-semibold text-white opacity-60"
        >
          Run screening
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
            Soon
          </span>
        </button>
      </div>
    </main>
  );
}

function StatCard({ testid, label, value, italic, icon: Icon }) {
  return (
    <div
      data-testid={testid}
      className="flex items-center gap-4 rounded-2xl border border-[#E7E7F3] bg-white p-5"
    >
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#5139ED]/10 text-[#5139ED]">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-widest text-[#64748B]">
          {label}
        </div>
        <div
          className={`mt-0.5 truncate font-display text-2xl font-bold text-[#0B0B18] ${
            italic ? "italic" : ""
          }`}
        >
          {value}
        </div>
      </div>
    </div>
  );
}
