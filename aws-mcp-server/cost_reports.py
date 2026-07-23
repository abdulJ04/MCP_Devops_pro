"""Cost report generation, scheduling, and email delivery."""
import logging
import json
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import APIRouter, HTTPException

IST = ZoneInfo("Asia/Kolkata")
from models import (
    get_report_config, update_report_config,
    get_report_history, add_report_history,
    get_config,
)

logger = logging.getLogger("cost-reports")
router = APIRouter()


def generate_report_data(report_type: str = "daily") -> dict:
    """Generate comprehensive cost report data.

    Args:
        report_type: 'daily', 'weekly', or 'monthly'

    Returns:
        dict with: date, total_cost, today_cost, yesterday_cost, forecast,
                    top_services[], region_breakdown[], anomaly_score, anomaly_details
    """
    from server import _credentials
    use_localstack = _credentials.get("use_localstack", False)

    if use_localstack:
        import os, json
        cost_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "aws-mcp-server", "sim_cost_data.json")
        if os.path.exists(cost_file):
            try:
                with open(cost_file) as f:
                    cost_data = json.load(f)
            except Exception:
                cost_data = {"today": 0, "month": 0, "daily": [], "byService": [], "byRegion": []}
        else:
            cost_data = {"today": 0, "month": 0, "daily": [], "byService": [], "byRegion": []}
    else:
        cost_data = _fetch_real_cost_data()

    now = datetime.now(timezone.utc)
    period_start, period_end = _get_period_range(report_type, now)

    total_month_cost = cost_data.get("month", 0)

    top_services = []
    for svc in cost_data.get("byService", []):
        pct = round((svc["cost"] / total_month_cost * 100), 1) if total_month_cost > 0 else 0
        top_services.append({
            "service": svc["service"],
            "cost": svc["cost"],
            "percentage": pct,
        })
    top_services.sort(key=lambda x: x["cost"], reverse=True)

    region_breakdown = []
    for region in cost_data.get("byRegion", []):
        pct = round((region["value"] / total_month_cost * 100), 1) if total_month_cost > 0 else 0
        region_breakdown.append({
            "name": region["name"],
            "cost": region["value"],
            "percentage": pct,
        })

    anomaly_score, anomaly_details = _detect_anomalies(
        cost_data.get("daily", []),
        cost_data.get("today", 0),
    )

    return {
        "report_type": report_type,
        "report_date": now.strftime("%Y-%m-%d"),
        "period_start": period_start,
        "period_end": period_end,
        "total_cost": total_month_cost,
        "today_cost": cost_data.get("today", 0),
        "yesterday_cost": cost_data.get("yesterday", 0),
        "forecast": cost_data.get("forecast", 0),
        "top_services": top_services,
        "region_breakdown": region_breakdown,
        "daily": cost_data.get("daily", []),
        "daily_last_month": cost_data.get("daily_last_month", []),
        "anomaly_score": anomaly_score,
        "anomaly_details": anomaly_details,
        "source": cost_data.get("source", "real"),
    }


