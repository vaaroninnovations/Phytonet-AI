import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { ShieldCheck, Lock, Mail, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";

export default function AdminLogin() {
  const { login, verify2FA, sendEmailOtp } = useAdminAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState("credentials"); // credentials | 2fa
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState(null); // { token, method }
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmitCreds = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await login({ email, password });
      if (res.twoFactorRequired) {
        setChallenge({ token: res.challengeToken, method: res.method });
        setStep("2fa");
        if (res.method === "email_otp") {
          await sendEmailOtp(res.challengeToken);
          toast.success("One-time code sent to admin email");
        }
      } else {
        toast.success("Signed in");
        navigate("/admin/dashboard", { replace: true });
      }
    } catch (err) {
      setError(err?.response?.data?.detail || "Login failed");
    } finally { setLoading(false); }
  };

  const onSubmit2FA = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await verify2FA({ challengeToken: challenge.token, code });
      toast.success("Signed in");
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      setError(err?.response?.data?.detail || "2FA verification failed");
    } finally { setLoading(false); }
  };

  const resendOtp = async () => {
    try { await sendEmailOtp(challenge.token); toast.success("Code resent"); }
    catch (e) { toast.error("Failed to resend code"); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex items-center justify-center px-4"
         data-testid="admin-login-page">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs tracking-wide uppercase">
            <ShieldCheck size={14} /> Super-Admin
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">PhytoNet Admin Console</h1>
          <p className="mt-2 text-sm text-slate-400">Single-admin, secured access.</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur p-6 shadow-xl">
          {step === "credentials" && (
            <form onSubmit={onSubmitCreds} className="space-y-4" data-testid="admin-credentials-form">
              <label className="block">
                <span className="text-xs text-slate-400 uppercase tracking-wide">Admin email</span>
                <div className="mt-1 relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    data-testid="admin-email-input"
                    type="email" autoComplete="username" required autoFocus
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-amber-500/50 focus:outline-none text-sm"
                    placeholder="superadmin@phytonet.ai"
                  />
                </div>
              </label>
              <label className="block">
                <span className="text-xs text-slate-400 uppercase tracking-wide">Password</span>
                <div className="mt-1 relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    data-testid="admin-password-input"
                    type="password" autoComplete="current-password" required
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-amber-500/50 focus:outline-none text-sm"
                    placeholder="••••••••"
                  />
                </div>
              </label>
              {error && (
                <div data-testid="admin-login-error" className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md p-2">{error}</div>
              )}
              <button
                data-testid="admin-login-submit"
                type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold disabled:opacity-60"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                {loading ? "Signing in…" : "Sign in"}
              </button>
              <button
                data-testid="admin-forgot-password-btn"
                type="button"
                onClick={() => navigate("/admin/forgot-password")}
                className="w-full text-xs text-slate-400 hover:text-amber-300"
              >
                Forgot password?
              </button>
            </form>
          )}

          {step === "2fa" && (
            <form onSubmit={onSubmit2FA} className="space-y-4" data-testid="admin-2fa-form">
              <div className="text-sm text-slate-300">
                {challenge?.method === "totp"
                  ? "Enter the 6-digit code from your authenticator app."
                  : "Enter the 6-digit code sent to the admin email."}
              </div>
              <input
                data-testid="admin-2fa-code-input"
                type="text" inputMode="numeric" pattern="[0-9]*"
                maxLength={6} required autoFocus
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-full text-center text-2xl tracking-[0.5em] py-3 rounded-lg bg-slate-950 border border-slate-800 focus:border-amber-500/50 focus:outline-none"
                placeholder="000000"
              />
              {error && (
                <div data-testid="admin-2fa-error" className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md p-2">{error}</div>
              )}
              <button
                data-testid="admin-2fa-submit"
                type="submit" disabled={loading || code.length !== 6}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold disabled:opacity-60"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                Verify & continue
              </button>
              {challenge?.method === "email_otp" && (
                <button
                  data-testid="admin-2fa-resend"
                  type="button" onClick={resendOtp}
                  className="w-full text-xs text-slate-400 hover:text-amber-300"
                >
                  Resend code
                </button>
              )}
              <button
                type="button"
                onClick={() => { setStep("credentials"); setCode(""); setError(""); }}
                className="w-full text-xs text-slate-500 hover:text-slate-300"
              >
                Back to sign-in
              </button>
            </form>
          )}
        </div>

        <div className="mt-6 text-center text-xs text-slate-500">
          Only the single configured super-admin can sign in here. All actions are audit-logged.
        </div>
      </div>
    </div>
  );
}
