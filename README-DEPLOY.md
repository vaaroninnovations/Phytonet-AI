# PhytoNet AI — Production Deployment (Hostinger VPS)

End-to-end guide to deploy PhytoNet AI on a Hostinger KVM VPS (or any Docker-capable Linux host).

---

## 1. VPS Sizing

The backend image bundles **AutoDock Vina**, **Open Babel**, **GROMACS** and the full ML stack (`torch`, `admet_ai`, `chemprop`, `rdkit`).

| Component     | Recommended        | Minimum          |
|---------------|--------------------|------------------|
| CPU           | 4 vCPU             | 2 vCPU           |
| RAM           | **≥ 8 GB**         | 6 GB (swap ok)   |
| Disk          | 40 GB SSD          | 25 GB SSD        |
| Bandwidth     | Unmetered          | 1 TB/mo          |
| OS            | Ubuntu 22.04 LTS   | Debian 12        |

Hostinger recommendation: **KVM 4** or **KVM 8** tier.

---

## 2. One-time server setup

SSH into the VPS as `root` (or a sudoer):

```bash
# 2.1 System update + firewall
apt update && apt upgrade -y
apt install -y ufw fail2ban curl git

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 2.2 Install Docker + Compose plugin (official convenience script)
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker compose version   # → Docker Compose version v2.x

# 2.3 (Optional) create a deploy user
adduser --disabled-password --gecos "" phytonet
usermod -aG docker phytonet
```

---

## 3. Clone & configure

```bash
su - phytonet
git clone https://github.com/<your-org>/phytonet-ai.git
cd phytonet-ai
```

### 3.1 Zero-touch first boot (dev-safe defaults)

The compose file ships with dev-only defaults for every mandatory value.
A fresh clone can be started immediately:

```bash
docker compose up -d --build
```

The app boots with `JWT_SECRET`, `SESSION_SECRET`, `ADMIN_PASSWORD` etc. set
to placeholder values — **safe for a first smoke test, NOT for a public
deployment**.

### 3.2 Configure for production

Before exposing to the internet, override the dev defaults:

```bash
cp .env.example .env
nano .env                # fill REQUIRED values (see §4)
docker compose up -d --force-recreate backend celery_worker celery_beat frontend
```

### 3.3 Generate strong secrets

```bash
{
  echo "JWT_SECRET=$(openssl rand -hex 48)"
  echo "SESSION_SECRET=$(openssl rand -hex 48)"
} >> .env
```

---

## 4. Required `.env` values

| Key                    | Notes                                                                 |
|------------------------|-----------------------------------------------------------------------|
| `ADMIN_EMAIL`          | First admin account — seeded on first boot                            |
| `ADMIN_PASSWORD`       | Strong password — you can rotate later                                |
| `JWT_SECRET`           | `openssl rand -hex 48`                                                |
| `SESSION_SECRET`       | `openssl rand -hex 48`                                                |
| `FRONTEND_URL`         | `https://phytonet.example.com`                                        |
| `REACT_APP_BACKEND_URL`| Leave blank for same-origin (nginx proxies `/api`) — recommended      |
| `CORS_ORIGINS`         | Match `FRONTEND_URL`                                                  |
| `GROQ_API_KEY`         | Optional — enables AI Assistant. Get from https://console.groq.com   |
| `GOOGLE_CLIENT_ID/…`   | Optional — enables "Continue with Google"                            |

---

## 5. Build & launch

```bash
cd ~/phytonet-ai
docker compose up -d --build
docker compose ps                # all services should be "healthy"
docker compose logs -f backend   # tail backend boot logs
```

First build takes 10-25 min (Vina/GROMACS + ML wheels). Subsequent rebuilds are layer-cached and finish in ~1 min.

### 5.1 Smoke test

```bash
curl -s http://localhost:8001/api/health          # → {"status":"ok"}
curl -sI http://localhost:3000/healthz            # → 200 OK
curl -sI http://localhost:3000/                   # → 200 OK, serves SPA
```

Open `http://<vps-ip>:3000` in a browser — you should see the PhytoNet AI landing page.

---

## 6. HTTPS with a real domain (recommended)

The compose stack listens on plain HTTP `:3000` and `:8001`. In production you almost always want TLS on `:443`. Pick one:

### 6.1 Option A — Caddy (simplest, auto-TLS via Let's Encrypt)

```bash
apt install -y caddy
```

Create `/etc/caddy/Caddyfile`:

```
phytonet.example.com {
    encode zstd gzip
    reverse_proxy localhost:3000
}
```

```bash
systemctl reload caddy
```

Point your domain's `A` record at the VPS IP. Caddy fetches a Let's Encrypt cert automatically on first request.

### 6.2 Option B — Nginx + Certbot

```bash
apt install -y nginx certbot python3-certbot-nginx
certbot --nginx -d phytonet.example.com
```

