// User Profile — personal information + academic identifiers + bio.
// Backed by PATCH /api/auth/me (allow-listed fields).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Save, X, ShieldCheck, ExternalLink, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { updateProfile } from "@/lib/api";
import { toast } from "sonner";

const FIELDS = [
  { key: "first_name",    label: "First name" },
  { key: "last_name",     label: "Last name" },
  { key: "username",      label: "Username" },
  { key: "institution",   label: "Institution" },
  { key: "department",    label: "Department" },
  { key: "designation",   label: "Designation" },
  { key: "country",       label: "Country" },
  { key: "orcid",         label: "ORCID", placeholder: "0000-0000-0000-0000" },
  { key: "google_scholar",label: "Google Scholar URL" },
  { key: "researchgate",  label: "ResearchGate URL" },
];

export default function Profile() {
  const navigate = useNavigate();
  const { user, ready, refreshUser } = useAuth();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (ready && !user) navigate("/", { replace: true });
  }, [ready, user, navigate]);

  useEffect(() => {
    if (!user) return;
    const initial = {};
    for (const f of FIELDS) initial[f.key] = user[f.key] || "";
    initial.bio = user.bio || "";
    setForm(initial);
    setDirty(false);
  }, [user]);

  const change = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile(form);
      if (refreshUser) await refreshUser();
      toast.success("Profile saved");
      setDirty(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save profile");
    } finally { setSaving(false); }
  };

  if (!user) return null;

  return (
    <main data-testid="profile-page" className="mx-auto max-w-4xl px-6 py-14">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-[#5139ED] to-[#8139ED] font-bold text-white">
          {(user.first_name?.[0] || user.email?.[0] || "?").toUpperCase()}
        </div>
        <div>
          <h1 className="font-headline text-3xl font-bold tracking-tight text-[#0F172A]">Profile</h1>
          <p className="text-[13px] text-[#64748B]">Manage your personal and academic information.</p>
        </div>
      </div>

      {/* Read-only account facts */}
      <div className="mb-6 rounded-2xl border border-[#E7E7F3] bg-white/70 p-5 backdrop-blur">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-[12.5px]">
          <div><div className="text-[10.5px] uppercase tracking-wider text-[#94A3B8]">Email</div><div className="mt-0.5 truncate text-[#0F172A]">{user.email}</div></div>
          <div><div className="text-[10.5px] uppercase tracking-wider text-[#94A3B8]">Account</div><div className="mt-0.5 text-[#0F172A]">{user.account_type || "user"}</div></div>
          <div><div className="text-[10.5px] uppercase tracking-wider text-[#94A3B8]">Verified</div><div className="mt-0.5 inline-flex items-center gap-1 text-[#0F172A]">{user.email_verified ? <ShieldCheck className="h-3 w-3 text-[#2BB673]" /> : "pending"} {user.email_verified ? "yes" : ""}</div></div>
        </div>
      </div>

      {/* Editable fields */}
      <div className="rounded-2xl border border-[#E7E7F3] bg-white/70 p-5 backdrop-blur">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="text-[11.5px] font-semibold text-[#64748B]">
              {f.label}
              <input
                data-testid={`profile-${f.key}`}
                value={form[f.key] || ""}
                onChange={(e) => change(f.key, e.target.value)}
                placeholder={f.placeholder || ""}
                className="mt-1 h-10 w-full rounded-lg border border-[#E7E7F3] bg-white px-3 text-[13px] text-[#0F172A] outline-none focus:border-[#5139ED]/50 focus:ring-2 focus:ring-[#5139ED]/15"
              />
            </label>
          ))}
        </div>
        <label className="mt-3 block text-[11.5px] font-semibold text-[#64748B]">
          Bio
          <textarea
            data-testid="profile-bio"
            rows={4}
            value={form.bio || ""}
            onChange={(e) => change("bio", e.target.value)}
            placeholder="Tell reviewers and collaborators about your research focus…"
            className="mt-1 w-full resize-y rounded-lg border border-[#E7E7F3] bg-white p-3 text-[13px] text-[#0F172A] outline-none focus:border-[#5139ED]/50 focus:ring-2 focus:ring-[#5139ED]/15"
          />
        </label>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="profile-save"
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#5139ED] px-5 py-2.5 text-[12.5px] font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#4127c9] disabled:pointer-events-none disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save changes
        </button>
        <button
          type="button"
          onClick={() => { setDirty(false); const initial = {}; for (const f of FIELDS) initial[f.key] = user[f.key] || ""; initial.bio = user.bio || ""; setForm(initial); }}
          disabled={!dirty}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-4 py-2.5 text-[12.5px] font-semibold text-[#111827] transition hover:border-[#94A3B8] disabled:pointer-events-none disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" /> Discard
        </button>
        <a href="https://orcid.org" target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-[#5139ED] hover:underline">
          Don't have ORCID? Get one <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Connected accounts */}
      <div className="mt-8 rounded-2xl border border-[#E7E7F3] bg-white/70 p-5 backdrop-blur">
        <div className="mb-3 text-[13px] font-semibold text-[#0F172A]">Connected accounts</div>
        <div className="flex items-center justify-between text-[12.5px]">
          <div className="text-[#0F172A]">Google</div>
          <div className={user.oauth_provider === "google" ? "text-[#2BB673] font-semibold" : "text-[#94A3B8]"}>
            {user.oauth_provider === "google" ? "Connected" : "Not connected"}
          </div>
        </div>
      </div>
    </main>
  );
}
