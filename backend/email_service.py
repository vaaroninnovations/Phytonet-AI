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


def welcome_email_html(app_name: str, first_name: str = "",
                       app_url: str = "") -> str:
    """Warm onboarding email sent immediately after signup (email + Google)."""
    greet = f"Welcome, {first_name}!" if first_name else "Welcome!"
    cta = app_url or "https://phytonet.ai"
    return f"""
<!DOCTYPE html>
<html><body style="font-family:'Inter',Helvetica,Arial,sans-serif;background:#FAFAFF;padding:32px 0;color:#0B0B18;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #E7E7F3;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:26px 28px;background:linear-gradient(135deg,#5139ED 0%,#395AED 55%,#2BB673 100%);color:#ffffff;">
      <h1 style="margin:0;font-size:22px;font-weight:800;letter-spacing:-0.01em;">{greet}</h1>
      <p style="margin:6px 0 0;font-size:12px;opacity:0.92;">Your PhytoNet AI account is ready.</p>
    </td></tr>
    <tr><td style="padding:30px 28px;">
      <p style="font-size:14px;line-height:1.6;color:#1E1E33;margin:0 0 16px;">
        Thanks for joining <strong>{app_name}</strong> — the explainable AI platform for
        computational network pharmacology. Your workspace is set up and you've
        been credited with <strong>10 welcome nodes</strong> to try every module,
        from the Plant Database to the AI Scientific Report generator.
      </p>
      <h2 style="font-size:14px;font-weight:800;color:#111827;margin:22px 0 10px;">Start here</h2>
      <ul style="font-size:13px;line-height:1.7;color:#374151;padding-left:18px;margin:0;">
        <li><strong>Plant Database</strong> — resolve compounds across IMPPAT, LOTUS, PubChem &amp; ChEBI</li>
        <li><strong>ADMET Prediction</strong> — physchem + drug-likeness in one click</li>
        <li><strong>Molecular Docking</strong> — validated Vina pipeline with 3D pose overlay</li>
        <li><strong>PhytoNet AI Agent</strong> — orchestrates the full workflow end-to-end</li>
      </ul>
      <p style="text-align:center;margin:28px 0 6px;">
        <a href="{cta}"
           style="display:inline-block;padding:12px 26px;background:#5139ED;color:#ffffff;
                  text-decoration:none;font-weight:700;font-size:14px;border-radius:999px;">
          Open the platform
        </a>
      </p>
      <p style="font-size:12px;color:#64748B;margin:22px 0 0;line-height:1.55;">
        Have a research collaboration in mind or need a walkthrough? Just reply
        to this email — a human on our team reads every message.
      </p>
    </td></tr>
    <tr><td style="padding:16px 28px;border-top:1px solid #E7E7F3;background:#FAFAFF;">
      <p style="font-size:11px;color:#94A3B8;margin:0;">© PhytoNet AI · Computational Pharmacology Platform</p>
    </td></tr>
  </table>
</body></html>
""".strip()


def admin_reply_email_html(app_name: str, first_name: str,
                           original_subject: str, reply_body: str,
                           original_message: str) -> str:
    """Email sent to a contact-form submitter when an admin replies from the
    dashboard. Includes the original inquiry as a quoted block."""
    greet = f"Hi {first_name}," if first_name else "Hello,"
    # Preserve line breaks from the plaintext reply body inside <p>
    body_html = "".join(
        f"<p style='font-size:14px;line-height:1.6;color:#1E1E33;margin:0 0 12px;'>{line}</p>"
        for line in (reply_body or "").split("\n") if line.strip()
    ) or f"<p style='font-size:14px;color:#1E1E33;'>{reply_body}</p>"
    quoted = (original_message or "").replace("\n", "<br/>")
    return f"""
<!DOCTYPE html>
<html><body style="font-family:'Inter',Helvetica,Arial,sans-serif;background:#FAFAFF;padding:32px 0;color:#0B0B18;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #E7E7F3;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:22px 28px;background:linear-gradient(135deg,#5139ED 0%,#395AED 60%,#8139ED 100%);color:#ffffff;">
      <h1 style="margin:0;font-size:18px;font-weight:800;letter-spacing:-0.01em;">{app_name} · Support Reply</h1>
      <p style="margin:6px 0 0;font-size:12px;opacity:0.92;">Re: {original_subject}</p>
    </td></tr>
    <tr><td style="padding:28px;">
      <p style="font-size:15px;margin:0 0 14px;">{greet}</p>
      {body_html}
      <hr style="border:none;border-top:1px solid #E7E7F3;margin:22px 0;" />
      <p style="font-size:12px;color:#64748B;margin:0 0 8px;">Your original message:</p>
      <blockquote style="margin:0;padding:12px 14px;border-left:3px solid #5139ED;background:#FAFAFF;font-size:13px;color:#374151;line-height:1.55;">
        {quoted}
      </blockquote>
      <p style="font-size:12px;color:#64748B;margin:22px 0 0;">
        You can reply directly to this email — it goes straight to our support inbox.
      </p>
    </td></tr>
    <tr><td style="padding:16px 28px;border-top:1px solid #E7E7F3;background:#FAFAFF;">
      <p style="font-size:11px;color:#94A3B8;margin:0;">© PhytoNet AI · Computational Pharmacology Platform</p>
    </td></tr>
  </table>
</body></html>
""".strip()