def _fetch_real_cost_data() -> dict:
    """Fetch real cost data from AWS Cost Explorer."""
    try:
        from server import _get_client, _cached
        cached = _cached("cost", 300)
        if cached:
            return cached

        ce = _get_client("ce")
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        month_start = today_start.replace(day=1)

        # Today's cost
        r = ce.get_cost_and_usage(
            TimePeriod={"Start": today_start.strftime("%Y-%m-%d"), "End": now.strftime("%Y-%m-%d")},
            Granularity="DAILY",
            Metrics=["UnblendedCost"],
        )
        vals = r.get("ResultsByTime", [])
        today_cost = float(vals[0]["Total"]["UnblendedCost"]["Amount"]) if vals else 0

        # Current month total
        r_month = ce.get_cost_and_usage(
            TimePeriod={"Start": month_start.strftime("%Y-%m-%d"), "End": now.strftime("%Y-%m-%d")},
            Granularity="MONTHLY",
            Metrics=["UnblendedCost"],
        )
        month_vals = r_month.get("ResultsByTime", [])
        month_cost = float(month_vals[0]["Total"]["UnblendedCost"]["Amount"]) if month_vals else 0

        # Service breakdown
        r_svc = ce.get_cost_and_usage(
            TimePeriod={"Start": month_start.strftime("%Y-%m-%d"), "End": now.strftime("%Y-%m-%d")},
            Granularity="MONTHLY",
            Metrics=["UnblendedCost"],
            GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
        )
        by_service = []
        for result in r_svc.get("ResultsByTime", []):
            for group in result.get("Groups", []):
                svc_name = group["Keys"][0] if group["Keys"] else "Unknown"
                cost = round(float(group["Total"]["UnblendedCost"]["Amount"]), 2)
                if cost > 0:
                    by_service.append({"service": svc_name, "cost": cost})

        # Current month daily costs
        daily = []
        r_daily = ce.get_cost_and_usage(
            TimePeriod={"Start": month_start.strftime("%Y-%m-%d"), "End": now.strftime("%Y-%m-%d")},
            Granularity="DAILY",
            Metrics=["UnblendedCost"],
        )
        for result in r_daily.get("ResultsByTime", []):
            date = result["TimePeriod"]["Start"]
            cost = round(float(result["Total"]["UnblendedCost"]["Amount"]), 2)
            daily.append({"date": date, "cost": cost})

        # Last month daily costs
        last_month_start = (month_start - timedelta(days=1)).replace(day=1)
        daily_last_month = []
        r_daily_last = ce.get_cost_and_usage(
            TimePeriod={"Start": last_month_start.strftime("%Y-%m-%d"), "End": month_start.strftime("%Y-%m-%d")},
            Granularity="DAILY",
            Metrics=["UnblendedCost"],
        )
        for result in r_daily_last.get("ResultsByTime", []):
            date = result["TimePeriod"]["Start"]
            cost = round(float(result["Total"]["UnblendedCost"]["Amount"]), 2)
            daily_last_month.append({"date": date, "cost": cost})

        # Yesterday cost from daily data
        yesterday_cost = daily[-2]["cost"] if len(daily) >= 2 else round(today_cost * 0.9, 2)

        return {
            "today": round(today_cost, 2),
            "yesterday": round(yesterday_cost, 2),
            "month": round(month_cost, 2),
            "forecast": round(month_cost * 1.1, 2),
            "daily": daily,
            "daily_last_month": daily_last_month,
            "byService": by_service,
            "byRegion": [],
            "source": "real",
        }
    except Exception as e:
        logger.error(f"Real cost fetch failed: {e}")
        return {"today": 0, "yesterday": 0, "month": 0, "forecast": 0, "daily": [], "daily_last_month": [], "byService": [], "byRegion": [], "source": "error"}


def _get_period_range(report_type: str, now: datetime) -> tuple:
    """Calculate period start/end dates."""
    today = now.date()
    if report_type == "daily":
        return (today - timedelta(days=1)).isoformat(), today.isoformat()
    elif report_type == "weekly":
        week_start = today - timedelta(days=today.weekday())
        return week_start.isoformat(), today.isoformat()
    elif report_type == "monthly":
        month_start = today.replace(day=1)
        return month_start.isoformat(), today.isoformat()
    return (today - timedelta(days=1)).isoformat(), today.isoformat()


def _detect_anomalies(daily_data: list, today_cost: float) -> tuple:
    """Simple anomaly detection using Z-score."""
    if len(daily_data) < 7:
        return 0, "Insufficient data for anomaly detection (need 7+ days)"

    costs = [d["cost"] for d in daily_data]
    mean = sum(costs) / len(costs)
    variance = sum((c - mean) ** 2 for c in costs) / len(costs)
    std_dev = variance ** 0.5

    if std_dev == 0:
        return 0, "No cost variance detected"

    z_score = abs(today_cost - mean) / std_dev
    anomaly_score = min(100, round(z_score * 25))

    details_parts = []
    if z_score > 2:
        details_parts.append(f"Today's cost (${today_cost:.2f}) is {z_score:.1f} standard deviations above the mean (${mean:.2f})")
    if today_cost > mean * 1.3:
        details_parts.append(f"Cost is {round((today_cost / mean - 1) * 100, 1)}% above the 30-day average")
    if len(costs) >= 7 and max(costs[-7:]) > mean * 1.5:
        details_parts.append("Spike detected in the last 7 days")

    details = "; ".join(details_parts) if details_parts else "No anomalies detected"
    return anomaly_score, details


