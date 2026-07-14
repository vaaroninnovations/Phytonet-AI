// PhytoNet AI — glassmorphism auth modal (Sign In / Sign Up tabs).
import { useEffect, useState } from "react";
import { X, Loader2, LogIn, UserPlus, Github, Mail, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const ROLES = ["Undergraduate Student", "Postgraduate Student", "PhD Scholar", "Research Associate",
               "Scientist", "Assistant Professor", "Associate Professor", "Professor",
               "Industry Researcher", "Pharmaceutical Scientist", "Clinician", "Other"];
const RESEARCH_AREAS = ["Network Pharmacology", "Pharmacology", "Bioinformatics", "Drug Discovery",
                        "Medicinal Chemistry", "Natural Products", "Computational Biology",
                        "Systems Biology", "Other"];
const PURPOSE = ["Research Project", "PhD Thesis", "Master's Dissertation", "Teaching",
                 "Publication", "Drug Discovery", "Grant Proposal", "Personal Learning", "Other"];
const REFERRAL = ["Google Search", "Google Scholar", "Research Paper", "Conference", "Workshop",
                  "Supervisor", "Friend / Colleague", "LinkedIn", "Twitter/X", "YouTube",
                  "GitHub", "Institution", "Other"];

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS,
// THIS BREAKS THE AUTH. The backend's GOOGLE_REDIRECT_URI env is the single
// source of truth; the frontend button just navigates to /api/auth/google/login.
function GoogleSignInButton() {
  const BACKEND = process.env.REACT_APP_BACKEND_URL || "";
  const next = typeof window !== "undefined" ? window.location.pathname : "/";
  const href = `${BACKEND}/api/auth/google/login?next=${encodeURIComponent(next)}`;
  return (
    <a data-testid="signin-google" href={href}
       className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#E7E7F3] bg-white px-5 py-2.5 text-[13px] font-bold text-[#0B0B18] hover:border-[#5139ED]/40 hover:bg-[#FAFAFF]">
      <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
      Continue with Google
    </a>
  );
}


export function AuthModal() {
  const { modalOpen, modalTab, setModalTab, closeModal, login, register } = useAuth();
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e) => { if (e.key === "Escape") closeModal(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [modalOpen, closeModal]);

  if (!modalOpen) return null;
  return (
    <div data-testid="auth-modal-backdrop" onClick={closeModal}
         className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0B0B18]/60 p-4 backdrop-blur-sm animate-in fade-in">
      <div data-testid="auth-modal" onClick={(e) => e.stopPropagation()}
           className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/40 bg-white/90 shadow-[0_30px_60px_-20px_rgba(81,57,237,0.35)] backdrop-blur-xl animate-in zoom-in-95">
        <button data-testid="auth-close" onClick={closeModal}
                className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white text-[#64748B] hover:text-[#0B0B18]">
          <X className="h-4 w-4" />
        </button>
        <div className="px-8 pt-8">
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
            Continue with your PhytoNet account
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#0B0B18]">
            {modalTab === "signin" ? "Welcome back" : "Create your account"}
          </h2>
          <div className="mt-4 inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white p-1">
            <button data-testid="auth-tab-signin" onClick={() => setModalTab("signin")}
                    className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest ${modalTab === "signin" ? "bg-[#5139ED] text-white" : "text-[#0B0B18] hover:text-[#5139ED]"}`}>
              Sign In
            </button>
            <button data-testid="auth-tab-signup" onClick={() => setModalTab("signup")}
                    className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest ${modalTab === "signup" ? "bg-[#5139ED] text-white" : "text-[#0B0B18] hover:text-[#5139ED]"}`}>
              Create Account
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-8 pb-8 pt-4">
          <GoogleSignInButton />
          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-[#E7E7F3]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#94A3B8]">or</span>
            <span className="h-px flex-1 bg-[#E7E7F3]" />
          </div>
          {modalTab === "signin" ? <SignInForm login={login} setModalTab={setModalTab} /> : <SignUpForm register={register} setModalTab={setModalTab} />}
        </div>
      </div>
    </div>
  );
}

function SignInForm({ login, setModalTab }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await login({ email, password, remember_me: remember }); toast.success("Signed in"); }
    catch (ex) { setErr(fmtErr(ex)); }
    finally { setBusy(false); }
  };

  return (
    <form data-testid="signin-form" onSubmit={submit} className="mt-2 space-y-3">
      <Field label="Email"><input data-testid="signin-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inp} /></Field>
      <Field label="Password"><input data-testid="signin-password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inp} /></Field>
      <label className="flex items-center gap-2 text-xs text-[#64748B]">
        <input data-testid="signin-remember" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-[#5139ED]" />
        Remember me on this device
      </label>
      {err && <p data-testid="signin-error" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
      <button data-testid="signin-submit" type="submit" disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-5 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)] disabled:opacity-40">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Sign In
      </button>
      <div className="flex items-center justify-between text-xs text-[#64748B]">
        <button type="button" data-testid="signin-forgot" className="hover:text-[#5139ED]">Forgot password?</button>
        <div className="text-[#94A3B8]">
          Don't have an account?{" "}
          <button data-testid="signin-goto-signup" type="button" onClick={() => setModalTab("signup")} className="font-semibold text-[#5139ED] hover:underline">Create Account</button>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#94A3B8]">
        <div className="h-px flex-1 bg-[#E7E7F3]" />or continue with<div className="h-px flex-1 bg-[#E7E7F3]" />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button data-testid="signin-google" type="button" disabled title="Coming soon"
                className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-xs font-semibold text-[#94A3B8]">
          <Mail className="h-3.5 w-3.5" /> Google
        </button>
        <button data-testid="signin-orcid" type="button" disabled title="Coming soon"
                className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-xs font-semibold text-[#94A3B8]">
          <Github className="h-3.5 w-3.5" /> ORCID
        </button>
      </div>
    </form>
  );
}

function SignUpForm({ register, setModalTab }) {
  const [f, setF] = useState({
    first_name: "", last_name: "", email: "", password: "", confirm: "",
    country: "", institution: "", department: "", role: "", research_area: "",
    purpose_of_use: [], referral_source: "", orcid_id: "", website: "",
  });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const upd = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const togglePurpose = (p) => setF((s) => ({ ...s, purpose_of_use: s.purpose_of_use.includes(p)
    ? s.purpose_of_use.filter((x) => x !== p) : [...s.purpose_of_use, p] }));

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (f.password !== f.confirm) { setErr("Passwords do not match"); return; }
    if (f.password.length < 8) { setErr("Password must be at least 8 characters"); return; }
    setBusy(true);
    try {
      const { confirm, ...payload } = f;
      await register(payload);
      toast.success("Account created — please check your email to verify.");
    } catch (ex) { setErr(fmtErr(ex)); }
    finally { setBusy(false); }
  };

  return (
    <form data-testid="signup-form" onSubmit={submit} className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
      <Field label="First Name"><input data-testid="signup-first" required value={f.first_name} onChange={upd("first_name")} className={inp} /></Field>
      <Field label="Last Name"><input data-testid="signup-last" required value={f.last_name} onChange={upd("last_name")} className={inp} /></Field>
      <Field label="Email" className="md:col-span-2"><input data-testid="signup-email" type="email" required value={f.email} onChange={upd("email")} className={inp} /></Field>
      <Field label="Password"><input data-testid="signup-password" type="password" required minLength={8} value={f.password} onChange={upd("password")} className={inp} /></Field>
      <Field label="Confirm Password"><input data-testid="signup-confirm" type="password" required minLength={8} value={f.confirm} onChange={upd("confirm")} className={inp} /></Field>
      <Field label="Country"><input data-testid="signup-country" value={f.country} onChange={upd("country")} className={inp} /></Field>
      <Field label="Institution / Organization"><input data-testid="signup-institution" value={f.institution} onChange={upd("institution")} className={inp} /></Field>
      <Field label="Department (optional)"><input data-testid="signup-department" value={f.department} onChange={upd("department")} className={inp} /></Field>
      <Field label="Role"><select data-testid="signup-role" value={f.role} onChange={upd("role")} className={inp}><option value="">Select…</option>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
      <Field label="Research Area" className="md:col-span-2"><select data-testid="signup-area" value={f.research_area} onChange={upd("research_area")} className={inp}><option value="">Select…</option>{RESEARCH_AREAS.map((r) => <option key={r}>{r}</option>)}</select></Field>
      <div className="md:col-span-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Purpose of Using PhytoNet AI</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {PURPOSE.map((p) => (
            <label key={p} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1 text-xs">
              <input data-testid={`signup-purpose-${p.replace(/\W+/g,'-').toLowerCase()}`} type="checkbox" checked={f.purpose_of_use.includes(p)} onChange={() => togglePurpose(p)} className="accent-[#5139ED]" />
              {p}
            </label>
          ))}
        </div>
      </div>
      <Field label="How did you hear about PhytoNet AI?" className="md:col-span-2">
        <select data-testid="signup-referral" value={f.referral_source} onChange={upd("referral_source")} className={inp}><option value="">Select…</option>{REFERRAL.map((r) => <option key={r}>{r}</option>)}</select>
      </Field>
      <Field label="ORCID ID (optional)"><input data-testid="signup-orcid" value={f.orcid_id} onChange={upd("orcid_id")} className={inp} placeholder="0000-0000-0000-0000" /></Field>
      <Field label="Website (optional)"><input data-testid="signup-website" value={f.website} onChange={upd("website")} className={inp} placeholder="https://…" /></Field>

      {err && <p data-testid="signup-error" className="md:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
      <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2">
        <button type="button" data-testid="signup-back" onClick={() => setModalTab("signin")} className="text-xs text-[#94A3B8] hover:text-[#5139ED]">← Back to Sign In</button>
        <button data-testid="signup-submit" type="submit" disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-5 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)] disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Create Account
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </form>
  );
}

function Field({ label, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B] ${className}`}>
      {label}{children}
    </label>
  );
}
const inp = "brand-focus mt-1 w-full rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#0B0B18]";

function fmtErr(ex) {
  const d = ex?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => e?.msg || JSON.stringify(e)).join(" · ");
  return ex?.message || "Something went wrong";
}
