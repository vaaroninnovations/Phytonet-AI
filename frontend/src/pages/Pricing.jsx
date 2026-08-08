// Public Pricing page — /pricing
// Shows all node bundles, the PhytoNet Pro subscription, and the Lab/Team
// enterprise plan. Data comes from GET /api/nodes/pricing so the page and
// the in-app Recharge modal always agree.
import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Check, Sparkles, Wallet, GraduationCap, Zap, Building2, Loader2,
  ArrowRight, HelpCircle, Star, TrendingUp, Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useNodes } from "@/context/NodeContext";
import { getNodePricing, createPurchaseIntent, verifyPayment } from "@/lib/api";
import { openRazorpayCheckout } from "@/lib/razorpay";
import ContactSalesModal from "@/components/pricing/ContactSalesModal";
import { GoldenLeaf } from "@/components/nodes/NodeBadge";

const KIND_META = {
  student:      { icon: GraduationCap, tag: "For students",     tone: "emerald" },
  bundle:       { icon: Wallet,        tag: "One-time",          tone: "violet"  },
  subscription: { icon: Zap,           tag: "Monthly",           tone: "amber"   },
  enterprise:   { icon: Building2,     tag: "Team / Lab",        tone: "slate"   },
};

const TONE_CLASS = {
  emerald: { badge: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-200", accent: "text-emerald-600" },
  violet:  { badge: "bg-violet-100 text-violet-700",   ring: "ring-violet-200",  accent: "text-violet-600"  },
  amber:   { badge: "bg-amber-100 text-amber-700",     ring: "ring-amber-200",   accent: "text-amber-600"   },
  slate:   { badge: "bg-slate-100 text-slate-700",     ring: "ring-slate-200",   accent: "text-slate-600"   },
};

function PlanCard({ plan, onBuy, onContact, busy, isAcademic, currentPlanId }) {
  const kind = plan.kind || "bundle";
  const meta = KIND_META[kind] || KIND_META.bundle;
  const tone = TONE_CLASS[meta.tone];
  const Icon = meta.icon;
  const highlighted = !!plan.highlight;
  const perNode = plan.nodes > 0 ? (plan.price_inr / plan.nodes).toFixed(1) : null;
  const isActivePro = currentPlanId === plan.id;
  const disabledReason = plan.requires_academic_email && !isAcademic
    ? "Requires .edu / .ac.in / .ac.uk email"
    : null;
  return (
    <div
      data-testid={`pricing-card-${plan.id}`}
      className={`relative flex flex-col rounded-3xl border p-6 transition ${
        highlighted
          ? "border-[#F59E0B]/60 bg-gradient-to-b from-[#FFFBEB] to-white shadow-[0_30px_60px_-30px_rgba(245,158,11,0.4)]"
          : "border-[#E7E7F3] bg-white hover:border-[#5139ED]/30 hover:shadow-lg"
      }`}
    >
      {plan.badge && (
        <span className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
          highlighted
            ? "bg-gradient-to-r from-[#F59E0B] to-[#B45309] text-white"
            : `${tone.badge}`
        }`}>{plan.badge}</span>
      )}

      <div className="flex items-center gap-2">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${tone.badge}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#94A3B8]">{meta.tag}</div>
          <div className="font-headline text-xl font-bold text-[#0F172A]">{plan.label}</div>
        </div>
      </div>

      <div className="mt-5">
        {kind === "enterprise" ? (
          <>
            <div className="flex items-baseline gap-1">
              <span className="font-headline text-4xl font-bold text-[#0F172A]">₹{plan.price_inr.toLocaleString()}</span>
              <span className="text-[12px] text-[#64748B]">/mo</span>
            </div>
            <div className="mt-1 text-[12px] text-[#94A3B8]">Custom quote available for larger teams</div>
          </>
        ) : kind === "subscription" ? (
          <>
            <div className="flex items-baseline gap-1">
              <span className="font-headline text-4xl font-bold text-[#0F172A]">₹{plan.price_inr.toLocaleString()}</span>
              <span className="text-[12px] text-[#64748B]">/mo</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[13px] text-[#4B5563]">
              <GoldenLeaf size={14} />
              <strong className="text-[#0F172A]">{plan.nodes}</strong> nodes / month
              {perNode && <span className="text-[11px] text-[#94A3B8]">· ₹{perNode}/node</span>}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-1.5">
              <GoldenLeaf size={22} />
              <span className="font-headline text-4xl font-bold text-[#0F172A]">{plan.nodes}</span>
              <span className="text-[12px] text-[#64748B]">nodes</span>
            </div>
            <div className="mt-1 text-[22px] font-bold text-[#0F172A]">
              ₹{plan.price_inr.toLocaleString()}
              {perNode && <span className="ml-2 text-[12px] font-normal text-[#94A3B8]">₹{perNode}/node</span>}
            </div>
          </>
        )}
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-[#4B5563]">{plan.description}</p>

      {plan.features && (
        <ul className="mt-4 space-y-2">
          {plan.features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-[#334155]">
              <Check className={`mt-0.5 h-4 w-4 flex-shrink-0 ${tone.accent}`} />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-5">
        {kind === "enterprise" ? (
          <button
            type="button"
            data-testid={`pricing-contact-${plan.id}`}
            onClick={() => onContact(plan)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#0F172A] px-4 py-3 text-[13px] font-bold text-white hover:bg-[#111827] transition"
          >
            <Users className="h-4 w-4" /> Contact Sales
          </button>
        ) : (
          <button
            type="button"
            data-testid={`pricing-buy-${plan.id}`}
            onClick={() => onBuy(plan)}
            disabled={busy === plan.id || !!disabledReason || isActivePro}
            title={disabledReason || (isActivePro ? "You're already on this plan" : "")}
            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-3 text-[13px] font-bold transition disabled:pointer-events-none disabled:opacity-50 ${
              highlighted
                ? "bg-gradient-to-r from-[#F59E0B] to-[#B45309] text-white hover:-translate-y-0.5"
                : "border border-[#E7E7F3] bg-white text-[#111827] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
            }`}
          >
            {busy === plan.id ? <Loader2 className="h-4 w-4 animate-spin" />
              : isActivePro ? <><Check className="h-4 w-4" /> Active</>
              : <>Buy plan <ArrowRight className="h-4 w-4" /></>}
          </button>
        )}
        {disabledReason && (
          <div className="mt-2 text-center text-[11px] text-[#94A3B8]">{disabledReason}</div>
        )}
      </div>
    </div>
  );
}

