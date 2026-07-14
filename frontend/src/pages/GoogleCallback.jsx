// Google OAuth callback landing page.
// Google redirects here with ?code&state — we forward these to the backend's
// /api/auth/google/callback endpoint which sets HttpOnly cookies then redirects
// to the original page.
//
// NOTE: We use window.location so the browser follows the backend's 302 and
// receives the Set-Cookie header (client-side fetch swallows redirects).
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function GoogleCallback() {
  const { search } = useLocation();
  useEffect(() => {
    const BACKEND = process.env.REACT_APP_BACKEND_URL || "";
    // Forward the entire query string (code, state, scope, prompt, …) to the backend.
    window.location.replace(`${BACKEND}/api/auth/google/callback${search}`);
  }, [search]);
  return (
    <main data-testid="google-callback" className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-6 text-center">
      <div>
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#5139ED]" />
        <p className="mt-4 text-sm font-semibold text-[#111827]">Completing Google sign-in…</p>
        <p className="mt-1 text-xs text-[#6B7280]">You'll be redirected back automatically.</p>
      </div>
    </main>
  );
}
