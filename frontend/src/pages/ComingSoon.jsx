import { useParams, Link, useLocation } from "react-router-dom";
import { ArrowLeft, Wrench } from "lucide-react";

export default function ComingSoon() {
  const { slug } = useParams();
  const { pathname } = useLocation();
  const label = slug
    ? slug.replace(/-/g, " ")
    : pathname === "/phytonet-ai"
    ? "PhytoNet AI"
    : "This";
  return (
    <main
      data-testid="coming-soon-page"
      className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-6 text-center"
    >
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#5139ED]/10 text-[#5139ED]">
        <Wrench className="h-6 w-6" />
      </span>
      <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-[#0B0B18]">
        {label} — coming soon
      </h1>
      <p className="mt-3 max-w-md text-[#64748B]">
        This agent is under active development. In the meantime, kick off your
        workflow from the Plant Database.
      </p>
      <Link
        to="/plant-database"
        data-testid="back-to-plant-db"
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-6 py-3 text-sm font-semibold text-white hover:bg-[#4127c9]"
      >
        <ArrowLeft className="h-4 w-4" />
        Go to Plant Database
      </Link>
    </main>
  );
}
