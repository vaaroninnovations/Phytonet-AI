import { useState } from "react";
import { adminApi } from "@/context/AdminAuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export function AdminForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await adminApi.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (e) { toast.error(e?.response?.data?.detail || "Request failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4"
         data-testid="admin-forgot-password">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs uppercase">
            <ShieldCheck size={14}/> Admin
          </div>
          <h1 className="mt-4 text-2xl font-semibold">Forgot admin password</h1>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          {!sent ? (
            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <span className="text-xs text-slate-400 uppercase">Admin email</span>
                <div className="mt-1 relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    data-testid="admin-forgot-email"
                    type="email" required autoFocus
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm"
                    placeholder="superadmin@phytonet.ai"
                  />
                </div>
              </label>
              <button
                data-testid="admin-forgot-submit"
                type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold disabled:opacity-60"
              >
                {loading ? <Loader2 className="animate-spin" size={14}/> : <KeyRound size={14}/>}
                Send reset link
              </button>
              <button type="button" onClick={() => window.location.href = "/admin/login"}
                      className="w-full text-xs text-slate-400 hover:text-amber-300">
                Back to sign-in
              </button>
            </form>
          ) : (
            <div className="text-center space-y-3">
              <div className="text-emerald-300 text-lg">Check your email</div>
              <div className="text-sm text-slate-400">If the account exists, a reset link has been sent.</div>
              <a className="inline-block text-xs text-amber-300 hover:underline" href="/admin/login">Back to sign-in</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) { toast.error("Passwords don't match"); return; }
    if (pw.next.length < 10) { toast.error("Password must be ≥10 characters"); return; }
    setLoading(true);
    try {
      await adminApi.post("/auth/reset-password", { token, new_password: pw.next });
      toast.success("Password reset. Please sign in.");
      navigate("/admin/login", { replace: true });
    } catch (e) { toast.error(e?.response?.data?.detail || "Reset failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4"
         data-testid="admin-reset-password">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <h1 className="text-xl font-semibold text-center mb-6">Reset admin password</h1>
        {!token ? (
          <div className="text-red-300 text-sm text-center">Missing reset token.</div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              data-testid="admin-reset-new" type="password" required placeholder="New password (≥10 chars)"
              value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm"
            />
            <input
              data-testid="admin-reset-confirm" type="password" required placeholder="Confirm new password"
              value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm"
            />
            <button
              data-testid="admin-reset-submit"
              type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold disabled:opacity-60"
            >
              {loading ? "Resetting…" : "Reset password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
