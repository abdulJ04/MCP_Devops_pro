"""Google Sheets integration via Apps Script Web App.

Google Apps Script Web Apps redirect POST to script.googleusercontent.com.
We must follow the redirect and POST directly to the final URL.
"""
import json
import logging
import http.client
import urllib.parse
import ssl
import re

logger = logging.getLogger("cost-reports")


def _post_to_apps_script(apps_script_url: str, payload: dict) -> dict:
    """POST JSON to Apps Script URL, following Google's redirect chain.

    Google Apps Script redirects:
      script.google.com/macros/s/{ID}/exec
        → 302 → script.googleusercontent.com/macros/echo?...

    We extract the final URL and POST directly to it.
    """
    context = ssl.create_default_context()
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Content-Length": str(len(body)),
    }

    # Step 1: Follow initial redirect to get final URL
    parsed = urllib.parse.urlparse(apps_script_url)
    conn = http.client.HTTPSConnection(parsed.hostname, context=context, timeout=30)
    conn.request("POST", parsed.path, body=body, headers=headers)
    resp = conn.getresponse()

    if resp.status in (301, 302, 303, 307):
        location = resp.getheader("Location", "")
        conn.close()

        if not location:
            raise Exception("Redirect with no Location header")

        # Parse the redirect URL
        parsed_loc = urllib.parse.urlparse(location)
        final_host = parsed_loc.hostname
        final_path = parsed_loc.path
        if parsed_loc.query:
            final_path += "?" + parsed_loc.query

        # Step 2: POST directly to the final URL
        conn = http.client.HTTPSConnection(final_host, context=context, timeout=30)
        conn.request("POST", final_path, body=body, headers=headers)
        resp = conn.getresponse()

    # Read response
    response_body = resp.read().decode("utf-8")
    status = resp.status
    conn.close()

    if status != 200:
        raise Exception(f"HTTP {status}: {response_body[:300]}")

    # Try to extract JSON from response (might be wrapped in HTML)
    json_match = re.search(r'\{.*\}', response_body, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

    raise Exception(f"No JSON in response: {response_body[:200]}")


def push_region_cost_data(apps_script_url: str, report_data: dict) -> bool:
    """Push region-based cost data to Google Sheet."""
    if not apps_script_url:
        return False

    try:
        report_date = report_data.get("report_date", "")
        report_type = report_data.get("report_type", "daily")
        total_cost = report_data.get("total_cost", 0)
        today_cost = report_data.get("today_cost", 0)
        yesterday_cost = report_data.get("yesterday_cost", 0)
        forecast = report_data.get("forecast", 0)
        anomaly_score = report_data.get("anomaly_score", 0)

        rows = []
        region_breakdown = report_data.get("region_breakdown", [])

        if region_breakdown:
            for region in region_breakdown:
                rows.append([
                    report_date, report_type,
                    region.get("name", "unknown"),
                    round(region.get("cost", 0), 2),
                    region.get("percentage", 0),
                    round(total_cost, 2), round(today_cost, 2),
                    round(yesterday_cost, 2), round(forecast, 2),
                    anomaly_score,
                ])
        else:
            rows.append([
                report_date, report_type, "all-regions",
                round(total_cost, 2), 100.0,
                round(total_cost, 2), round(today_cost, 2),
                round(yesterday_cost, 2), round(forecast, 2),
                anomaly_score,
            ])

        result = _post_to_apps_script(apps_script_url, {"action": "push_region", "rows": rows})
        if result.get("success"):
            logger.info(f"Pushed {len(rows)} region rows to Google Sheet")
            return True
        logger.error(f"Apps Script error: {result}")
        return False
    except Exception as e:
        logger.error(f"Failed to push region data: {e}")
        return False


def push_service_cost_data(apps_script_url: str, report_data: dict) -> bool:
    """Push service-based cost data to Google Sheet."""
    if not apps_script_url:
        return False

    try:
        report_date = report_data.get("report_date", "")
        report_type = report_data.get("report_type", "daily")
        rows = []
        for svc in report_data.get("top_services", []):
            rows.append([
                report_date, report_type,
                svc.get("service", "unknown"),
                round(svc.get("cost", 0), 2),
                svc.get("percentage", 0),
            ])
        if not rows:
            return True

        result = _post_to_apps_script(apps_script_url, {"action": "push_service", "rows": rows})
        if result.get("success"):
            logger.info(f"Pushed {len(rows)} service rows to Google Sheet")
            return True
        return False
    except Exception as e:
        logger.error(f"Failed to push service data: {e}")
        return False


def test_connection(apps_script_url: str) -> dict:
    """Test Apps Script connection."""
    if not apps_script_url:
        return {"success": False, "error": "Apps Script URL not configured"}

    try:
        result = _post_to_apps_script(apps_script_url, {"action": "test"})
        if result.get("success"):
            return {"success": True, "message": "Connected to Google Sheet!"}
        return {"success": False, "error": result.get("message", "Connection failed")}
    except Exception as e:
        error_msg = str(e)
        if "401" in error_msg:
            return {"success": False, "error": "401 Unauthorized — Deploy as 'Anyone', not 'Anyone with Google account'"}
        elif "403" in error_msg:
            return {"success": False, "error": "403 Forbidden — Share Sheet with 'Anyone with link' as Editor"}
        return {"success": False, "error": error_msg}
