# PhytoNet AI — Hostinger VPS Deployment Guide

This document walks you through deploying PhytoNet AI to a Hostinger VPS with
your own **direct Anthropic API key** (instead of the Emergent Universal Key).

The codebase already supports both providers via `backend/llm_provider.py` —
if `ANTHROPIC_API_KEY` is set, the app uses the direct Anthropic SDK. If not,
it falls back to `EMERGENT_LLM_KEY`. No code changes are needed for Hostinger.

---

## 1. Prerequisites

- A Hostinger VPS running **Ubuntu 22.04+** with root SSH access.
- An Anthropic API key from https://console.anthropic.com (`sk-ant-api03-...`).
  **Ensure your Anthropic billing account has credits** — new keys ship with
  $0 balance and will return HTTP 400 "credit balance too low" until you add
  credits at https://console.anthropic.com/settings/billing.
- (Optional) A domain pointed at the VPS IP for HTTPS.

---

## 2. Install system dependencies

```bash
apt update && apt upgrade -y
apt install -y python3.11 python3.11-venv python3-pip nodejs npm mongodb nginx \
               build-essential git curl supervisor
npm install -g yarn
```

Start MongoDB:

```bash
systemctl enable --now mongod
```

---

## 3. Clone your codebase

```bash
cd /opt
git clone <your-git-url> phytonetai
cd phytonetai
```

---

## 4. Backend setup

```bash
cd /opt/phytonetai/backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Create `/opt/phytonetai/backend/.env`

```ini
# Database
MONGO_URL=mongodb://localhost:27017
DB_NAME=phytonet_prod

# CORS
CORS_ORIGINS=https://yourdomain.com

# LLM — **direct Anthropic** (this is what makes the app Hostinger-portable)
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE
LLM_MODEL=claude-sonnet-4-5-20250929

# Auth secrets — REPLACE with fresh values (openssl rand -hex 32)
JWT_SECRET=REPLACE_ME
SESSION_SECRET=REPLACE_ME
SUPER_ADMIN_JWT_SECRET=REPLACE_ME

# Super admin seed
SUPER_ADMIN_EMAIL=you@yourdomain.com
SUPER_ADMIN_PASSWORD=CHOOSE_A_STRONG_PASSWORD
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=CHOOSE_A_STRONG_PASSWORD

# Frontend URL (used for OAuth redirects, share links)
FRONTEND_URL=https://yourdomain.com

# Optional integrations — only set if you use them
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/auth/google/callback
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
EMAIL_PROVIDER=resend
EMAIL_FROM="PhytoNet AI <hello@yourdomain.com>"
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USERNAME=resend
SMTP_PASSWORD=
SMTP_TLS=true
AUTH_GATE_ENABLED=on

# Docking / MD binaries (leave empty to auto-detect from PATH)
VINA_EXECUTABLE=
OBABEL_EXECUTABLE=
GROMACS_EXECUTABLE=
```

⚠️ **NEVER commit this file.** Add `backend/.env` to `.gitignore`.

### Install docking dependencies (optional, only if you use docking)

```bash
apt install -y openbabel autodock-vina
```

---

## 5. Frontend setup

```bash
cd /opt/phytonetai/frontend
yarn install
```

### Create `/opt/phytonetai/frontend/.env`

```ini
REACT_APP_BACKEND_URL=https://yourdomain.com
```

Build for production:

```bash
yarn build
```

The static site now lives at `/opt/phytonetai/frontend/build`.

---

## 6. Supervisor configuration

Create `/etc/supervisor/conf.d/phytonet.conf`:

```ini
[program:phytonet-backend]
directory=/opt/phytonetai/backend
command=/opt/phytonetai/backend/.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --workers 2
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/phytonet-backend.err.log
stdout_logfile=/var/log/supervisor/phytonet-backend.out.log
environment=PATH="/opt/phytonetai/backend/.venv/bin:%(ENV_PATH)s"
```

Reload:

```bash
supervisorctl reread
supervisorctl update
supervisorctl status phytonet-backend
```

---

## 7. Nginx reverse proxy

Create `/etc/nginx/sites-available/phytonet`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend (static build)
    root /opt/phytonetai/frontend/build;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Critical for SSE streaming (AI Research assistant streams tokens)
        proxy_buffering off;
        proxy_set_header X-Accel-Buffering no;
        proxy_read_timeout 300s;
        chunked_transfer_encoding on;
    }
}
```

Enable + reload:

```bash
ln -s /etc/nginx/sites-available/phytonet /etc/nginx/sites-enabled/phytonet
nginx -t && systemctl reload nginx
```

---

## 8. HTTPS with Let's Encrypt

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com
```

---

## 9. Verify

```bash
# Backend health
curl https://yourdomain.com/api/health

# Anthropic-direct chat test
curl -X POST https://yourdomain.com/api/research/plan \
     -H "Content-Type: application/json" \
     -d '{"prompt":"Search Withania somnifera compounds","project_id":"test"}'
```

If you see a valid JSON plan response, Claude Sonnet is live via your own key.

---

## 10. Provider swap logic (reference)

The file `backend/llm_provider.py` does the auto-switch:

```python
def _provider() -> str:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"      # direct SDK  — Hostinger / prod
    if os.environ.get("EMERGENT_LLM_KEY"):
        return "emergent"       # Universal Key — Emergent preview
    raise RuntimeError("No LLM key configured.")
```

Nothing else in the code touches provider selection — every LLM call routes
through `llm_provider.new_chat(...)`.

---

## 11. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `credit balance too low` (HTTP 400) | Add credits at https://console.anthropic.com/settings/billing |
| `AuthenticationError: invalid x-api-key` | Regenerate the key at Anthropic console; update `.env`; `supervisorctl restart phytonet-backend` |
| SSE streams arrive in one chunk (not word-by-word) | Confirm `proxy_buffering off` and `X-Accel-Buffering: no` in nginx |
| 502 from nginx | `supervisorctl status phytonet-backend`; check `/var/log/supervisor/phytonet-backend.err.log` |
| MongoDB connection refused | `systemctl status mongod`; ensure `MONGO_URL=mongodb://localhost:27017` |

---

## 12. Security checklist

- [ ] `.env` files chmod 600, owned by root
- [ ] Firewall closes port 8001 (only nginx should reach it)
- [ ] Anthropic key rotated if ever shared in chat/screenshots
- [ ] JWT/session secrets regenerated (never reuse dev defaults)
- [ ] MongoDB bound to localhost only (default) — never expose 27017 publicly
- [ ] Set up daily `mongodump` cron for backups

---

**That's it.** Your app is Hostinger-ready with a direct Claude Sonnet API key.
