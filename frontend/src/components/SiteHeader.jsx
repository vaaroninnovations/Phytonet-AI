import { Link, useLocation } from "react-router-dom";
import { Slash } from "lucide-react";

export default function SiteHeader() {
  const { pathname } = useLocation();
  const isActive = (p) => pathname === p;
  return (
    <header
      data-testid="site-header"
      className="sticky top-0 z-40 border-b border-[#E7E7F3] bg-white/80 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link
          to="/"
          data-testid="brand-link"
          className="flex items-center gap-2"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED] text-white shadow-[0_6px_20px_-6px_rgba(81,57,237,0.65)]">
            <Slash className="h-4 w-4" strokeWidth={3} />
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-[#0B0B18]">
            Dr. <span className="text-[#5139ED]">/</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          <Link
            to="/"
            data-testid="nav-home"
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              isActive("/")
                ? "bg-[#5139ED]/8 text-[#5139ED]"
                : "text-[#1E1E33] hover:text-[#5139ED]"
            }`}
          >
            Home
          </Link>
          <Link
            to="/plant-database"
            data-testid="nav-plant-database"
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              isActive("/plant-database")
                ? "bg-[#5139ED]/8 text-[#5139ED]"
                : "text-[#1E1E33] hover:text-[#5139ED]"
            }`}
          >
            Plant Database
          </Link>
          <a
            href="#agents"
            data-testid="nav-agents"
            className="rounded-full px-4 py-2 text-sm font-medium text-[#1E1E33] transition-colors hover:text-[#5139ED]"
          >
            Agents
          </a>
        </nav>
        <Link
          to="/plant-database"
          data-testid="header-cta"
          className="hidden rounded-full bg-[#0B0B18] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#1E1E33] md:inline-flex"
        >
          Launch Console
        </Link>
      </div>
    </header>
  );
}