def build_report_email_html(report_data: dict) -> str:
    """Build HTML email for cost reports."""
    date = report_data.get("report_date", "")
    report_type = report_data.get("report_type", "daily").capitalize()
    total_cost = report_data.get("total_cost", 0)
    today_cost = report_data.get("today_cost", 0)
    yesterday_cost = report_data.get("yesterday_cost", 0)
    forecast = report_data.get("forecast", 0)
    anomaly_score = report_data.get("anomaly_score", 0)

    if yesterday_cost > 0:
        change = round(((today_cost - yesterday_cost) / yesterday_cost) * 100, 1)
        change_text = f"+{change}%" if change >= 0 else f"{change}%"
        change_color = "#ef4444" if change >= 0 else "#10b981"
        change_arrow = "▲" if change >= 0 else "▼"
    else:
        change_text = "N/A"
        change_color = "#6b7280"
        change_arrow = ""

    if anomaly_score >= 70:
        anomaly_badge = f'<span style="background:#ef4444;color:white;padding:3px 10px;border-radius:12px;font-size:12px;">ANOMALY ({anomaly_score}/100)</span>'
    elif anomaly_score >= 40:
        anomaly_badge = f'<span style="background:#f59e0b;color:white;padding:3px 10px;border-radius:12px;font-size:12px;">Unusual ({anomaly_score}/100)</span>'
    else:
        anomaly_badge = f'<span style="background:#10b981;color:white;padding:3px 10px;border-radius:12px;font-size:12px;">Normal ({anomaly_score}/100)</span>'

    service_rows = ""
    for i, svc in enumerate(report_data.get("top_services", [])[:10]):
        bg = "#f8f9fa" if i % 2 == 0 else "#ffffff"
        service_rows += f"""
        <tr style="background:{bg}">
            <td style="padding:10px 15px;border-bottom:1px solid #e9ecef;font-weight:500;color:#333;">{svc['service']}</td>
            <td style="padding:10px 15px;border-bottom:1px solid #e9ecef;text-align:right;color:#333;">${svc['cost']:.2f}</td>
            <td style="padding:10px 15px;border-bottom:1px solid #e9ecef;text-align:right;color:#6b7280;">{svc['percentage']}%</td>
        </tr>"""

    region_rows = ""
    for i, region in enumerate(report_data.get("region_breakdown", [])):
        bg = "#f8f9fa" if i % 2 == 0 else "#ffffff"
        region_rows += f"""
        <tr style="background:{bg}">
            <td style="padding:10px 15px;border-bottom:1px solid #e9ecef;font-weight:500;color:#333;">{region['name']}</td>
            <td style="padding:10px 15px;border-bottom:1px solid #e9ecef;text-align:right;color:#333;">${region['cost']:.2f}</td>
            <td style="padding:10px 15px;border-bottom:1px solid #e9ecef;text-align:right;color:#6b7280;">{region['percentage']}%</td>
        </tr>"""

    html = f"""
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);color:white;padding:30px;border-radius:10px 10px 0 0;">
            <h1 style="margin:0;font-size:26px;">AWS {report_type} Cost Report</h1>
            <p style="margin:8px 0 0;opacity:0.9;font-size:14px;">Generated on {date} | Period: {report_data.get('period_start','')} to {report_data.get('period_end','')}</p>
        </div>
        <div style="background:#f8f9fa;padding:25px;border:1px solid #dee2e6;border-top:none;">
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                <tr>
                    <td style="padding:15px;border-bottom:1px solid #dee2e6;font-weight:600;color:#333;width:50%;">Month-to-Date Total</td>
                    <td style="padding:15px;border-bottom:1px solid #dee2e6;font-weight:bold;font-size:22px;color:#1e40af;text-align:right;">${total_cost:.2f}</td>
                </tr>
                <tr>
                    <td style="padding:15px;border-bottom:1px solid #dee2e6;font-weight:600;color:#333;">Today's Cost</td>
                    <td style="padding:15px;border-bottom:1px solid #dee2e6;font-weight:bold;font-size:18px;color:#333;text-align:right;">${today_cost:.2f}</td>
                </tr>
                <tr>
                    <td style="padding:15px;border-bottom:1px solid #dee2e6;font-weight:600;color:#333;">Yesterday Comparison</td>
                    <td style="padding:15px;border-bottom:1px solid #dee2e6;font-weight:bold;font-size:16px;color:{change_color};text-align:right;">{change_arrow} {change_text} (${yesterday_cost:.2f})</td>
                </tr>
                <tr>
                    <td style="padding:15px;border-bottom:1px solid #dee2e6;font-weight:600;color:#333;">Month Forecast</td>
                    <td style="padding:15px;border-bottom:1px solid #dee2e6;font-weight:bold;font-size:16px;color:#f59e0b;text-align:right;">${forecast:.2f}</td>
                </tr>
                <tr>
                    <td style="padding:15px;font-weight:600;color:#333;">Anomaly Detection</td>
                    <td style="padding:15px;text-align:right;">{anomaly_badge}</td>
                </tr>
            </table>
        </div>
        <div style="background:white;padding:25px;border:1px solid #dee2e6;border-top:none;">
            <h2 style="margin:0 0 15px;color:#1e40af;font-size:18px;">Top Cost Services</h2>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:#e9ecef;">
                        <th style="padding:10px 15px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Service</th>
                        <th style="padding:10px 15px;text-align:right;font-size:12px;text-transform:uppercase;color:#6b7280;">Cost</th>
                        <th style="padding:10px 15px;text-align:right;font-size:12px;text-transform:uppercase;color:#6b7280;">Share</th>
                    </tr>
                </thead>
                <tbody>{service_rows}</tbody>
            </table>
        </div>
        <div style="background:white;padding:25px;border:1px solid #dee2e6;border-top:none;">
            <h2 style="margin:0 0 15px;color:#1e40af;font-size:18px;">Cost by Region</h2>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:#e9ecef;">
                        <th style="padding:10px 15px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Region</th>
                        <th style="padding:10px 15px;text-align:right;font-size:12px;text-transform:uppercase;color:#6b7280;">Cost</th>
                        <th style="padding:10px 15px;text-align:right;font-size:12px;text-transform:uppercase;color:#6b7280;">Share</th>
                    </tr>
                </thead>
                <tbody>{region_rows}</tbody>
            </table>
        </div>
        <div style="background:#f8f9fa;padding:20px;border:1px solid #dee2e6;border-top:none;border-radius:0 0 10px 10px;text-align:center;">
            <a href="http://localhost:3000/aws-dashboard" style="display:inline-block;background:#1e40af;color:white;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:600;">View Full Dashboard</a>
            <p style="margin:15px 0 0;color:#999;font-size:12px;">MCP DevOps Pro -- Cost Report System</p>
        </div>
    </div>
    """
    return html


