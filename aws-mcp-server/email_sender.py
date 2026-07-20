"""Modular email notification dispatcher for cost alerts.

Currently supports: SMTP email (cPanel/webmail).
Easily extensible to: Slack webhook, Discord webhook, Teams webhook.
"""
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone
import logging

logger = logging.getLogger("cost-alerts")


def dispatch_alert_notification(
    channel: str,
    alert_type: str,
    current_cost: float,
    threshold: float,
    config: dict,
) -> bool:
    """Send alert notification via the specified channel.

    Args:
        channel: 'email', 'slack', 'discord' (extensible)
        alert_type: 'daily' or 'monthly'
        current_cost: Current AWS spend
        threshold: User-configured threshold
        config: Alert config dict with smtp_host, smtp_port, etc.

    Returns:
        True if sent successfully, False otherwise.
    """
    if channel == "email":
        return _send_email_alert(alert_type, current_cost, threshold, config)
    elif channel == "slack":
        return _send_slack_alert(alert_type, current_cost, threshold, config)
    elif channel == "discord":
        return _send_discord_alert(alert_type, current_cost, threshold, config)
    else:
        logger.warning(f"Unknown channel: {channel}")
        return False


def _send_email_alert(
    alert_type: str,
    current_cost: float,
    threshold: float,
    config: dict,
) -> bool:
    """Send cost alert via SMTP email (cPanel/webmail compatible)."""
    smtp_host = config.get("smtp_host", "")
    smtp_port = config.get("smtp_port", 465)
    smtp_user = config.get("smtp_user", "")
    smtp_password = config.get("smtp_password", "")
    recipient_email = config.get("email", "")

    if not all([smtp_host, smtp_user, smtp_password, recipient_email]):
        logger.warning("Email config incomplete — skipping email alert")
        return False

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    over_by = round(current_cost - threshold, 2)
    over_pct = round((over_by / threshold) * 100, 1) if threshold > 0 else 0
    alert_label = "Daily" if alert_type == "daily" else "Monthly"

    subject = f"⚠️ AWS Cost Alert — {alert_label} limit exceeded (${current_cost:.2f} > ${threshold:.2f})"

    html_body = f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #dc3545, #b02a37); color: white; padding: 25px; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">⚠️ AWS Cost Alert</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.9;">Your {alert_label.lower()} spend has exceeded the configured threshold</p>
        </div>
        <div style="background: #f8f9fa; padding: 25px; border: 1px solid #dee2e6; border-top: none;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 12px 0; border-bottom: 1px solid #dee2e6; font-weight: 600; color: #333;">Date</td>
                    <td style="padding: 12px 0; border-bottom: 1px solid #dee2e6; color: #555;">{now}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; border-bottom: 1px solid #dee2e6; font-weight: 600; color: #333;">Alert Type</td>
                    <td style="padding: 12px 0; border-bottom: 1px solid #dee2e6; color: #555;">{alert_label}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; border-bottom: 1px solid #dee2e6; font-weight: 600; color: #333;">Current Cost</td>
                    <td style="padding: 12px 0; border-bottom: 1px solid #dee2e6; color: #dc3545; font-weight: bold; font-size: 18px;">${current_cost:.2f}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; border-bottom: 1px solid #dee2e6; font-weight: 600; color: #333;">Threshold</td>
                    <td style="padding: 12px 0; border-bottom: 1px solid #dee2e6; color: #555;">${threshold:.2f}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; border-bottom: 1px solid #dee2e6; font-weight: 600; color: #333;">Over by</td>
                    <td style="padding: 12px 0; border-bottom: 1px solid #dee2e6; color: #dc3545; font-weight: bold;">${over_by:.2f} (+{over_pct}%)</td>
                </tr>
            </table>
            <div style="margin-top: 25px; text-align: center;">
                <a href="http://localhost:3000/aws-dashboard" style="display: inline-block; background: #0078D4; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">View Dashboard →</a>
            </div>
        </div>
        <div style="text-align: center; padding: 15px; color: #999; font-size: 12px;">
            MCP DevOps Pro — Cost Alert System
        </div>
    </div>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = recipient_email
    msg.attach(MIMEText(html_body, "html"))

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context) as server:
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, recipient_email, msg.as_string())
        logger.info(f"Email alert sent: {alert_label} ${current_cost:.2f} > ${threshold:.2f}")
        return True
    except Exception as e:
        logger.error(f"Email send failed: {e}")
        return False


def _send_slack_alert(
    alert_type: str,
    current_cost: float,
    threshold: float,
    config: dict,
) -> bool:
    """Send cost alert via Slack webhook (future implementation)."""
    webhook_url = config.get("slack_webhook", "")
    if not webhook_url:
        logger.warning("Slack webhook not configured")
        return False
    # TODO: Implement Slack webhook
    logger.info("Slack alert (not yet implemented)")
    return False


def _send_discord_alert(
    alert_type: str,
    current_cost: float,
    threshold: float,
    config: dict,
) -> bool:
    """Send cost alert via Discord webhook (future implementation)."""
    webhook_url = config.get("discord_webhook", "")
    if not webhook_url:
        logger.warning("Discord webhook not configured")
        return False
    # TODO: Implement Discord webhook
    logger.info("Discord alert (not yet implemented)")
    return False


def send_test_email(config: dict) -> bool:
    """Send a test email to verify SMTP configuration."""
    smtp_host = config.get("smtp_host", "")
    smtp_port = config.get("smtp_port", 465)
    smtp_user = config.get("smtp_user", "")
    smtp_password = config.get("smtp_password", "")
    recipient_email = config.get("email", "")

    if not all([smtp_host, smtp_user, smtp_password, recipient_email]):
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "✅ MCP DevOps Pro — Test Email"
    msg["From"] = smtp_user
    msg["To"] = recipient_email
    msg.attach(MIMEText(
        "<h2>✅ Email Configuration Working!</h2>"
        "<p>This is a test email from MCP DevOps Pro Cost Alert System.</p>"
        "<p>You will receive alerts here when your AWS costs exceed the configured threshold.</p>",
        "html",
    ))

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context) as server:
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, recipient_email, msg.as_string())
        logger.info("Test email sent successfully")
        return True
    except Exception as e:
        logger.error(f"Test email failed: {e}")
        return False
