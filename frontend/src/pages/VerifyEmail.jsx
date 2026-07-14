// Email verification landing page — reached via link in verification email.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { verifyEmailToken, resendVerificationPublic } from "@/lib/api";
import { toast } from "sonner";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const { user, openModal } = useAuth();
  const [state, setState] = useState("pending");  // pending | success | error
  const [message, setMessage] = useState("");
  const [showResend, setShowResend] = useState(false);
  const [resendEmail, setResendEmail] = useState(user?.email || "");
  const [resendPassword, setResendPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("No verification token in URL.");
      return;
    }
    (async () => {
      try {
        const r = await verifyEmailToken(token);
        setState("success");
        setMessage(`Email verified successfully${r.email ? ` for ${r.email}` : ""}.`);
      } catch (e) {
        setState("error");
        const detail = e?.response?.data?.detail || e.message || "Verification failed.";
        setMessage(detail);
        setShowResend(true);
      }
    })();
  }, [token]);

  const doResend = async () => {
    if (!resendEmail || !resendPassword) return toast.error("Enter your email and password to resend");
    setBusy(true);
    try {
      const r = await resendVerificationPublic(resendEmail, resendPassword);
      if (r.already_verified) toast.success("Your email is already verified.");
      else toast.success("Verification email sent — check your inbox.");
      setShowResend(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Resend failed");
    } finally { setBusy(false); }
  };

  return (
    <main data-testid="verify-email-page" className="mx-auto max-w-lg px-6 py-24 text-center">
      {state === "pending" && (
        <div>
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#5139ED]" />
          <p className="mt-4 text-sm text-[#64748B]">Verifying your email…</p>
        </div>
      )}
      {state === "success" && (
        <div data-testid="verify-success">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="mt-5 font-display text-3xl font-bold text-[#0B0B18]">You're verified!</h1>
          <p className="mt-2 text-sm text-[#64748B]">{message}</p>
          <div className="mt-6 flex justify-center gap-3">
            {!user ? (
              <button data-testid="verify-signin" onClick={() => openModal("signin")}
                      className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#4127c9]">
                Sign in <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <Link to="/phytonet-ai" data-testid="verify-continue"
                    className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#4127c9]">
                Continue to PhytoNet AI <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      )}
      {state === "error" && (
        <div data-testid="verify-error">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-50 text-red-600">
            <XCircle className="h-7 w-7" />
          </div>
          <h1 className="mt-5 font-display text-3xl font-bold text-[#0B0B18]">Verification failed</h1>
          <p className="mt-2 text-sm text-[#64748B]">{message}</p>
          {showResend && (
            <div className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5 text-left">
              <p className="font-heading text-xs font-bold uppercase tracking-widest text-[#5139ED]">Request new link</p>
              <p className="mt-1 text-xs text-[#64748B]">Enter your credentials to resend a fresh 24-hour verification link.</p>
              <input data-testid="resend-email" type="email" placeholder="Email" value={resendEmail}
                     onChange={(e) => setResendEmail(e.target.value)}
                     className="brand-focus mt-3 w-full rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm" />
              <input data-testid="resend-password" type="password" placeholder="Password" value={resendPassword}
                     onChange={(e) => setResendPassword(e.target.value)}
                     className="brand-focus mt-2 w-full rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm" />
              <button data-testid="resend-submit" onClick={doResend} disabled={busy}
                      className="mt-3 w-full rounded-full bg-[#5139ED] px-5 py-2 text-sm font-bold text-white hover:bg-[#4127c9] disabled:opacity-40">
                {busy ? "Sending…" : "Send new verification email"}
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