def send_report_email(report_data: dict, email_config: dict) -> bool:
    """Send cost report email to all configured recipients."""
    recipients = [r.strip() for r in email_config.get("recipients", "").split(",") if r.strip()]
    if not recipients:
        logger.warning("No report recipients configured")
        return False

    smtp_host = email_config.get("smtp_host", "")
    smtp_port = email_config.get("smtp_port", 465)
    smtp_user = email_config.get("smtp_user", "")
    smtp_password = email_config.get("smtp_password", "")

    if not all([smtp_host, smtp_user, smtp_password]):
        logger.warning("SMTP config incomplete -- skipping report email")
        return False

    report_type = report_data.get("report_type", "daily").capitalize()
    date = report_data.get("report_date", "")
    subject = f"AWS {report_type} Cost Report -- {date}"
    html_body = build_report_email_html(report_data)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg.attach(MIMEText(html_body, "html"))

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context) as server:
            server.login(smtp_user, smtp_password)
            for recipient in recipients:
                msg["To"] = recipient
                server.sendmail(smtp_user, recipient, msg.as_string())
        logger.info(f"Report email sent to {len(recipients)} recipients: {report_type} {date}")
        return True
    except Exception as e:
        logger.error(f"Report email send failed: {e}")
        return False


# ---- API ENDPOINTS ----

