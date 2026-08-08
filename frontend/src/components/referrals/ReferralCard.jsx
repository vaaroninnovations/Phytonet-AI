// ReferralCard — dashboard tile showing the user's referral code, share URL,
// invited count, and earned nodes. Copy button + share-via-native/copy.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Users, Zap, Loader2, Share2, Check, Trophy } from "lucide-react";
import { toast } from "sonner";
import { getReferralInfo } from "@/lib/api";

export default function ReferralCard() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getReferralInfo()
      .then((d) => setInfo(d))
      .catch(() => setInfo(null))
      .finally(() => setLoading(false));
  }, []);

  const share = async () => {
    if (!info?.share_url) return;
    const url = info.share_url.startsWith("http")
      ? info.share_url
      : `${window.location.origin}${info.share_url}`;
    const text = `I've been using PhytoNet AI for network-pharmacology research — use my link and we both get ${info.reward_per_referral} free nodes: ${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: "PhytoNet AI", text, url }); return; }
      catch (e) { /* user cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
      toast.success("Referral link copied to clipboard");
    } catch { toast.error("Couldn't copy — please copy manually."); }
  };

  const copyCode = async () => {
    if (!info?.code) return;
    try {
      await navigator.clipboard.writeText(info.code);
      toast.success(`Code ${info.code} copied`);
    } catch { toast.error("Couldn't copy"); }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#E7E7F3] bg-white p-6">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!info) return null;

  const shareUrl = info.share_url?.startsWith("http")
    ? info.share_url
    : `${window.location.origin}${info.share_url || ""}`;

  return (
    <div data-testid="referral-card"
         className="relative overflow-hidden rounded-2xl border border-[#E7E7F3] bg-gradient-to-br from-white via-fuchsia-50/40 to-white p-6 shadow-sm">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-fuchsia-300/30 to-[#5139ED]/10 blur-3xl" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-fuchsia-600">Refer & Earn</div>
            <h3 className="mt-1 font-headline text-lg font-bold text-[#0F172A]">
              Invite friends — you both get {info.reward_per_referral} free nodes
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#4B5563]">
              Share your link. When a new researcher signs up and makes their first purchase, we credit{" "}
              <strong>{info.reward_per_referral} nodes</strong> to your account and{" "}
              <strong>{info.reward_per_referral} nodes</strong> to theirs.
            </p>
          </div>
        </div>

        {/* Code + share */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            data-testid="referral-code-chip"
            onClick={copyCode}
            className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-3 py-1.5 font-mono text-[13px] font-bold text-fuchsia-700 hover:bg-fuchsia-100 transition"
            title="Click to copy code"
          >
            {info.code} <Copy size={12} className="opacity-70" />
          </button>
          <button
            data-testid="referral-share-btn"
            onClick={share}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F172A] px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-[#111827] transition"
          >
            {copied ? <><Check size={12} /> Copied!</> : <><Share2 size={12} /> Share link</>}
          </button>
          <span className="text-[11.5px] text-[#94A3B8] truncate max-w-full font-mono">{shareUrl}</span>
        </div>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          <div data-testid="referral-stat-invited"
               className="rounded-xl border border-[#E7E7F3] bg-white/60 p-3">
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              <Users size={11} className="text-fuchsia-500" /> Signed up
            </div>
            <div className="mt-1 font-headline text-2xl font-bold text-[#0F172A]">{info.invited_count}</div>
          </div>
          <div data-testid="referral-stat-converted"
               className="rounded-xl border border-[#E7E7F3] bg-white/60 p-3">
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              <Check size={11} className="text-emerald-500" /> Converted
            </div>
            <div className="mt-1 font-headline text-2xl font-bold text-emerald-600">{info.converted_count}</div>
          </div>
          <div data-testid="referral-stat-earned"
               className="rounded-xl border border-[#E7E7F3] bg-white/60 p-3">
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              <Zap size={11} className="text-amber-500 fill-amber-400" /> Earned
            </div>
            <div className="mt-1 font-headline text-2xl font-bold text-amber-600">{info.earned_nodes}</div>
          </div>
        </div>

        <Link to="/referrals/leaderboard"
              data-testid="referral-leaderboard-link"
              className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-fuchsia-700 hover:underline">
          <Trophy size={12} /> See the top referrers leaderboard →
        </Link>
      </div>
    </div>
  );
}
