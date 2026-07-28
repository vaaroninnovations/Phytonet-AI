# PhytoNet AI — Hostinger Production Go-Live Runbook

Follow these steps **in order** on your Hostinger VPS. Assumes you've already
completed `README-DEPLOY.md §1–3` (Docker installed, repo cloned).

---

## 1. Pull the latest code

```bash
cd ~/phytonet-ai        # or wherever you cloned it
git pull
```

## 2. Add SUPER ADMIN env vars to your `.env`

The new **Super Admin console at `/admin/login`** needs three env vars.
Append these to `~/phytonet-ai/.env`:

```bash
# --- Generate a strong secret first ---
SUPER_ADMIN_JWT_SECRET=$(openssl rand -hex 32)

# --- Add these lines to .env ---
cat >> .env <<EOF
SUPER_ADMIN_EMAIL=superadmin@YOURDOMAIN.com
SUPER_ADMIN_PASSWORD=PickAStrongPassphrase_2026!
SUPER_ADMIN_JWT_SECRET=${SUPER_ADMIN_JWT_SECRET}
EOF
```

⚠️ Replace `YOURDOMAIN.com` and the password with your real values.

## 3. Rebuild + restart everything

```bash
docker compose up -d --build
```

This is the single most important step. It:
- Rebakes the **frontend nginx image** with your latest code + admin console.
- Rebuilds the **backend image** with the new admin routes + pyotp/qrcode.
- Restarts all containers cleanly with the new `.env`.

Expect 2–4 min if only the code changed; 15–25 min for a full first build.

## 4. Verify the super admin was seeded

```bash
docker compose logs backend --tail 200 | grep -i "super admin"
```

You should see:
```
INFO ... Seeded super admin: superadmin@YOURDOMAIN.com
```

If you see `SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set — super admin NOT seeded`, your `.env` didn't load. Fix it and re-run step 3.

## 5. Verify admin login via curl

```bash
curl -X POST https://YOURDOMAIN.com/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@YOURDOMAIN.com","password":"PickAStrongPassphrase_2026!"}'
```

Expected JSON: `{"admin":{...},"two_factor_required":false}`

## 6. Log in via browser

Open `https://YOURDOMAIN.com/admin/login` — you should see the dark admin console. Log in with the credentials from step 2.

## 7. Harden the account immediately

Once logged in:

1. **Profile → Change password** → use a fresh 16+ char password.
2. **Profile → Two-factor authentication** → enable TOTP (Google Authenticator / Authy) or Email OTP.
3. **Audit Log** → confirm your login shows `admin.login` with your IP.
4. **Settings** → configure Branding, SMTP (for real email delivery), OAuth, Node Pricing, Feature Flags.

---

## Troubleshooting

### "Changes I pushed aren't showing up"

Nginx serves a **pre-built static bundle**. You MUST run `docker compose up -d --build` after `git pull` — not just `restart`. If still stuck:

```bash
docker compose build --no-cache frontend
docker compose up -d frontend
# then in browser: Ctrl+Shift+R (hard refresh)
```

### "Invalid credentials" on admin login

Check the backend log for the seed message (step 4). If missing, the env vars didn't load:

```bash
docker compose exec backend env | grep SUPER_ADMIN
```

Every SUPER_ADMIN_* var should show your real value, NOT the placeholder from docker-compose.yml.

### "Admin cookie not sticking / redirect loop"

Verify HTTPS is working end-to-end and the site is served on ONE origin (nginx should proxy `/api/*` to backend on the same domain). If your frontend and backend are on **different subdomains** (e.g., `app.` + `api.`), you need `SameSite=None` cookies — ping me and I'll patch it.

### "Password reset link isn't sent"

SMTP isn't configured yet. In the admin console, go to **Settings → SMTP** and fill in your provider details. Until then, reset links are logged to `docker compose logs backend`.

---

## Regular update loop (every future code change)

```bash
cd ~/phytonet-ai && \
git pull && \
docker compose up -d --build && \
docker compose logs -f backend | head -30
```

That's it. Your Super Admin credentials persist in MongoDB, so subsequent
rebuilds do NOT reset your password — the env vars are only used to seed the
account on first boot and to keep it re-syncable if the DB is wiped.