@router.get("/cost/report/config")
async def get_report_config_endpoint():
    """Get report configuration."""
    config = get_report_config()
    alert_config = get_config()
    return {
        "is_enabled": config.is_enabled,
        "report_type": config.report_type,
        "schedule_hour": config.schedule_hour,
        "schedule_minute": config.schedule_minute,
        "schedule_day_of_week": config.schedule_day_of_week,
        "schedule_day_of_month": config.schedule_day_of_month,
        "recipients": config.recipients,
        "include_anomaly_detection": config.include_anomaly_detection,
        "include_service_breakdown": config.include_service_breakdown,
        "include_region_breakdown": config.include_region_breakdown,
        "include_yesterday_comparison": config.include_yesterday_comparison,
        "google_sheets_enabled": config.google_sheets_enabled,
        "google_sheets_id": config.google_sheets_id,
        "google_sheets_tab": config.google_sheets_tab,
        "apps_script_url": config.apps_script_url,
        "smtp_host": alert_config.smtp_host,
        "smtp_user": alert_config.smtp_user,
        "updated_at": config.updated_at.isoformat() if config.updated_at else None,
    }


@router.post("/cost/report/config")
async def save_report_config(request: dict = None):
    request = request or {}
    """Save report configuration."""
    update_fields = {}
    for field in [
        "is_enabled", "report_type", "schedule_hour", "schedule_minute",
        "schedule_day_of_week", "schedule_day_of_month", "recipients",
        "include_anomaly_detection", "include_service_breakdown",
        "include_region_breakdown", "include_yesterday_comparison",
        "google_sheets_enabled", "google_sheets_id", "google_sheets_tab",
        "apps_script_url",
    ]:
        if field in request:
            update_fields[field] = request[field]

    if update_fields:
        config = update_report_config(**update_fields)
        try:
            from scheduler import reschedule_report_job
            reschedule_report_job()
        except Exception as e:
            logger.warning(f"Reschedule report job failed: {e}")
        return {"success": True, "message": "Report configuration saved"}

    raise HTTPException(status_code=400, detail="No fields to update")


@router.post("/cost/report/generate")
async def generate_report(request: dict = None):
    request = request or {}
    """Generate a cost report on demand."""
    report_type = request.get("report_type", "daily")
    report_data = generate_report_data(report_type)

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
        source=report_data["source"],
    )

    # Auto-push to Google Sheets if enabled
    gs_uploaded = False
    report_config = get_report_config()
    if report_config.google_sheets_enabled and report_config.apps_script_url:
        try:
            from google_sheets import push_daily_cost_tracker

            daily = report_data.get("daily", [])
            daily_last = report_data.get("daily_last_month", [])
            last_month_by_day = {}
            for entry in daily_last:
                try:
                    day = int(entry["date"].split("-")[2])
                    last_month_by_day[day] = entry["cost"]
                except (IndexError, ValueError):
                    pass

            cum_cur = 0.0
            cum_last = 0.0
            tracker_rows = []
            for entry in daily:
                parts = entry["date"].split("-")
                display_date = f"{int(parts[1])}/{int(parts[2])}/{parts[0]}"
                cum_cur += entry["cost"]
                day_num = int(parts[2])
                cum_last += last_month_by_day.get(day_num, 0)
                tracker_rows.append([display_date, round(entry["cost"], 2), round(cum_cur, 2), round(cum_last, 2)])

            push_daily_cost_tracker(report_config.apps_script_url, tracker_rows)
            gs_uploaded = True
        except Exception as e:
            logger.warning(f"Google Sheets push failed: {e}")

    report_data["google_sheets_uploaded"] = gs_uploaded
    return report_data


@router.post("/cost/report/send-email")
async def send_report_email_endpoint(request: dict = None):
    request = request or {}
    """Generate report and send via email."""
    report_type = request.get("report_type", "daily")
    report_data = generate_report_data(report_type)

    alert_config = get_config()
    report_config = get_report_config()
    email_config = {
        "smtp_host": alert_config.smtp_host,
        "smtp_port": alert_config.smtp_port,
        "smtp_user": alert_config.smtp_user,
        "smtp_password": alert_config.smtp_password,
        "recipients": report_config.recipients,
    }

    success = send_report_email(report_data, email_config)

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
        email_sent=success,
        email_recipients=report_config.recipients,
        source=report_data["source"],
    )

    if success:
        return {"success": True, "message": "Report email sent successfully", "report": report_data}
    raise HTTPException(status_code=500, detail="Failed to send report email")


