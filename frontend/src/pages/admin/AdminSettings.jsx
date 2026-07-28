import { useEffect, useMemo, useState } from "react";
import { adminApi } from "@/context/AdminAuthContext";
import { Loader2, Save, Sliders, Palette, Mail, Coins, ToggleRight, KeyRound } from "lucide-react";
import { toast } from "sonner";

const TABS = [
  { id: "branding", label: "Branding", icon: Palette },
  { id: "smtp", label: "SMTP / Email", icon: Mail },
  { id: "oauth", label: "OAuth", icon: KeyRound },
  { id: "node_pricing", label: "Node Pricing", icon: Coins },
  { id: "feature_flags", label: "Feature Flags", icon: ToggleRight },
];

function TextInput({ label, value, onChange, type = "text", placeholder, testid, hint }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-400 uppercase tracking-wide">{label}</span>
      <input
        data-testid={testid}
        type={type} value={value ?? ""} placeholder={placeholder}
        onChange={(e) => onChange(type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm focus:border-amber-500/50 focus:outline-none"
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function ToggleRow({ label, checked, onChange, testid, hint }) {
  return (
    <label className="flex items-center justify-between py-3 border-b border-slate-800 last:border-0">
      <div>
        <div className="text-sm text-slate-100">{label}</div>
        {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
      </div>
      <button
        type="button"
        data-testid={testid}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? "bg-amber-500" : "bg-slate-700"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </label>
  );
}

export default function AdminSettings() {
  const [tab, setTab] = useState("branding");
  const [all, setAll] = useState(null);
  const [dirty, setDirty] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await adminApi.get("/settings");
        setAll(data);
      } catch (e) { toast.error("Failed to load settings"); }
    })();
  }, []);

  const current = useMemo(() => {
    if (!all) return null;
    return dirty[tab] || all[tab];
  }, [dirty, all, tab]);

  const set = (partial) => {
    setDirty({ ...dirty, [tab]: { ...(dirty[tab] || all[tab] || {}), ...partial } });
  };

  const save = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const payload = { ...current };
      // SMTP: strip password_masked flag before sending
      if (tab === "smtp") delete payload.password_masked;
      const { data } = await adminApi.put(`/settings/${tab}`, payload);
      setAll({ ...all, [tab]: data.value });
      setDirty({ ...dirty, [tab]: undefined });
      toast.success(`${TABS.find(t => t.id === tab).label} saved`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  if (!all) {
    return <div className="flex items-center gap-2 text-slate-400"><Loader2 className="animate-spin" size={16}/> Loading settings…</div>;
  }

  return (
    <div className="space-y-6" data-testid="admin-settings">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Sliders size={20}/> Platform Settings
        </h1>
        <p className="text-sm text-slate-400 mt-1">Live configuration. Changes are audit-logged.</p>
      </header>

      <div className="flex gap-2 border-b border-slate-800 overflow-x-auto">
        {TABS.map((t) => {
          const active = tab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              data-testid={`settings-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 -mb-px text-sm border-b-2 flex items-center gap-2 transition-colors ${
                active ? "border-amber-400 text-amber-200" : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon size={14}/> {t.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        {tab === "branding" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5" data-testid="settings-panel-branding">
            <TextInput testid="branding-app-name" label="Application name" value={current.app_name} onChange={(v) => set({ app_name: v })} />
            <TextInput testid="branding-tagline" label="Tagline" value={current.tagline} onChange={(v) => set({ tagline: v })} />
            <TextInput testid="branding-logo-url" label="Logo URL" value={current.logo_url} onChange={(v) => set({ logo_url: v })} placeholder="https://…" />
            <TextInput testid="branding-support-email" label="Support email" value={current.support_email} onChange={(v) => set({ support_email: v })} />
            <TextInput testid="branding-primary-color" label="Primary color (hex)" value={current.primary_color} onChange={(v) => set({ primary_color: v })} />
            <TextInput testid="branding-accent-color" label="Accent color (hex)" value={current.accent_color} onChange={(v) => set({ accent_color: v })} />
          </div>
        )}

        {tab === "smtp" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5" data-testid="settings-panel-smtp">
            <TextInput testid="smtp-provider" label="Provider" value={current.provider} onChange={(v) => set({ provider: v })} placeholder="gmail | sendgrid | resend | mailgun | ses | smtp" />
            <TextInput testid="smtp-from" label="From address" value={current.from_address} onChange={(v) => set({ from_address: v })} placeholder='"PhytoNet AI" <noreply@phytonet.ai>' />
            <TextInput testid="smtp-host" label="Host" value={current.host} onChange={(v) => set({ host: v })} />
            <TextInput testid="smtp-port" label="Port" type="number" value={current.port} onChange={(v) => set({ port: v })} />
            <TextInput testid="smtp-username" label="Username" value={current.username} onChange={(v) => set({ username: v })} />
            <TextInput
              testid="smtp-password" label="Password / API key" type="password"
              value={current.password || ""}
              onChange={(v) => set({ password: v })}
              hint={current.password_masked ? "A password is currently stored. Leave blank to keep." : "No password stored yet."}
            />
            <label className="col-span-full flex items-center gap-2 text-sm text-slate-200">
              <input
                data-testid="smtp-tls"
                type="checkbox" checked={!!current.tls}
                onChange={(e) => set({ tls: e.target.checked })}
                className="w-4 h-4"
              />
              Use TLS
            </label>
          </div>
        )}

        {tab === "oauth" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5" data-testid="settings-panel-oauth">
            <TextInput testid="oauth-google-client-id" label="Google Client ID" value={current.google_client_id} onChange={(v) => set({ google_client_id: v })} />
            <TextInput testid="oauth-google-redirect" label="Google redirect URI" value={current.google_redirect_uri} onChange={(v) => set({ google_redirect_uri: v })} />
            <label className="col-span-full flex items-center gap-2 text-sm text-slate-200">
              <input
                data-testid="oauth-google-enabled"
                type="checkbox" checked={!!current.google_enabled}
                onChange={(e) => set({ google_enabled: e.target.checked })}
                className="w-4 h-4"
              />
              Google OAuth enabled
            </label>
            <div className="col-span-full text-xs text-slate-500">
              Note: OAuth credentials on runtime pods still require the corresponding environment
              variables. This setting drives the UI toggle and is authoritative for feature flags.
            </div>
          </div>
        )}

        {tab === "node_pricing" && (
          <div className="space-y-5" data-testid="settings-panel-pricing">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <TextInput
                testid="pricing-welcome-bonus"
                label="Welcome bonus (nodes)" type="number"
                value={current.welcome_bonus}
                onChange={(v) => set({ welcome_bonus: v })}
              />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Plans</div>
              <div className="space-y-2">
                {(current.plans || []).map((p, i) => (
                  <div key={p.id || i} className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <TextInput testid={`plan-${i}-label`} label="Label" value={p.label} onChange={(v) => {
                      const plans = [...current.plans]; plans[i] = { ...plans[i], label: v }; set({ plans });
                    }}/>
                    <TextInput testid={`plan-${i}-nodes`} label="Nodes" type="number" value={p.nodes} onChange={(v) => {
                      const plans = [...current.plans]; plans[i] = { ...plans[i], nodes: v }; set({ plans });
                    }}/>
                    <TextInput testid={`plan-${i}-price`} label="Price (INR)" type="number" value={p.price_inr} onChange={(v) => {
                      const plans = [...current.plans]; plans[i] = { ...plans[i], price_inr: v }; set({ plans });
                    }}/>
                    <label className="flex items-end pb-2 gap-2 text-sm text-slate-200">
                      <input
                        data-testid={`plan-${i}-highlight`} type="checkbox" checked={!!p.highlight}
                        onChange={(e) => {
                          const plans = [...current.plans]; plans[i] = { ...plans[i], highlight: e.target.checked }; set({ plans });
                        }}
                        className="w-4 h-4"
                      />
                      Highlighted
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Module costs (nodes per run)</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(current.module_costs || {}).map(([k, v]) => (
                  <TextInput
                    key={k}
                    testid={`module-cost-${k}`}
                    label={k}
                    type="number"
                    value={v}
                    onChange={(nv) => set({ module_costs: { ...current.module_costs, [k]: nv } })}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "feature_flags" && (
          <div data-testid="settings-panel-flags">
            {Object.entries(current || {}).map(([k, v]) => (
              <ToggleRow
                key={k}
                testid={`flag-${k}`}
                label={k.replace(/_/g, " ").replace(/^./, c => c.toUpperCase())}
                checked={!!v}
                onChange={(nv) => set({ [k]: nv })}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          {dirty[tab] ? "You have unsaved changes." : "All changes saved."}
        </div>
        <div className="flex gap-2">
          {dirty[tab] && (
            <button
              data-testid="settings-discard"
              onClick={() => setDirty({ ...dirty, [tab]: undefined })}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm"
            >
              Discard
            </button>
          )}
          <button
            data-testid="settings-save"
            onClick={save} disabled={saving || !dirty[tab]}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold disabled:opacity-60"
          >
            {saving ? <Loader2 className="animate-spin" size={14}/> : <Save size={14}/>}
            Save settings
          </button>
        </div>
      </div>
    </div>
  );
}
