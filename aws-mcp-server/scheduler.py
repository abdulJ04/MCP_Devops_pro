"""Background scheduler for cost alert monitoring.

Runs independently of the dashboard — monitors cost every 1 hour
and sends email alerts when thresholds are exceeded.
Works even when user is logged out.
"""
import logging
from datetime import datetime, timezone
from apscheduler.schedulers.background import BackgroundScheduler
from models import get_config, add_cost_history, add_alert_log
from email_sender import dispatch_alert_notification

logger = logging.getLogger("cost-alerts")

scheduler = BackgroundScheduler()


def cost_check_job():
    """Background job: check AWS cost and send alerts if threshold exceeded.

    Runs every 1 hour via APScheduler.
    Works even when no user is logged in.
    """
    try:
        config = get_config()
        if not config.is_active:
            logger.info("Cost alerts disabled — skipping check")
            return

        # Get current cost
        today_cost, month_cost, source = _fetch_current_cost()

        if today_cost is None:
            logger.warning("Could not fetch cost data — skipping check")
            return

        # Store in history
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        add_cost_history(today_str, today_cost, source)

        # Check daily threshold
        if today_cost > config.daily_limit:
            over_by = round(today_cost - config.daily_limit, 2)
            logger.warning(f"DAILY ALERT: ${today_cost:.2f} > ${config.daily_limit:.2f} (over by ${over_by:.2f})")

            config_dict = _config_to_dict(config)
            success = dispatch_alert_notification(
                channel="email",
                alert_type="daily",
                current_cost=today_cost,
                threshold=config.daily_limit,
                config=config_dict,
            )

            add_alert_log(
                alert_type="daily",
                current_cost=today_cost,
                threshold=config.daily_limit,
                channel="email",
                message=f"Daily cost ${today_cost:.2f} exceeds limit ${config.daily_limit:.2f}",
            )

        # Check monthly threshold
        if month_cost > config.monthly_limit:
            over_by = round(month_cost - config.monthly_limit, 2)
            logger.warning(f"MONTHLY ALERT: ${month_cost:.2f} > ${config.monthly_limit:.2f} (over by ${over_by:.2f})")

            config_dict = _config_to_dict(config)
            success = dispatch_alert_notification(
                channel="email",
                alert_type="monthly",
                current_cost=month_cost,
                threshold=config.monthly_limit,
                config=config_dict,
            )

            add_alert_log(
                alert_type="monthly",
                current_cost=month_cost,
                threshold=config.monthly_limit,
                channel="email",
                message=f"Monthly cost ${month_cost:.2f} exceeds limit ${config.monthly_limit:.2f}",
            )

        if today_cost <= config.daily_limit and month_cost <= config.monthly_limit:
            logger.info(f"Cost OK: daily=${today_cost:.2f} (limit=${config.daily_limit:.2f}), monthly=${month_cost:.2f} (limit=${config.monthly_limit:.2f})")

    except Exception as e:
        logger.error(f"Cost check job failed: {e}")


def _fetch_current_cost():
    """Fetch current cost from cache or AWS/mock."""
    try:
        from server import _credentials, _cached, _set_cache

        use_localstack = _credentials.get("use_localstack", False)

        if use_localstack:
            import os, json
            cost_file = os.path.join(os.path.dirname(__file__), "sim_cost_data.json")
            if os.path.exists(cost_file):
                try:
                    with open(cost_file) as f:
                        d = json.load(f)
                    return d.get("today", 0), d.get("month", 0), "simulation"
                except Exception:
                    pass
            return 0, 0, "idle"

        # Try cache first
        cached = _cached("cost", 3600)  # 1-hour cache for background job
        if cached:
            return cached.get("today", 0), cached.get("month", 0), "cache"

        # Fetch from AWS
        from server import _get_client
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

        # Cache the result
        _set_cache("cost", {"today": round(today_cost, 2), "month": round(month_cost, 2)})

        return round(today_cost, 2), round(month_cost, 2), "real"

    except Exception as e:
        logger.error(f"Cost fetch failed: {e}")
        return None, None, "error"