@router.get("/cost/report/history")
async def get_report_history_endpoint(report_type: str = None, limit: int = 50):
    """Get report generation history."""
    logs = get_report_history(limit=limit, report_type=report_type)
    return {"reports": logs, "total": len(logs)}


@router.post("/cost/report/preview")
async def preview_report(request: dict = None):
    request = request or {}
    """Generate report and return HTML preview."""
    report_type = request.get("report_type", "daily")
    report_data = generate_report_data(report_type)
    html = build_report_email_html(report_data)
    return {"report": report_data, "html_preview": html}


@router.post("/cost/report/google-sheets/test")
async def test_google_sheets(request: dict = None):
    request = request or {}
    """Test Apps Script connection."""
    apps_script_url = request.get("apps_script_url", "")
    if not apps_script_url:
        raise HTTPException(status_code=400, detail="apps_script_url is required")

    from google_sheets import test_connection
    result = test_connection(apps_script_url)
    if result.get("success"):
        return result
    raise HTTPException(status_code=400, detail=f"Connection failed: {result.get('error', 'Unknown error')}")


@router.post("/cost/report/google-sheets/push")
async def push_to_google_sheets(request: dict = None):
    request = request or {}
    """Push report data to Google Sheet via Apps Script URL.

    Optional params:
        from_date: "YYYY-MM-DD" — start date filter
        to_date: "YYYY-MM-DD" — end date filter (inclusive)
    """
    apps_script_url = request.get("apps_script_url", "")
    report_type = request.get("report_type", "daily")
    from_date = request.get("from_date", "")
    to_date = request.get("to_date", "")

    if not apps_script_url:
        raise HTTPException(status_code=400, detail="apps_script_url is required")

    report_data = generate_report_data(report_type)

    # Build daily tracker rows:
    # [DATE, Daily Cost, Total Cost Cur mon, Total Cost Last mon]
    daily = report_data.get("daily", [])
    daily_last = report_data.get("daily_last_month", [])

    # Build lookup for last month costs by day-of-month
    last_month_by_day = {}
    for entry in daily_last:
        try:
            day = int(entry["date"].split("-")[2])
            last_month_by_day[day] = entry["cost"]
        except (IndexError, ValueError):
            pass

    # Filter by date range if provided
    filtered_daily = daily
    if from_date:
        filtered_daily = [d for d in filtered_daily if d["date"] >= from_date]
    if to_date:
        filtered_daily = [d for d in filtered_daily if d["date"] <= to_date]

    # For cumulative calc, we need ALL days up to from_date to compute starting cum_cur
    # So compute cumulative from full daily list, then filter output
    cum_cur = 0.0
    cum_last = 0.0
    all_tracker_rows = []
    for entry in daily:
        date_str = entry["date"]
        day_cost = entry["cost"]
        parts = date_str.split("-")
        display_date = f"{int(parts[1])}/{int(parts[2])}/{parts[0]}"
        cum_cur += day_cost
        day_num = int(parts[2])
        cum_last += last_month_by_day.get(day_num, 0)
        all_tracker_rows.append([
            display_date,
            round(day_cost, 2),
            round(cum_cur, 2),
            round(cum_last, 2),
        ])

    # Apply date filter on output
    if from_date or to_date:
        tracker_rows = []
        for row in all_tracker_rows:
            # row[0] is M/D/YYYY, convert to YYYY-MM-DD for comparison
            parts = row[0].split("/")
            row_date = f"{parts[2]}-{int(parts[0]):02d}-{int(parts[1]):02d}"
            if from_date and row_date < from_date:
                continue
            if to_date and row_date > to_date:
                continue
            tracker_rows.append(row)
    else:
        tracker_rows = all_tracker_rows

    from google_sheets import push_daily_cost_tracker

    is_filtered = bool(from_date or to_date)
    tracker_ok = push_daily_cost_tracker(apps_script_url, tracker_rows, filtered=is_filtered)

    if tracker_ok:
        mode = "Filtered" if is_filtered else "Full"
        return {
            "success": True,
            "message": f"{mode} push: {len(tracker_rows)} rows",
            "rows_pushed": len(tracker_rows),
            "report": report_data,
        }
    raise HTTPException(status_code=400, detail="Push failed — check Apps Script URL and Sheet sharing settings")
