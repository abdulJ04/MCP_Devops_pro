import random
import json
from datetime import datetime, timezone
from .base_generator import BaseGenerator
from .logger import log
from .state_manager import state
from .event_bus import event_bus
from .cost_engine import cost_engine

TOPIC_NAMES = ["alerts", "monitoring", "billing", "system-events", "notifications-topics"]

MESSAGE_TEMPLATES = {
    "alerts": lambda: {
        "default": json.dumps({
            "type": random.choice(["cpu_high", "memory_critical", "disk_full", "error_burst"]),
            "severity": random.choice(["WARNING", "CRITICAL"]),
            "resource": f"resource-{random.randint(1,100)}",
            "value": round(random.uniform(80, 100), 1),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    },
    "monitoring": lambda: {
        "default": json.dumps({
            "metric": random.choice(["cpu", "memory", "disk", "latency"]),
            "value": round(random.uniform(0, 100), 1),
            "instance": f"i-{random.randint(10000,99999)}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    },
    "billing": lambda: {
        "default": json.dumps({
            "event": random.choice(["invoice", "payment", "budget_alert"]),
            "amount": round(random.uniform(100, 10000), 2),
            "account": "000000000000",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    },
    "system-events": lambda: {
        "default": json.dumps({
            "event": random.choice(["deployment", "rollback", "scaling", "failover", "backup"]),
            "status": random.choice(["started", "completed", "failed"]),
            "service": random.choice(["ecs", "ec2", "rds", "lambda"]),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    },
}


class SNSGenerator(BaseGenerator):
    def __init__(self):
        super().__init__("SNS", 10)

    def generate(self):
        sns = self.get_client("sns")
        topic_name = random.choice(TOPIC_NAMES)
        topic_arn = f"arn:aws:sns:us-east-1:000000000000:{topic_name}"

        msg_fn = MESSAGE_TEMPLATES.get(topic_name, MESSAGE_TEMPLATES["system-events"])
        message = msg_fn()

        try:
            sns.publish(
                TopicArn=topic_arn,
                Message=json.dumps(message),
                MessageStructure="json",
            )
            cost_engine.record_realistic("SNS")
            log.info(f"Published to {topic_name}", component=self.name)
            event_bus.publish("sns.publish", {"topic": topic_name})
        except Exception:
            pass

    def discover_existing(self):
        sns = self.get_client("sns")
        try:
            topics = sns.list_topics().get("Topics", [])
            for t in topics:
                name = t["TopicArn"].split(":")[-1]
                if name not in TOPIC_NAMES:
                    TOPIC_NAMES.append(name)
            log.info(f"Discovered {len(topics)} SNS topics", component=self.name)
        except Exception:
            pass
