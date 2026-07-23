import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function HelpTip({ text, testid }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid={testid}
          className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[#B4B4CD] hover:text-[#5139ED]"
          aria-label="Help"
        >
          <HelpCircle className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs bg-[#0B0B18] text-white">
        <p className="text-[11px] leading-relaxed">{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ────────────────────────── Scoring Config Panel ─────────────────────────

export { HelpTip };
