import os
import json
import random
from datetime import datetime, timezone
from .base_generator import BaseGenerator
from .logger import log
from .state_manager import state
from .event_bus import event_bus
from .cost_engine import cost_engine

SERVICE_ALERTS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "aws-mcp-server", "service_alerts_active.json",
)

ALERT_DEFS = [
    {"type": "cpu_high", "severity": "CRITICAL", "message": "CPU utilization exceeds threshold"},
    {"type": "memory_high", "severity": "CRITICAL", "message": "Memory utilization exceeds threshold"},
    {"type": "disk_full", "severity": "WARNING", "message": "Disk usage above 80%"},
    {"type": "budget_exceeded", "severity": "CRITICAL", "message": "Monthly budget threshold exceeded"},
    {"type": "lambda_error", "severity": "WARNING", "message": "Lambda function error rate above threshold"},
    {"type": "queue_length", "severity": "WARNING", "message": "SQS queue depth exceeds threshold"},
    {"type": "secret_rotated", "severity": "INFO", "message": "Secret rotated successfully"},
    {"type": "iam_user_created", "severity": "INFO", "message": "New IAM user/role created"},
    {"type": "public_bucket", "severity": "CRITICAL", "message": "S3 bucket has public access"},
    {"type": "instance_failure", "severity": "CRITICAL", "message": "EC2 instance health check failed"},
    {"type": "cost_spike", "severity": "WARNING", "message": "Daily cost spike detected"},
    {"type": "api_error", "severity": "WARNING", "message": "API error rate above threshold"},
]


def _get_enabled_service_alerts():
    try:
        if os.path.exists(SERVICE_ALERTS_FILE):
            with open(SERVICE_ALERTS_FILE) as f:
                data = json.load(f)
            return {a["service"]: a for a in data.get("enabled_alerts", [])}
    except Exception:
        pass
    return {}


class AlertGenerator(BaseGenerator):
    def __init__(self):
        super().__init__("Alerts", 5)

    def generate(self):
        enabled = _get_enabled_service_alerts()

        if not enabled:
            return

        alert_def = random.choice(ALERT_DEFS)
        service_key = None
        should_alert = False
        detail = ""

        if alert_def["type"] == "cpu_high":
            cfg = enabled.get("ec2")
            if cfg and random.random() < 0.4:
                cpu = random.uniform(81, 99)
                threshold = cfg.get("threshold", 80)
                if cpu > threshold:
                    should_alert = True
                    detail = f"CPU at {cpu:.1f}% on instance i-{random.randint(10000,99999)} (threshold: {threshold}%)"

        elif alert_def["type"] == "memory_high":
            cfg = enabled.get("ec2_memory")
            if cfg and random.random() < 0.3:
                mem = random.uniform(86, 98)
                threshold = cfg.get("threshold", 85)
                if mem > threshold:
                    should_alert = True
                    detail = f"Memory at {mem:.1f}% on instance i-{random.randint(10000,99999)} (threshold: {threshold}%)"

        elif alert_def["type"] == "public_bucket":
            cfg = enabled.get("s3_public")
            if cfg and random.random() < 0.2:
                should_alert = True
                detail = "S3 bucket has public access"

        elif alert_def["type"] == "lambda_error":
            cfg = enabled.get("lambda_error")
            if cfg and random.random() < 0.3:
                fn = random.choice(["hello-world", "billing-processor", "monitoring-collector"])
                error_rate = random.uniform(6, 15)
                threshold = cfg.get("threshold", 5)
                if error_rate > threshold:
                    should_alert = True
                    detail = f"{fn} error rate: {error_rate:.1f}% (threshold: {threshold}%)"

        elif alert_def["type"] == "queue_length":
            cfg = enabled.get("sqs_depth")
            if cfg and random.random() < 0.25:
                depth = random.randint(500, 5000)
                threshold = cfg.get("threshold", 1000)
                if depth > threshold:
                    should_alert = True
                    detail = f"Queue depth: {depth} messages (threshold: {threshold})"

        elif alert_def["type"] == "iam_user_created":
            cfg = enabled.get("iam_change")
            if cfg and random.random() < 0.15:
                should_alert = True
                detail = "New IAM user/role created"

        elif alert_def["type"] == "secret_rotated":
            cfg = enabled.get("secrets_rotation")
            if cfg and random.random() < 0.15:
                should_alert = True
                detail = "Secret rotation required for /prod/secret"

        elif alert_def["type"] == "instance_failure":
            cfg = enabled.get("ec2_health")
            if cfg and random.random() < 0.1:
                should_alert = True
                detail = "EC2 instance health check failed"

        elif alert_def["type"] == "cost_spike":
            cfg = enabled.get("cost_spike")
            if cfg and random.random() < 0.2:
                spike = random.uniform(50, 300)
                threshold = cfg.get("threshold", 100)
                if spike > threshold:
                    should_alert = True
                    detail = f"Daily cost spike: ${spike:.2f} (threshold: ${threshold:.2f})"

        elif alert_def["type"] == "budget_exceeded":
            if "cost_spike" in enabled or "budget" in enabled:
                cost = cost_engine.get_summary()
                detail = f"Current: ${cost.get('month',0):.2f}, Forecast: ${cost.get('forecast',0):.2f}"
                should_alert = True

        if should_alert:
            log.warning(f"{alert_def['type']}: {detail}", component=self.name)
            event_bus.publish("alert.generated", {
                "type": alert_def["type"],
                "severity": alert_def["severity"],
                "message": alert_def["message"],
                "detail": detail,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

    def discover_existing(self):
        pass
