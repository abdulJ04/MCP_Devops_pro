"""Cost alert configuration and status endpoints."""
import logging
from fastapi import APIRouter, HTTPException
from models import get_config, update_config, get_recent_alerts, add_alert_log
from email_sender import dispatch_alert_notification, send_test_email

logger = logging.getLogger("cost-alerts")
router = APIRouter()


@router.get("/cost/alert/config")
async def get_alert_config():
    """Get current alert configuration."""
    config = get_config()
    return {
        "daily_limit": config.daily_limit,
        "monthly_limit": config.monthly_limit,
        "email": config.email,
        "smtp_host": config.smtp_host,
        "smtp_port": config.smtp_port,
        "smtp_user": config.smtp_user,
        "smtp_password": "***" if config.smtp_password else "",
        "is_active": config.is_active,
        "updated_at": config.updated_at.isoformat() if config.updated_at else None,
    }


@router.post("/cost/alert/config")
async def save_alert_config(request: dict = {}):
    """Save alert configuration (thresholds + email settings)."""
    update_fields = {}

    if "daily_limit" in request:
        update_fields["daily_limit"] = float(request["daily_limit"])
    if "monthly_limit" in request:
        update_fields["monthly_limit"] = float(request["monthly_limit"])
    if "email" in request:
        update_fields["email"] = request["email"]
    if "smtp_host" in request:
        update_fields["smtp_host"] = request["smtp_host"]
    if "smtp_port" in request:
        update_fields["smtp_port"] = int(request["smtp_port"])
    if "smtp_user" in request:
        update_fields["smtp_user"] = request["smtp_user"]
    if "smtp_password" in request:
        update_fields["smtp_password"] = request["smtp_password"]
    if "is_active" in request:
        update_fields["is_active"] = bool(request["is_active"])

    if update_fields:
        config = update_config(**update_fields)

        # Trigger immediate alert check after config change
        try:
            from scheduler import cost_check_job
            cost_check_job()
        except Exception as e:
            logger.warning(f"Immediate cost check after config save failed: {e}")

        return {
            "success": True,
            "message": "Alert configuration saved",
            "daily_limit": config.daily_limit,
            "monthly_limit": config.monthly_limit,
            "email": config.email,
            "is_active": config.is_active,
        }

    raise HTTPException(status_code=400, detail="No fields to update")


@router.get("/cost/alert/status")
async def get_alert_status():
    """Check if current cost exceeds configured thresholds."""
    config = get_config()

    if not config.is_active:
        return {
            "active": False,
            "daily_alert": False,
            "monthly_alert": False,
            "message": "Alerts are disabled",
        }

    # Get current cost from cache or fetch fresh
    from server import _cached, _get_client, _credentials
    import asyncio
    from datetime import datetime, timezone, timedelta

    use_localstack = _credentials.get("use_localstack", False)

    if use_localstack:
        from mock_cost import get_mock_cost_data
        cost_data = get_mock_cost_data()
    else:
        cached = _cached("cost", 30)
        if cached:
            cost_data = cached
        else:
            try:
                ce = _get_client("ce")
                now = datetime.now(timezone.utc)
                today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
                r = ce.get_cost_and_usage(
                    TimePeriod={"Start": today_start.strftime("%Y-%m-%d"), "End": now.strftime("%Y-%m-%d")},
                    Granularity="DAILY",
                    Metrics=["UnblendedCost"],
                )
                vals = r.get("ResultsByTime", [])
                today_cost = float(vals[0]["Total"]["UnblendedCost"]["Amount"]) if vals else 0

                month_start = today_start.replace(day=1)
                r_month = ce.get_cost_and_usage(
                    TimePeriod={"Start": month_start.strftime("%Y-%m-%d"), "End": now.strftime("%Y-%m-%d")},
                    Granularity="MONTHLY",
                    Metrics=["UnblendedCost"],
                )
                month_vals = r_month.get("ResultsByTime", [])
                month_cost = float(month_vals[0]["Total"]["UnblendedCost"]["Amount"]) if month_vals else 0

                cost_data = {"today": round(today_cost, 2), "month": round(month_cost, 2)}
            except Exception as e:
                logger.error(f"Failed to fetch cost: {e}")
                return {"active": True, "daily_alert": False, "monthly_alert": False, "error": str(e)}

    today_cost = cost_data.get("today", 0)
    month_cost = cost_data.get("month", 0)

    daily_alert = today_cost > config.daily_limit
    monthly_alert = month_cost > config.monthly_limit

    result = {
        "active": True,
        "daily_alert": daily_alert,
        "monthly_alert": monthly_alert,
        "today_cost": today_cost,
        "month_cost": month_cost,
        "daily_limit": config.daily_limit,
        "monthly_limit": config.monthly_limit,
        "daily_over_by": round(today_cost - config.daily_limit, 2) if daily_alert else 0,
        "monthly_over_by": round(month_cost - config.monthly_limit, 2) if monthly_alert else 0,
    }

    return result


@router.post("/cost/alert/test")
async def test_alert_email(request: dict = {}):
    """Send a test email to verify SMTP configuration."""
    config = get_config()
    config_dict = {
        "smtp_host": config.smtp_host,
        "smtp_port": config.smtp_port,
        "smtp_user": config.smtp_user,
        "smtp_password": config.smtp_password,
        "email": config.email,
    }
    success = send_test_email(config_dict)
    if success:
        return {"success": True, "message": "Test email sent successfully"}
    raise HTTPException(status_code=500, detail="Failed to send test email. Check SMTP settings.")


@router.get("/cost/alert/logs")
async def get_alert_logs():
    """Get recent alert log entries."""
    logs = get_recent_alerts(limit=20)
    return {"logs": logs}