const FAQ_ITEMS = [
  { q: "How does the node system work?",
    a: "Every workflow costs a set number of nodes. Free tools like Plant Database and Disease Search cost 0 nodes. Premium modules and the AI Research Assistant charge nodes per successful step — cheap runs stay cheap, heavy runs pay proportionally." },
  { q: "Do nodes expire?",
    a: "No — nodes purchased as one-time bundles never expire. PhytoNet Pro subscription nodes roll over up to a cap of 300, so you're never penalised for a light month." },
  { q: "What's the difference between bundles and Pro?",
    a: "Bundles are one-time top-ups. Pro is a monthly subscription — you get 100 fresh nodes each month, priority docking concurrency (8 parallel vs 4), and a Pro badge on shared reports. Best if you use the platform every week." },
  { q: "Who qualifies for the Student plan?",
    a: "Anyone with a verified academic email (.edu, .edu.in, .ac.in, .ac.uk, .edu.au, etc.). The plan unlocks automatically once you sign in with your institution email." },
  { q: "Can I get an invoice for reimbursement?",
    a: "Yes — Razorpay generates a GST-compliant invoice for every purchase. Pro and Lab plans get monthly invoices sent to your registered email. Contact sales for institutional POs." },
  { q: "What payment methods are supported?",
    a: "All major credit/debit cards, UPI, net banking, and popular Indian wallets via Razorpay. International cards work but pricing is displayed in INR." },
];

