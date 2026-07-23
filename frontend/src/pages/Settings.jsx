// Settings — configurable preferences grouped into sections.
// Persisted to the user doc via PATCH /api/auth/me (allow-listed prefs).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings as SettingsIcon, Palette, Bell, Shield, Download,
  Globe, Trash2, LogOut, Save, Loader2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { updateProfile } from "@/lib/api";
import { toast } from "sonner";

function Section({ icon: Ic, title, children, testid }) {
  return (
    <section data-testid={testid} className="rounded-2xl border border-[#E7E7F3] bg-white/70 p-5 backdrop-blur">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[#0F172A]">
        <Ic className="h-4 w-4 text-[#5139ED]" /> {title}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

import { Switch } from "@/components/ui/switch";

function ToggleRow({ label, hint, value, onChange, testid }) {
  return (
    <label className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-[#0F172A]">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] text-[#64748B]">{hint}</div>}
      </div>
      <Switch
        checked={value}
        onCheckedChange={onChange}
        data-testid={testid}
        className="shrink-0 data-[state=checked]:bg-[#5139ED] data-[state=unchecked]:bg-[#E7E7F3]"
      />
    </label>
  );
}

function SelectRow({ label, value, onChange, options, testid }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <div className="text-[13px] font-semibold text-[#0F172A]">{label}</div>
      <select
        data-testid={testid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-[#E7E7F3] bg-white px-2 text-[12.5px] outline-none focus:border-[#5139ED]/50"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, ready, logout, refreshUser } = useAuth();
  const [prefs, setPrefs] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (ready && !user) navigate("/", { replace: true });
  }, [ready, user, navigate]);

  useEffect(() => {
    if (!user) return;
    setPrefs({
      theme_pref:          user.theme_pref          || "system",
      language_pref:       user.language_pref       || "en",
      timezone_pref:       user.timezone_pref       || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      date_format_pref:    user.date_format_pref    || "YYYY-MM-DD",
      notify_email:        user.notify_email        !== false,
      notify_workflow:     user.notify_workflow     !== false,
      notify_low_nodes:    user.notify_low_nodes    !== false,
      notify_updates:      user.notify_updates      !== false,
      download_format_pref:user.download_format_pref|| "csv",
      auto_save_projects:  user.auto_save_projects  !== false,
    });
    setDirty(false);
  }, [user]);

  const set = (k, v) => { setPrefs((p) => ({ ...p, [k]: v })); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile(prefs);
      if (refreshUser) await refreshUser();
      toast.success("Settings saved");
      setDirty(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save settings");
    } finally { setSaving(false); }
  };

  if (!user) return null;

  return (
    <main data-testid="settings-page" className="mx-auto max-w-4xl px-6 py-14">
      <div className="mb-8 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#5139ED]/10 text-[#5139ED]"><SettingsIcon className="h-5 w-5" /></span>
        <div>
          <h1 className="font-headline text-3xl font-bold tracking-tight text-[#0F172A]">Settings</h1>
          <p className="text-[13px] text-[#64748B]">Configure appearance, notifications, downloads, and account preferences.</p>
        </div>
      </div>

      <div className="space-y-4">
        <Section icon={Palette} title="Appearance" testid="section-appearance">
          <SelectRow label="Theme" value={prefs.theme_pref} onChange={(v) => set("theme_pref", v)} testid="pref-theme"
            options={[
              { value: "light",  label: "Light" },
              { value: "dark",   label: "Dark (coming soon)" },
              { value: "system", label: "Match system" },
            ]} />
        </Section>

        <Section icon={Bell} title="Notifications" testid="section-notifications">
          <ToggleRow label="Email notifications"           hint="Master switch for all outbound email." value={prefs.notify_email}     onChange={(v) => set("notify_email", v)}     testid="pref-notify-email" />
          <ToggleRow label="Workflow completion alerts"    hint="Ping me when a long-running docking or AI Agent run finishes." value={prefs.notify_workflow}  onChange={(v) => set("notify_workflow", v)}  testid="pref-notify-workflow" />
          <ToggleRow label="Low node balance alerts"       hint="Warn me when my node balance falls below 20." value={prefs.notify_low_nodes} onChange={(v) => set("notify_low_nodes", v)} testid="pref-notify-low-nodes" />
          <ToggleRow label="Product updates & newsletter"  hint="Occasional emails about new modules and features." value={prefs.notify_updates}   onChange={(v) => set("notify_updates", v)}   testid="pref-notify-updates" />
        </Section>

        <Section icon={Shield} title="Privacy & Security" testid="section-security">
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-[13px] font-semibold text-[#0F172A]">Change password</div><div className="text-[11.5px] text-[#64748B]">Use "Forgot password" from the sign-in modal.</div></div>
            <button type="button" onClick={() => logout()} className="rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[#111827] hover:border-[#94A3B8]">Sign out & reset</button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-[13px] font-semibold text-[#0F172A]">Two-Factor Authentication</div><div className="text-[11.5px] text-[#64748B]">Coming soon — track progress in the changelog.</div></div>
            <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[10.5px] font-semibold text-[#64748B]">Soon</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-[13px] font-semibold text-[#0F172A]">Active sessions</div><div className="text-[11.5px] text-[#64748B]">Session cookie: {user.oauth_provider === "google" ? "Google-linked" : "email/password"}. Log out to revoke.</div></div>
          </div>
        </Section>

        <Section icon={Download} title="Downloads" testid="section-downloads">
          <SelectRow label="Preferred download format" value={prefs.download_format_pref} onChange={(v) => set("download_format_pref", v)} testid="pref-download-format"
            options={[
              { value: "csv",  label: "CSV" },
              { value: "xlsx", label: "Excel (.xlsx)" },
              { value: "json", label: "JSON" },
            ]} />
          <ToggleRow label="Auto-save projects" hint="After each successful workflow, snapshot the state to My Projects automatically." value={prefs.auto_save_projects} onChange={(v) => set("auto_save_projects", v)} testid="pref-auto-save" />
        </Section>

        <Section icon={Globe} title="Language & Region" testid="section-language">
          <SelectRow label="Language" value={prefs.language_pref} onChange={(v) => set("language_pref", v)} testid="pref-language"
            options={[
              { value: "en", label: "English" },
              { value: "hi", label: "Hindi (coming soon)" },
              { value: "zh", label: "Chinese (coming soon)" },
            ]} />
          <SelectRow label="Time zone" value={prefs.timezone_pref} onChange={(v) => set("timezone_pref", v)} testid="pref-timezone"
            options={[
              { value: "UTC",              label: "UTC" },
              { value: "Asia/Kolkata",     label: "Asia/Kolkata (IST)" },
              { value: "Europe/London",    label: "Europe/London" },
              { value: "America/New_York", label: "America/New_York" },
              { value: "America/Los_Angeles", label: "America/Los_Angeles" },
            ]} />
          <SelectRow label="Date format" value={prefs.date_format_pref} onChange={(v) => set("date_format_pref", v)} testid="pref-date-format"
            options={[
              { value: "YYYY-MM-DD", label: "2026-02-23" },
              { value: "DD/MM/YYYY", label: "23/02/2026" },
              { value: "MM/DD/YYYY", label: "02/23/2026" },
            ]} />
        </Section>

        <Section icon={Trash2} title="Account Management" testid="section-account">
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-[13px] font-semibold text-[#0F172A]">Export user data</div><div className="text-[11.5px] text-[#64748B]">Contact support to receive a full GDPR export of your account & projects.</div></div>
            <a href="mailto:support@phytonet.ai?subject=Data export request" className="rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[#111827] hover:border-[#94A3B8]">Request export</a>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-[13px] font-semibold text-red-700">Delete account</div><div className="text-[11.5px] text-[#64748B]">Permanently remove your account and all associated projects. This cannot be undone.</div></div>
            <a href="mailto:support@phytonet.ai?subject=Delete my account" className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-[11.5px] font-semibold text-red-700 hover:border-red-400">Contact support</a>
          </div>
          <button
            type="button"
            onClick={logout}
            data-testid="settings-logout"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[#0F172A] hover:border-[#94A3B8]"
          >
            <LogOut className="h-3.5 w-3.5" /> Log out
          </button>
        </Section>
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-6 mt-6 flex justify-end">
        <button
          type="button"
          data-testid="settings-save"
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#5139ED] px-5 py-2.5 text-[12.5px] font-bold text-white shadow-[0_12px_28px_-10px_rgba(81,57,237,0.55)] transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save settings
        </button>
      </div>
    </main>
  );
}
