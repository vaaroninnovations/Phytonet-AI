// ReferralPickup — invisible URL listener that stashes `?ref=CODE` in
// localStorage on any page. When the visitor later signs up (or is already
// logged in), we auto-apply it. Rendered once inside <App />.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { applyReferral } from "@/lib/api";
import { toast } from "sonner";

const STORAGE_KEY = "phytonet_ref_code";

export default function ReferralPickup() {
  const { search } = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    // Detect ?ref=CODE anywhere and stash it. Lasts across sessions so an
    // anonymous visitor who bookmarks the link still counts when they sign up.
    const q = new URLSearchParams(search);
    const raw = (q.get("ref") || "").trim().toUpperCase();
    if (raw && raw.length >= 4 && raw.length <= 32 && raw.startsWith("PN")) {
      localStorage.setItem(STORAGE_KEY, raw);
    }
  }, [search]);

  useEffect(() => {
    // If a code is stashed AND the user is now logged in, attempt to apply it.
    // Errors (already applied, self-referral, etc.) are swallowed silently to
    // avoid noise on repeat visits; success shows a friendly toast.
    if (!user) return;
    const pending = localStorage.getItem(STORAGE_KEY);
    if (!pending) return;
    applyReferral(pending)
      .then((r) => {
        toast.success(r.message || "Referral applied!", { duration: 6000 });
        localStorage.removeItem(STORAGE_KEY);
      })
      .catch(() => { localStorage.removeItem(STORAGE_KEY); });
  }, [user]);

  return null;
}