function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section data-testid="pricing-faq" className="mx-auto max-w-3xl px-6 pb-24">
      <h2 className="font-headline text-3xl font-bold tracking-tight text-[#0F172A] text-center">
        Frequently Asked Questions
      </h2>
      <div className="mt-8 space-y-3">
        {FAQ_ITEMS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={i} data-testid={`faq-${i}`}
                 className={`rounded-2xl border transition ${isOpen ? "border-[#5139ED]/30 bg-white shadow-md" : "border-[#E7E7F3] bg-white"}`}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? -1 : i)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <span className="font-semibold text-[14.5px] text-[#0F172A]">{item.q}</span>
                <HelpCircle className={`h-4 w-4 flex-shrink-0 transition ${isOpen ? "text-[#5139ED] rotate-180" : "text-[#94A3B8]"}`} />
              </button>
              {isOpen && (
                <div className="border-t border-[#F1F5F9] px-5 py-4 text-[13.5px] leading-relaxed text-[#4B5563]">
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function Pricing() {
  const { user, openModal } = useAuth();
  const { pro, academicEmailEligible, refresh, isPro } = useNodes();
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(null);
  const [salesModal, setSalesModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getNodePricing()
      .then((d) => setPlans(d.plans || []))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const buckets = { student: [], bundle: [], subscription: [], enterprise: [] };
    plans.forEach((p) => (buckets[p.kind || "bundle"] ||= []).push(p));
    return buckets;
  }, [plans]);

  const buy = async (plan) => {
    if (!user) { openModal("login"); return; }
    setBusy(plan.id);
    try {
      const intent = await createPurchaseIntent(plan.id);
      await openRazorpayCheckout({
        intent,
        onSuccess: async (resp) => {
          try {
            const r = await verifyPayment({
              razorpay_order_id:   resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature:  resp.razorpay_signature,
            });
            const isSubscription = plan.kind === "subscription";
            toast.success(
              r.already_verified ? "Payment already verified"
                : isSubscription  ? `Welcome to ${plan.label}! Your Pro benefits are active.`
                                   : `Purchase successful — ${r.credited} nodes added.`,
              { description: `New balance: ${r.balance_after} nodes`, duration: 6000 },
            );
            refresh?.();
            setBusy(null);
          } catch (e) {
            toast.error(e?.response?.data?.detail || "Payment received but verification failed. Please contact support.");
            setBusy(null);
          }
        },
        onFailure: (err) => { toast.error(err?.description || err?.message || "Payment failed"); setBusy(null); },
        onDismiss: () => setBusy(null),
      });
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : (e?.message || "Could not start checkout."));
      setBusy(null);
    }
  };

  return (
    <div data-testid="pricing-page" className="min-h-screen bg-gradient-to-b from-[#F8FAFC] to-white">
      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-20 pb-14 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[500px] w-[900px] rounded-full bg-[radial-gradient(closest-side,#8139ED,transparent_70%)] blur-3xl opacity-30" />
        </div>
        <div className="relative mx-auto max-w-4xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#5139ED]/20 bg-[#5139ED]/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5139ED]">
            <Sparkles className="h-3.5 w-3.5" /> Pay only for what you use
          </span>
          <h1 className="mt-6 font-headline text-4xl font-bold tracking-tight text-[#0F172A] sm:text-5xl lg:text-6xl">
            Simple, fair pricing<br/>
            <span className="bg-gradient-to-r from-[#5139ED] to-[#8139ED] bg-clip-text text-transparent">that scales with your research.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-[#475569]">
            Buy nodes as you need them or subscribe to PhytoNet Pro for the best value.
            Free tools like Plant Search and Disease Targets never charge — you only spend nodes on premium analysis.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12px] text-emerald-700">
            <Star className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" />
            New users get <strong>10 free nodes</strong> — enough to try the AI Research Assistant risk-free.
          </div>
        </div>
      </section>

      {/* Pro banner if user is Pro */}
      {isPro && (
        <div className="mx-auto max-w-6xl px-6 pb-4">
          <div data-testid="pricing-pro-banner"
               className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4 flex items-center gap-3">
            <Zap className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1 text-[13px] text-[#334155]">
              <strong className="text-[#0F172A]">You're a Pro member.</strong> Your subscription renews on{" "}
              {pro.expires_at ? new Date(pro.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}.
            </div>
            <Link to="/dashboard" className="text-[12px] font-semibold text-amber-700 hover:underline">
              Manage subscription →
            </Link>
          </div>
        </div>
      )}

      {/* Plans grid — Student + Bundles */}
      <section className="mx-auto max-w-6xl px-6 pb-6">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-[#5139ED]" />
          <h2 className="font-headline text-xl font-bold text-[#0F172A]">One-time bundles</h2>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[0,1,2,3].map((i) => <div key={i} className="h-96 rounded-3xl border border-[#E7E7F3] bg-white/50 animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...grouped.student, ...grouped.bundle].map((p) => (
              <PlanCard key={p.id} plan={p} onBuy={buy} onContact={setSalesModal}
                        busy={busy} isAcademic={academicEmailEligible}
                        currentPlanId={pro?.plan_id} />
            ))}
          </div>
        )}
      </section>

      {/* Subscription + Enterprise */}
      <section className="mx-auto max-w-6xl px-6 pt-10 pb-16">
        <div className="mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-600" />
          <h2 className="font-headline text-xl font-bold text-[#0F172A]">Subscribe & save</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...grouped.subscription, ...grouped.enterprise].map((p) => (
            <PlanCard key={p.id} plan={p} onBuy={buy} onContact={setSalesModal}
                      busy={busy} isAcademic={academicEmailEligible}
                      currentPlanId={pro?.plan_id} />
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <h2 className="font-headline text-2xl font-bold tracking-tight text-[#0F172A] text-center mb-6">
          What you can do with your nodes
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-[#E7E7F3] bg-white">
          <table className="w-full text-[13.5px]">
            <thead className="bg-[#F8FAFC] text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">
              <tr>
                <th className="px-5 py-3 text-left">Feature</th>
                <th className="px-5 py-3 text-center">Free / Bundle</th>
                <th className="px-5 py-3 text-center">Pro</th>
                <th className="px-5 py-3 text-center">Lab / Team</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {[
                ["Plant Database", "✓", "✓", "✓"],
                ["Disease target search", "✓", "✓", "✓"],
                ["AI Research Assistant", "Metered (per step)", "100 nodes/mo", "Shared 500/mo"],
                ["Docking concurrency", "Up to 4 parallel", "Up to 8 parallel", "Up to 8 parallel"],
                ["Node rollover", "Never expire", "Up to 300", "Shared pool"],
                ["Priority support", "Community", "Email", "Dedicated + onboarding"],
                ["Collaboration workspaces", "—", "—", "✓ (5 seats)"],
                ["Institutional invoicing", "—", "—", "✓"],
              ].map((row, i) => (
                <tr key={i} className="hover:bg-[#FAFBFF]">
                  <td className="px-5 py-3.5 font-medium text-[#0F172A]">{row[0]}</td>
                  <td className="px-5 py-3.5 text-center text-[#475569]">{row[1]}</td>
                  <td className="px-5 py-3.5 text-center text-[#475569]">{row[2]}</td>
                  <td className="px-5 py-3.5 text-center text-[#475569]">{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <FAQ />

      {/* Final CTA */}
      <section className="mx-auto max-w-4xl px-6 pb-24 text-center">
        <div className="rounded-3xl border border-[#5139ED]/20 bg-gradient-to-br from-[#5139ED] to-[#8139ED] p-10 text-white shadow-2xl">
          <h3 className="font-headline text-3xl font-bold">Ready to start researching?</h3>
          <p className="mt-3 text-[15px] text-white/85">Sign in with Google or email to grab your 10 free nodes and take PhytoNet AI for a spin.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {user ? (
              <button data-testid="pricing-cta-workspace"
                      onClick={() => navigate("/app")}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[13px] font-bold text-[#5139ED] hover:-translate-y-0.5 transition">
                Open workspace <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button data-testid="pricing-cta-signin"
                      onClick={() => openModal("signup")}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[13px] font-bold text-[#5139ED] hover:-translate-y-0.5 transition">
                Sign up free <ArrowRight className="h-4 w-4" />
              </button>
            )}
            <Link to="/" data-testid="pricing-cta-home"
                  className="inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 text-[13px] font-bold text-white hover:bg-white/10 transition">
              Learn more
            </Link>
          </div>
        </div>
      </section>

      <ContactSalesModal
        open={!!salesModal}
        plan={salesModal}
        onClose={() => setSalesModal(null)}
      />
    </div>
  );
}