Certbot will edit `/etc/nginx/sites-available/default` and add the TLS block. Reverse-proxy to `localhost:3000`.

### 6.3 Update `.env` after enabling HTTPS

```
FRONTEND_URL=https://phytonet.example.com
CORS_ORIGINS=https://phytonet.example.com
GOOGLE_REDIRECT_URI=https://phytonet.example.com/auth/google/callback
```

```bash
docker compose up -d --force-recreate backend celery_worker celery_beat frontend
```

### 6.4 Update Google OAuth Console

Add `https://phytonet.example.com/auth/google/callback` to the **Authorized redirect URIs** in the Google Cloud Console.

---

## 7. Operations

### 7.1 Live tail logs

```bash
docker compose logs -f backend
docker compose logs -f celery_worker
docker compose logs -f frontend
```

### 7.2 Restart / rebuild after a code pull

```bash
git pull
docker compose up -d --build                     # rebuilds only what changed
```

### 7.3 Update `.env`

```bash
docker compose up -d --force-recreate backend celery_worker celery_beat
```

### 7.4 Backup MongoDB

```bash
docker compose exec -T mongodb mongodump --archive --gzip \
  > "$HOME/backups/phytonet-$(date +%F).archive.gz"
```

Restore:

```bash
gunzip -c phytonet-2026-01-01.archive.gz \
  | docker compose exec -T mongodb mongorestore --archive --drop
```

### 7.5 Prune unused Docker layers

```bash
docker system prune -af --volumes    # ⚠️ removes stopped containers + unused images
```

### 7.6 Zero-downtime rebuild of a single service

```bash
docker compose up -d --no-deps --build backend
```

---

## 8. Celery scaffolding

Redis + `celery_worker` + `celery_beat` are wired up but **no tasks are registered yet** (see `backend/celery_app.py`). To add a task:

1. Create `backend/tasks/md.py`:

    ```python
    from backend.celery_app import celery_app

    @celery_app.task(name="md.run_simulation")
    def run_simulation(job_id: str, config: dict) -> dict:
        ...
    ```

2. Register it in `backend/celery_app.py`:

    ```python
    include=["backend.tasks.md"]
    ```

3. Rebuild worker: `docker compose up -d --build celery_worker`.

4. Enqueue from an API route:

    ```python
    from backend.celery_app import celery_app
    celery_app.send_task("md.run_simulation", kwargs={"job_id": jid, "config": cfg})
    ```

Verify Celery is alive:

```bash
docker compose exec backend python -c \
  "from backend.celery_app import celery_app; print(celery_app.send_task('phytonet.ping').get(timeout=5))"
# → pong
```

---

## 9. Troubleshooting

| Symptom                                                        | Likely cause / fix                                                                 |
|----------------------------------------------------------------|-------------------------------------------------------------------------------------|
| `docker compose up` fails on `pytorch`/`chemprop` wheel        | VPS < 6 GB RAM. Add swap or upgrade tier.                                          |
| Frontend loads but API calls 404                               | Nginx service can't reach `backend`. Check `docker compose logs frontend`.         |
| `Google OAuth: redirect_uri_mismatch`                          | `GOOGLE_REDIRECT_URI` in `.env` ≠ URI in Google Console.                            |
| `backend` boot loop with `deps_check` warnings                 | Set `AUTO_INSTALL_MISSING_DEPS=off` (default) — Dockerfile already installs them.   |
| MongoDB "connection refused" in backend logs                   | Mongo not healthy yet. `docker compose ps` should show `healthy` for mongodb.       |
| Streaming docking (SSE) drops after 60 s                       | Some proxies terminate long streams. Nginx config already sets 1 h timeout.        |
| `celery_worker` restart loop                                   | Redis unreachable, or `backend` module not on `PYTHONPATH`. Check compose logs.     |

---

## 10. Security checklist before going live

- [ ] `AUTH_GATE_ENABLED=on` in `.env`
- [ ] `JWT_SECRET` and `SESSION_SECRET` regenerated (not from `.env.example`)
- [ ] `ADMIN_PASSWORD` is ≥ 20 chars, unique
- [ ] `CORS_ORIGINS` restricted to your domain (**not** `*`)
- [ ] TLS enabled via Caddy/Nginx (§6)
- [ ] `ufw` allows only 22, 80, 443
- [ ] Fail2ban active (`systemctl status fail2ban`)
- [ ] MongoDB is **not** exposed on host (compose maps 27017 only internally — verify with `ss -tlnp | grep 27017` returning nothing)
- [ ] Backups scheduled (§7.4) — e.g. via `cron`

---

## 11. Uninstall / reset

```bash
cd ~/phytonet-ai
docker compose down -v            # -v also deletes named volumes (mongo, redis, jobs)
docker system prune -af
```

---

## 12. Support

- Issues: <https://github.com/your-org/phytonet-ai/issues>
- Contact: your team email here
