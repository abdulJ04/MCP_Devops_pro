"""Service-level alert configuration and status API."""
import os
import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from models import get_service_alert_configs, update_service_alert_config, get_enabled_service_alerts, add_alert_log

logger = logging.getLogger("aws-mcp-server")
router = APIRouter()

SERVICE_ALERTS_FILE = os.path.join(os.path.dirname(__file__), "service_alerts_active.json")


class ServiceAlertToggle(BaseModel):
    service: str
    enabled: Optional[bool] = None
    threshold: Optional[float] = None


class ServiceAlertBulkUpdate(BaseModel):
    configs: List[ServiceAlertToggle]


SERVICE_LABELS = {
    "ec2": "EC2 (CPU)",
    "ec2_memory": "EC2 (Memory)",
    "s3_public": "S3 (Public Access)",
    "lambda_error": "Lambda (Error Rate)",
    "dynamodb_throttle": "DynamoDB (Throttled Requests)",
    "rds_cpu": "RDS (CPU)",
    "iam_change": "IAM (User/Role Changes)",
    "sqs_depth": "SQS (Queue Depth)",
    "sns_failure": "SNS (Publish Failures)",
    "secrets_rotation": "Secrets Manager (Rotation Failure)",
    "ec2_health": "EC2 (Instance Health)",
    "cost_spike": "Cost (Daily Spike)",
}

SERVICE_ICONS = {
    "ec2": "🖥️", "ec2_memory": "🖥️", "s3_public": "☁️", "lambda_error": "⚡",
    "dynamodb_throttle": "🗄️", "rds_cpu": "🗃️", "iam_change": "🔑",
    "sqs_depth": "📨", "sns_failure": "📢", "secrets_rotation": "🔐",
    "ec2_health": "🖥️", "cost_spike": "💰",
}


def _sync_active_configs_file():
    """Write enabled alert configs to a JSON file for the sim engine to read."""
    try:
        configs = get_enabled_service_alerts()
        with open(SERVICE_ALERTS_FILE, "w") as f:
            json.dump({"enabled_alerts": configs, "updated_at": datetime.now(timezone.utc).isoformat()}, f, indent=2)
    except Exception:
        pass


@router.get("/service-alerts/config")
def get_configs():
    """Get all service alert configurations."""
    try:
        configs = get_service_alert_configs()
        for c in configs:
            c["label"] = SERVICE_LABELS.get(c["service"], c["service"])
            c["icon"] = SERVICE_ICONS.get(c["service"], "🔔")
        return {"configs": configs, "success": True}
    except Exception as e:
        logger.error(f"Failed to get service alert configs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/service-alerts/config")
def save_configs(update: ServiceAlertBulkUpdate):
    """Save multiple service alert configurations at once."""
    try:
        results = []
        for item in update.configs:
            result = update_service_alert_config(
                service=item.service,
                enabled=item.enabled,
                threshold=item.threshold,
            )
            if result:
                results.append(result)
        _sync_active_configs_file()
        return {"configs": results, "success": True}
    except Exception as e:
        logger.error(f"Failed to save service alert configs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/service-alerts/status")
