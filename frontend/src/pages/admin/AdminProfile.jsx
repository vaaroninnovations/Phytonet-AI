import { useEffect, useState } from "react";
import { adminApi, useAdminAuth } from "@/context/AdminAuthContext";
import { Loader2, ShieldCheck, KeyRound, Smartphone, Mail, XCircle } from "lucide-react";
import { toast } from "sonner";

function Section({ title, subtitle, children, testid }) {
  return (
    <section data-testid={testid} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="mb-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-300">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export default function AdminProfile() {
  const { admin, refresh } = useAdminAuth();
  // Change password
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwLoading, setPwLoading] = useState(false);

  // 2FA setup
  const [setupMethod, setSetupMethod] = useState(null); // 'totp' | 'email_otp'
  const [pendingSecret, setPendingSecret] = useState("");
  const [qr, setQr] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);

  const [disablePw, setDisablePw] = useState("");
  const [disableLoading, setDisableLoading] = useState(false);

  const submitPassword = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) { toast.error("Passwords don't match"); return; }
    if (pw.next.length < 10) { toast.error("Password must be ≥10 chars"); return; }
    setPwLoading(true);
    try {
      await adminApi.post("/auth/change-password", {
        current_password: pw.current, new_password: pw.next,
      });
      toast.success("Password updated");
      setPw({ current: "", next: "", confirm: "" });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to change password");
    } finally { setPwLoading(false); }
  };

  const beginSetup = async (method) => {
    setSetupLoading(true); setSetupMethod(method); setConfirmCode("");
    setPendingSecret(""); setQr("");
    try {
      const { data } = await adminApi.post("/auth/2fa/setup", { method });
      if (method === "totp") {
        setPendingSecret(data.pending_secret);
        setQr(data.qr_code);
      } else {
        toast.success("Verification code sent to admin email");
      }
    } catch (e) { toast.error(e?.response?.data?.detail || "Setup failed"); setSetupMethod(null); }
    finally { setSetupLoading(false); }
  };

  const confirmSetup = async () => {
    setSetupLoading(true);
    try {
      await adminApi.post("/auth/2fa/confirm", {
        method: setupMethod, code: confirmCode,
        pending_secret: setupMethod === "totp" ? pendingSecret : undefined,
      });
      toast.success("Two-factor authentication enabled");
      setSetupMethod(null); setPendingSecret(""); setQr(""); setConfirmCode("");
      await refresh();
    } catch (e) { toast.error(e?.response?.data?.detail || "Invalid code"); }
    finally { setSetupLoading(false); }
  };

  const disable2FA = async () => {
    if (!disablePw) { toast.error("Password required"); return; }
    setDisableLoading(true);
    try {
      await adminApi.post("/auth/2fa/disable", { password: disablePw });
      toast.success("Two-factor authentication disabled");
      setDisablePw("");
      await refresh();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to disable 2FA"); }
    finally { setDisableLoading(false); }
  };

  return (
    <div className="space-y-8 max-w-3xl" data-testid="admin-profile">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Profile & Security</h1>
        <p className="text-sm text-slate-400 mt-1">Manage your admin credentials and 2FA.</p>
      </header>

      <Section title="Account" testid="admin-profile-account">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs text-slate-500 uppercase tracking-wide">Email</dt>
            <dd className="mt-1 text-slate-100" data-testid="admin-profile-email">{admin?.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 uppercase tracking-wide">Role</dt>
            <dd className="mt-1 text-amber-200">Super Admin</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 uppercase tracking-wide">Member since</dt>
            <dd className="mt-1 text-slate-300">{admin?.created_at ? new Date(admin.created_at).toLocaleDateString() : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 uppercase tracking-wide">Last login</dt>
            <dd className="mt-1 text-slate-300">{admin?.last_login_at ? new Date(admin.last_login_at).toLocaleString() : "—"}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Change password" subtitle="Choose a strong password with at least 10 characters."
               testid="admin-change-password">
        <form onSubmit={submitPassword} className="space-y-3 max-w-md">
          <input
            data-testid="admin-current-password"
            type="password" required placeholder="Current password"
            value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm"
          />
          <input
            data-testid="admin-new-password"
            type="password" required placeholder="New password (≥10 chars)"
            value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm"
          />
          <input
            data-testid="admin-confirm-password"
            type="password" required placeholder="Confirm new password"
            value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm"
          />
          <button
            data-testid="admin-change-password-submit"
            type="submit" disabled={pwLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold disabled:opacity-60"
          >
            {pwLoading ? <Loader2 className="animate-spin" size={14}/> : <KeyRound size={14}/>}
            Update password
          </button>
        </form>
      </Section>

      <Section title="Two-factor authentication"
               subtitle="Add a second verification step to your admin sign-in."
               testid="admin-2fa-section">
        {admin?.two_factor_enabled ? (
          <div>
            <div className="flex items-center gap-2 mb-4 text-sm">
              <ShieldCheck className="text-emerald-400" size={16} />
              <span className="text-emerald-300 font-medium">2FA is enabled</span>
              <span className="text-slate-400">
                ({admin.two_factor_method === "totp" ? "Authenticator app" : "Email OTP"})
              </span>
            </div>
            <div className="space-y-2 max-w-md">
              <input
                data-testid="admin-disable-2fa-password"
                type="password" placeholder="Confirm your password"
                value={disablePw} onChange={(e) => setDisablePw(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm"
              />
              <button
                data-testid="admin-disable-2fa"
                onClick={disable2FA} disabled={disableLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-sm"
              >
                {disableLoading ? <Loader2 className="animate-spin" size={14}/> : <XCircle size={14}/>}
                Disable 2FA
              </button>
            </div>
          </div>
        ) : (
          <>
            {!setupMethod && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  data-testid="admin-setup-totp"
                  onClick={() => beginSetup("totp")}
                  className="p-4 text-left rounded-xl border border-slate-800 bg-slate-950 hover:border-amber-500/40 transition"
                >
                  <Smartphone className="text-amber-400 mb-2" size={20} />
                  <div className="font-medium text-slate-100">Authenticator app</div>
                  <div className="text-xs text-slate-400 mt-1">Google Authenticator, Authy, 1Password, etc. Recommended.</div>
                </button>
                <button
                  data-testid="admin-setup-email"
                  onClick={() => beginSetup("email_otp")}
                  className="p-4 text-left rounded-xl border border-slate-800 bg-slate-950 hover:border-amber-500/40 transition"
                >
                  <Mail className="text-amber-400 mb-2" size={20} />
                  <div className="font-medium text-slate-100">Email one-time code</div>
                  <div className="text-xs text-slate-400 mt-1">A 6-digit code is sent to the admin email on sign-in.</div>
                </button>
              </div>
            )}

            {setupMethod === "totp" && (
              <div className="space-y-4">
                <div className="text-sm text-slate-300">
                  1. Scan this QR code with your authenticator app:
                </div>
                {qr ? (
                  <img data-testid="admin-totp-qr" src={qr} alt="TOTP QR code"
                       className="w-40 h-40 rounded-lg border border-slate-700 bg-white p-2" />
                ) : <Loader2 className="animate-spin" />}
                <div className="text-xs text-slate-400">
                  Or enter this secret manually: <span className="font-mono text-slate-200" data-testid="admin-totp-secret">{pendingSecret}</span>
                </div>
                <div className="text-sm text-slate-300">2. Enter the 6-digit code from your app:</div>
                <input
                  data-testid="admin-totp-confirm-code"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ""))}
                  maxLength={6}
                  className="w-40 text-center text-xl tracking-widest py-2 rounded-lg bg-slate-950 border border-slate-800"
                  placeholder="000000"
                />
                <div className="flex gap-2">
                  <button data-testid="admin-totp-confirm"
                          onClick={confirmSetup} disabled={setupLoading || confirmCode.length !== 6}
                          className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold disabled:opacity-60">
                    {setupLoading ? "Verifying…" : "Enable 2FA"}
                  </button>
                  <button onClick={() => setSetupMethod(null)} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {setupMethod === "email_otp" && (
              <div className="space-y-3 max-w-md">
                <div className="text-sm text-slate-300">Enter the 6-digit code emailed to <span className="font-mono">{admin.email}</span>:</div>
                <input
                  data-testid="admin-email-confirm-code"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ""))}
                  maxLength={6}
                  className="w-40 text-center text-xl tracking-widest py-2 rounded-lg bg-slate-950 border border-slate-800"
                  placeholder="000000"
                />
                <div className="flex gap-2">
                  <button data-testid="admin-email-confirm"
                          onClick={confirmSetup} disabled={setupLoading || confirmCode.length !== 6}
                          className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold disabled:opacity-60">
                    {setupLoading ? "Verifying…" : "Enable 2FA"}
                  </button>
                  <button onClick={() => beginSetup("email_otp")}
                          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm">
                    Resend
                  </button>
                  <button onClick={() => setSetupMethod(null)}
                          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
