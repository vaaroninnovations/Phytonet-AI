"""PhytoNet AI — Multi-provider SMTP email service.

Provider selectable via `EMAIL_PROVIDER` env var. Supports:
  gmail | sendgrid | mailgun | ses | resend | smtp (generic)

Env vars (see `/app/backend/.env`):
  EMAIL_PROVIDER   — one of the above (default: 'none' → dev-log only)
  EMAIL_FROM       — "PhytoNet AI <noreply@phytonet.ai>"
  SMTP_HOST        — override host (required for ses/smtp)
  SMTP_PORT        — default 587
  SMTP_USERNAME    — override username (sendgrid=apikey, resend=resend)
  SMTP_PASSWORD    — API key or password (required except dev-log)
  SMTP_TLS         — 'true' / 'false' (default true)

If no provider is configured (or SMTP_PASSWORD missing) the message is only
logged — used for local development.
"""
from __future__ import annotations
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional

logger = logging.getLogger(__name__)

# Provider defaults — host / port / tls / username hint
PROVIDERS: dict[str, dict] = {
    "gmail":    {"host": "smtp.gmail.com",     "port": 587, "tls": True},
    "sendgrid": {"host": "smtp.sendgrid.net",  "port": 587, "tls": True, "username": "apikey"},
    "mailgun":  {"host": "smtp.mailgun.org",   "port": 587, "tls": True},
    "ses":      {"host": None,                 "port": 587, "tls": True},
    "resend":   {"host": "smtp.resend.com",    "port": 587, "tls": True, "username": "resend"},
    "smtp":     {"host": None,                 "port": 587, "tls": True},
}


def get_provider() -> str:
    return (os.environ.get("EMAIL_PROVIDER", "") or "").strip().lower()


def is_configured() -> bool:
    p = get_provider()
    if not p or p not in PROVIDERS:
        return False
    if not os.environ.get("SMTP_PASSWORD"):
        return False
    return True


def _smtp_cfg() -> dict:
    p = get_provider()
    defaults = PROVIDERS.get(p, {})
    return {
        "host": os.environ.get("SMTP_HOST") or defaults.get("host"),
        "port": int(os.environ.get("SMTP_PORT") or defaults.get("port") or 587),
        "tls":  (os.environ.get("SMTP_TLS", "true").lower() == "true") if defaults.get("tls", True) else False,
        "username": os.environ.get("SMTP_USERNAME") or defaults.get("username"),
        "password": os.environ.get("SMTP_PASSWORD"),
        "from": os.environ.get("EMAIL_FROM") or "PhytoNet AI <noreply@phytonet.ai>",
    }


def send_email(to: str, subject: str, html: str, text: Optional[str] = None) -> dict:
    """Send an HTML email. Returns dict with `ok` and `provider`. Never raises —
    on failure logs the error and returns ok=False + reason."""
    if not is_configured():
        logger.warning(
            "\n[EMAIL:DEV] Provider not configured. Would send:\n"
            f"  To:      {to}\n"
            f"  Subject: {subject}\n"
            f"  Body:\n{html}\n"
        )
        return {"ok": True, "provider": "dev-log", "delivered": False}

    cfg = _smtp_cfg()
    if not cfg["host"]:
        logger.error("SMTP_HOST is not set for provider %s", get_provider())
        return {"ok": False, "reason": "smtp_host_missing"}

    msg = EmailMessage()
    msg["From"] = cfg["from"]
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text or "Open this email in an HTML-capable client.")
    msg.add_alternative(html, subtype="html")

    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=20) as s:
            if cfg["tls"]:
                s.starttls(context=ctx)
            if cfg["username"] and cfg["password"]:
                s.login(cfg["username"], cfg["password"])
            s.send_message(msg)
        logger.info("[EMAIL] Sent to %s via %s (subject: %s)", to, get_provider(), subject)
        return {"ok": True, "provider": get_provider(), "delivered": True}
    except Exception as e:
        logger.exception("[EMAIL] send failed via %s: %s", get_provider(), e)
        return {"ok": False, "reason": str(e), "provider": get_provider()}


# ─────────────────────────── Templates ────────────────────────────────
def verification_email_html(app_name: str, verify_link: str, first_name: str = "") -> str:
    greet = f"Hi {first_name}," if first_name else "Hello,"
    return f"""
<!DOCTYPE html>
<html><body style="font-family:'Inter',Helvetica,Arial,sans-serif;background:#FAFAFF;padding:32px 0;color:#0B0B18;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #E7E7F3;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:26px 28px;background:linear-gradient(135deg,#5139ED 0%,#395AED 55%,#8139ED 100%);color:#ffffff;">
      <h1 style="margin:0;font-size:20px;font-weight:800;letter-spacing:-0.01em;">{app_name}</h1>
      <p style="margin:6px 0 0;font-size:12px;opacity:0.9;">Your research AI assistant · Network Pharmacology</p>
    </td></tr>
    <tr><td style="padding:32px 28px;">
      <p style="font-size:15px;margin:0 0 12px;">{greet}</p>
      <p style="font-size:14px;line-height:1.55;color:#1E1E33;margin:0 0 20px;">
        Welcome to PhytoNet AI. Please confirm your email address to enable secure downloads,
        project saving, and manuscript exports.
      </p>
      <p style="text-align:center;margin:28px 0;">
        <a href="{verify_link}"
           style="display:inline-block;padding:12px 26px;background:#5139ED;color:#ffffff;
                  text-decoration:none;font-weight:700;font-size:14px;border-radius:999px;">
          Verify my email
        </a>
      </p>
      <p style="font-size:12px;color:#64748B;margin:16px 0 0;">
        This link will expire in <strong>24 hours</strong>. If you didn't create an account,
        you can safely ignore this message.
      </p>
      <p style="font-size:11px;color:#94A3B8;word-break:break-all;margin:22px 0 0;">
        Trouble clicking? Paste this into your browser:<br/>{verify_link}
      </p>
    </td></tr>
    <tr><td style="padding:16px 28px;border-top:1px solid #E7E7F3;background:#FAFAFF;">
      <p style="font-size:11px;color:#94A3B8;margin:0;">© PhytoNet AI · Computational Pharmacology Platform</p>
    </td></tr>
  </table>
</body></html>
""".strip()
