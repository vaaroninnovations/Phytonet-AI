import { HelpCircle } from "lucide-react";

/** Inline (?) icon with title tooltip. */
export function HelpTip({ text, testid }) {
  return (
    <span
      data-testid={testid}
      title={text}
      className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full text-[#94A3B8] hover:text-[#5139ED]"
    >
      <HelpCircle className="h-3.5 w-3.5" />
    </span>
  );
}
