import { Link } from "react-router-dom";
import { ArrowLeft, FlaskConical } from "lucide-react";

function EmptySelection() {
  return (
    <main
      data-testid="admet-empty"
      className="mx-auto max-w-3xl px-6 pb-24 pt-14 text-center"
    >
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#5139ED]/10 text-[#5139ED]">
        <FlaskConical className="h-6 w-6" />
      </div>
      <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-[#0B0B18]">
        ADMET &amp; Drug-Likeness Analysis
      </h1>
      <p className="mt-3 text-[#64748B]">
        Select compounds in the Plant Database first — they will be automatically
        analyzed here.
      </p>
      <Link
        to="/phytonet-ai"
        data-testid="back-to-plant-db"
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-6 py-3 text-sm font-semibold text-white hover:bg-[#4127c9]"
      >
        <ArrowLeft className="h-4 w-4" />
        Go to Plant Database
      </Link>
    </main>
  );
}


export { EmptySelection };