def get_status():
    """Get current service alert status — which alerts are firing."""
    try:
        enabled = get_enabled_service_alerts()
        now = datetime.now(timezone.utc)
        alerts = []
        services_under_alert = 0

        for cfg in enabled:
            svc = cfg["service"]
            threshold = cfg["threshold"]
            operator = cfg["operator"]

            if svc == "cost_spike":
                from server import _cached
                cached = _cached("cost", 300)
                if cached:
                    today = cached.get("today", 0)
                    yesterday = cached.get("yesterday", 0)
                    diff = today - yesterday
                    is_firing = False
                    firing_detail = ""
                    if operator == ">" and diff > threshold:
                        is_firing = True
                        firing_detail = f"Daily cost spike: ${diff:.2f} > ${threshold:.2f}"
                    elif operator == "<" and diff < threshold:
                        is_firing = True
                        firing_detail = f"Daily cost drop: ${diff:.2f} < ${threshold:.2f}"
                    if is_firing:
                        services_under_alert += 1
                        alerts.append({
                            "service": svc,
                            "label": SERVICE_LABELS.get(svc, svc),
                            "icon": SERVICE_ICONS.get(svc, "🔔"),
                            "severity": "WARNING",
                            "message": firing_detail,
                            "timestamp": now.isoformat(),
                        })
                continue

            try:
                from server import _get_client, _credentials
                import random
                use_localstack = _credentials.get("use_localstack", False)

                if not use_localstack:
                    client = _get_client("cloudwatch")

                firing = False
                detail = ""

                if svc == "ec2":
                    cpu_val = random.uniform(60, 99) if use_localstack else _get_cloudwatch_metric(client, "AWS/EC2", "CPUUtilization", "Average")
                    if operator == ">" and cpu_val > threshold:
                        firing = True
                        detail = f"EC2 CPU: {cpu_val:.1f}% > {threshold:.0f}%"
                    elif operator == "<" and cpu_val < threshold:
                        firing = True
                        detail = f"EC2 CPU: {cpu_val:.1f}% < {threshold:.0f}%"

                elif svc == "ec2_memory":
                    mem_val = random.uniform(70, 98) if use_localstack else _get_cloudwatch_metric(client, "CWAgent", "mem_used_percent", "Average")
                    if operator == ">" and mem_val > threshold:
                        firing = True
                        detail = f"EC2 Memory: {mem_val:.1f}% > {threshold:.0f}%"

                elif svc == "s3_public":
                    if use_localstack:
                        import os, json
                        cost_file = os.path.join(os.path.dirname(__file__), "sim_cost_data.json")
                        public = random.random() < 0.3
                    else:
                        public = False
                    if public:
                        firing = True
                        detail = "S3 bucket(s) have public access"

                elif svc == "lambda_error":
                    error_rate = random.uniform(0, 12) if use_localstack else 0
                    if operator == ">" and error_rate > threshold:
                        firing = True
                        detail = f"Lambda error rate: {error_rate:.1f}% > {threshold:.0f}%"

                elif svc == "dynamodb_throttle":
                    throttle_count = random.randint(0, 50) if use_localstack else 0
                    if operator == ">" and throttle_count > threshold:
                        firing = True
                        detail = f"DynamoDB throttled requests: {throttle_count} > {threshold:.0f}"

                elif svc == "rds_cpu":
                    rds_cpu = random.uniform(50, 95) if use_localstack else 0
                    if operator == ">" and rds_cpu > threshold:
                        firing = True
                        detail = f"RDS CPU: {rds_cpu:.1f}% > {threshold:.0f}%"

                elif svc == "iam_change":
                    if use_localstack and random.random() < 0.2:
                        firing = True
                        detail = "New IAM user or role detected"

                elif svc == "sqs_depth":
                    depth = random.randint(0, 5000) if use_localstack else 0
                    if operator == ">" and depth > threshold:
                        firing = True
                        detail = f"SQS queue depth: {depth} > {threshold:.0f}"

                elif svc == "sns_failure":
                    failures = random.randint(0, 20) if use_localstack else 0
                    if operator == ">" and failures > threshold:
                        firing = True
                        detail = f"SNS publish failures: {failures} > {threshold:.0f}"

                elif svc == "secrets_rotation":
                    if use_localstack and random.random() < 0.15:
                        firing = True
                        detail = "Secret rotation may be required"

                elif svc == "ec2_health":
                    if use_localstack and random.random() < 0.1:
                        firing = True
                        detail = "EC2 instance health check failed"

                if firing:
                    services_under_alert += 1
                    alerts.append({
                        "service": svc,
                        "label": SERVICE_LABELS.get(svc, svc),
                        "icon": SERVICE_ICONS.get(svc, "🔔"),
                        "severity": "WARNING" if "CPU" not in detail and "Memory" not in detail else "CRITICAL",
                        "message": detail,
                        "timestamp": now.isoformat(),
                    })

            except Exception as inner_e:
                logger.warning(f"Error checking service alert {svc}: {inner_e}")
                continue

        return {
            "alerts": alerts,
            "services_under_alert": services_under_alert,
            "total_enabled": len(enabled),
            "timestamp": now.isoformat(),
            "success": True,
        }
    except Exception as e:
        logger.error(f"Failed to get service alert status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _get_cloudwatch_metric(client, namespace, metric_name, stat):
    try:
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        r = client.get_metric_statistics(
            Namespace=namespace,
            MetricName=metric_name,
            StartTime=now - timedelta(minutes=5),
            EndTime=now,
            Period=300,
            Statistics=[stat],
        )
        datapoints = r.get("Datapoints", [])
        if datapoints:
            return datapoints[-1][stat]
        return 0
    except Exception:
        return 0
