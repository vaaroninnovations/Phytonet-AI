import { Leaf } from "lucide-react";

function LoadingRows({ fields }) {
  return Array.from({ length: 6 }).map((_, i) => (
    <tr key={i} className="border-b border-[#F1F1FA]">
      <td className="px-3 py-4">
        <div className="h-4 w-4 animate-pulse rounded bg-[#F1F1FA]" />
      </td>
      <td className="px-3 py-4">
        <div className="h-3 w-4 animate-pulse rounded bg-[#F1F1FA]" />
      </td>
      {fields.map((f) => (
        <td key={f.key} className="px-4 py-4">
          <div className="h-3 w-3/4 animate-pulse rounded bg-[#F1F1FA]" />
        </td>
      ))}
      <td />
    </tr>
  ));
}

function EmptyState({ hasQuery }) {
  return (
    <tr>
      <td colSpan={99} className="px-4 py-16 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#F5F5FC] text-[#5139ED]">
          <Leaf className="h-5 w-5" />
        </div>
        <p className="mt-4 font-heading text-base font-semibold text-[#0B0B18]">
          {hasQuery ? "No compounds match this filter." : "Run a search to populate compounds."}
        </p>
        <p className="mt-1 text-sm text-[#64748B]">
          Try “Curcuma longa”, “Withania somnifera” or paste a SMILES.
        </p>
      </td>
    </tr>
  );
}

export { LoadingRows, EmptyState };