def _config_to_dict(config):
    """Convert SQLAlchemy config object to dict for email_sender."""
    return {
        "smtp_host": config.smtp_host,
        "smtp_port": config.smtp_port,
        "smtp_user": config.smtp_user,
        "smtp_password": config.smtp_password,
        "email": config.email,
    }


def report_generation_job():
    """Background job: generate and send scheduled cost reports."""
    try:
        from models import get_report_config
        config = get_report_config()
        if not config.is_enabled:
            logger.info("Cost reports disabled -- skipping")
            return

        from cost_reports import generate_report_data, send_report_email
        from models import get_config as get_alert_config, add_report_history
        import json

        report_data = generate_report_data(config.report_type)

        alert_config = get_alert_config()
        email_config = {
            "smtp_host": alert_config.smtp_host,
            "smtp_port": alert_config.smtp_port,
            "smtp_user": alert_config.smtp_user,
            "smtp_password": alert_config.smtp_password,
            "recipients": config.recipients,
        }
        email_sent = send_report_email(report_data, email_config)

        add_report_history(
            report_type=report_data["report_type"],
            report_date=report_data["report_date"],
            period_start=report_data["period_start"],
            period_end=report_data["period_end"],
            total_cost=report_data["total_cost"],
            yesterday_cost=report_data["yesterday_cost"],
            month_cost=report_data.get("total_cost", 0),
            forecast=report_data["forecast"],
            top_services_json=json.dumps(report_data["top_services"]),
            region_breakdown_json=json.dumps(report_data["region_breakdown"]),
            anomaly_score=report_data["anomaly_score"],
            anomaly_details=report_data["anomaly_details"],
            email_sent=email_sent,
            email_recipients=config.recipients,
            source=report_data["source"],
        )

        logger.info(f"Scheduled {config.report_type} report generated: ${report_data['total_cost']:.2f}")

    except Exception as e:
        logger.error(f"Report generation job failed: {e}")


def reschedule_report_job():
    """Reschedule the report job based on current config."""
    try:
        from models import get_report_config
        config = get_report_config()

        try:
            scheduler.remove_job("cost_report")
        except Exception:
            pass

        if not config.is_enabled:
            logger.info("Report scheduling disabled -- no job added")
            return

        hour = config.schedule_hour
        minute = config.schedule_minute

        if config.report_type == "daily":
            scheduler.add_job(
                report_generation_job,
                "cron",
                hour=hour,
                minute=minute,
                id="cost_report",
                replace_existing=True,
                max_instances=1,
            )
        elif config.report_type == "weekly":
            scheduler.add_job(
                report_generation_job,
                "cron",
                day_of_week=config.schedule_day_of_week,
                hour=hour,
                minute=minute,
                id="cost_report",
                replace_existing=True,
                max_instances=1,
            )
        elif config.report_type == "monthly":
            scheduler.add_job(
                report_generation_job,
                "cron",
                day=config.schedule_day_of_month,
                hour=hour,
                minute=minute,
                id="cost_report",
                replace_existing=True,
                max_instances=1,
            )

        logger.info(f"Report job scheduled: {config.report_type} at {hour:02d}:{minute:02d}")

    except Exception as e:
        logger.error(f"Failed to reschedule report job: {e}")


def start_scheduler():
    """Start the background scheduler."""
    try:
        scheduler.add_job(
            cost_check_job,
            "interval",
            hours=1,
            id="cost_check",
            replace_existing=True,
            max_instances=1,
        )
        scheduler.start()
        try:
            reschedule_report_job()
        except Exception:
            pass
        logger.info("Cost alert + report scheduler started")
    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}")


def stop_scheduler():
    """Stop the background scheduler."""
    try:
        scheduler.shutdown(wait=False)
        logger.info("Cost alert scheduler stopped")
    except Exception as e:
        logger.error(f"Failed to stop scheduler: {e}")
