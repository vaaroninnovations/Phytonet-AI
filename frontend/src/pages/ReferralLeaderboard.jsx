// Public Referral Leaderboard — /referrals/leaderboard
// Social-proof page for the referral program. Shows top 10 referrers with
// count of converted signups and total nodes earned. Public — no auth needed.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Trophy, Users, Zap, Loader2, Sparkles, ArrowRight, Share2, Crown,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getReferralLeaderboard, getReferralInfo } from "@/lib/api";

const RANK_STYLE = {
  1: { bg: "bg-gradient-to-br from-amber-400 to-amber-600", ring: "ring-amber-300/60", label: "text-amber-100", Icon: Crown },
  2: { bg: "bg-gradient-to-br from-slate-300 to-slate-500", ring: "ring-slate-300/60", label: "text-slate-100", Icon: Trophy },
  3: { bg: "bg-gradient-to-br from-orange-400 to-orange-600", ring: "ring-orange-300/60", label: "text-orange-100", Icon: Trophy },
};

function RankBadge({ rank }) {
  const style = RANK_STYLE[rank];
  if (style) {
    const { Icon, bg, ring, label } = style;
    return (
      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${bg} ring-4 ${ring}`}>
        <Icon className={`h-4 w-4 ${label}`} />
      </span>
    );
  }
  return (
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/5 border border-white/10 font-bold text-slate-300">
      #{rank}
    </span>
  );
}

export default function ReferralLeaderboard() {
  const { user, openModal } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myInfo, setMyInfo] = useState(null);

  useEffect(() => {
    getReferralLeaderboard()
      .then((d) => setRows(d.rows || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    getReferralInfo().then((d) => setMyInfo(d)).catch(() => {});
  }, [user]);

  return (
    <div data-testid="referral-leaderboard-page"
         className="min-h-screen bg-[#0B0918] text-slate-100">
      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-20 pb-14 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[500px] w-[900px] rounded-full bg-[radial-gradient(closest-side,#F59E0B,transparent_70%)] blur-3xl opacity-20" />
        </div>
        <div className="relative mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">
            <Sparkles className="h-3.5 w-3.5" /> Community leaderboard
          </span>
          <h1 className="mt-6 font-headline text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Top researchers <br/>
            <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
              sharing PhytoNet AI
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-slate-400">
            These researchers have invited the most colleagues onto the platform.
            Every successful referral credits <strong className="text-amber-300">10 nodes</strong> to both parties.
            {user
              ? " Rise up the ranks — invite a friend and earn together."
              : " Sign up to get your own referral link and start climbing."}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {user ? (
              <Link to="/dashboard#referral"
                    data-testid="lb-cta-share"
                    className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-700 px-6 py-3 text-[13px] font-bold text-white hover:-translate-y-0.5 transition">
                <Share2 className="h-4 w-4" /> Get your referral link
              </Link>
            ) : (
              <button onClick={() => openModal("signup")}
                      data-testid="lb-cta-signin"
                      className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-700 px-6 py-3 text-[13px] font-bold text-white hover:-translate-y-0.5 transition">
                Join to compete <ArrowRight className="h-4 w-4" />
              </button>
            )}
            <Link to="/pricing"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-[13px] font-bold text-slate-200 hover:bg-white/10 transition">
              View pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Your stats (only if logged in and has stats) */}
      {user && myInfo && myInfo.invited_count > 0 && (
        <section className="mx-auto max-w-3xl px-6 pb-6">
          <div data-testid="lb-your-stats"
               className="rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-white/[0.02] p-4 flex flex-wrap items-center gap-4">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
              <Users className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <div className="text-[13px] font-bold text-slate-100">Your progress</div>
              <div className="text-[11.5px] text-slate-400">
                <strong className="text-slate-100">{myInfo.invited_count}</strong> signed up ·
                <strong className="text-emerald-300 ml-1">{myInfo.converted_count}</strong> converted ·
                <strong className="text-amber-300 ml-1">{myInfo.earned_nodes} nodes</strong> earned
              </div>
            </div>
            <Link to="/dashboard#referral"
                  className="text-[12px] font-semibold text-amber-300 hover:underline">
              Share more →
            </Link>
          </div>
        </section>
      )}

      {/* Leaderboard */}
      <section className="mx-auto max-w-3xl px-6 pb-24">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div data-testid="lb-empty"
               className="rounded-3xl border border-white/10 bg-white/[0.03] py-16 px-6 text-center">
            <Trophy className="mx-auto h-8 w-8 text-slate-500 mb-3" />
            <h3 className="font-headline text-xl font-bold text-slate-100">The leaderboard is empty — be the first!</h3>
            <p className="mt-2 text-[13px] text-slate-400">
              No successful referrals yet. Grab your referral link and be the first to earn a spot on the wall of fame.
            </p>
            {user ? (
              <Link to="/dashboard#referral" className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-5 py-2 text-[13px] font-bold text-white hover:bg-amber-600 transition">
                <Share2 className="h-4 w-4" /> Get your link
              </Link>
            ) : (
              <button onClick={() => openModal("signup")}
                      className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-5 py-2 text-[13px] font-bold text-white hover:bg-amber-600 transition">
                Sign up to start <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.rank}
                   data-testid={`lb-row-${r.rank}`}
                   className={`flex items-center gap-4 rounded-2xl border p-4 transition ${
                     r.rank <= 3
                       ? "border-amber-500/25 bg-gradient-to-r from-amber-500/[0.06] via-white/[0.02] to-white/[0.02]"
                       : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
                   }`}>
                <RankBadge rank={r.rank} />
                <div className="flex-1">
                  <div className="font-headline text-[15.5px] font-bold text-slate-100">{r.user_display}</div>
                  <div className="text-[11.5px] text-slate-500">
                    {r.converted} friend{r.converted === 1 ? "" : "s"} joined
                  </div>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/25 px-3 py-1.5">
                  <Zap className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  <span className="text-[13px] font-bold text-amber-300 tabular-nums">{r.nodes}</span>
                  <span className="text-[11px] text-amber-500">nodes</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bottom CTA */}
        <div className="mt-10 rounded-3xl border border-[#5139ED]/20 bg-gradient-to-br from-[#5139ED] to-[#8139ED] p-8 text-center">
          <h3 className="font-headline text-2xl font-bold text-white">Every referral counts.</h3>
          <p className="mt-2 text-[13.5px] text-white/85">
            Share PhytoNet AI with a colleague — you both get 10 free nodes on their first purchase.
          </p>
          <div className="mt-5">
            {user ? (
              <Link to="/dashboard#referral"
                    className="inline-flex items-center gap-1.5 rounded-full bg-white px-6 py-2.5 text-[13px] font-bold text-[#5139ED] hover:-translate-y-0.5 transition">
                Grab your link <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <button onClick={() => openModal("signup")}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white px-6 py-2.5 text-[13px] font-bold text-[#5139ED] hover:-translate-y-0.5 transition">
                Sign up free <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
