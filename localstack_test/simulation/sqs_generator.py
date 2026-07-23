import random
import json
from datetime import datetime, timezone
from .base_generator import BaseGenerator
from .logger import log
from .state_manager import state
from .event_bus import event_bus
from .cost_engine import cost_engine

QUEUE_NAMES = ["orders", "notifications", "logs", "billing", "dead-letter-queue", "alerts"]

MESSAGE_TYPES = {
    "orders": lambda: json.dumps({
        "orderId": f"ORD-{random.randint(1000,9999)}",
        "customerId": f"C{random.randint(100,999)}",
        "amount": round(random.uniform(50, 2500), 2),
        "action": random.choice(["new", "cancel", "refund"]),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }),
    "notifications": lambda: json.dumps({
        "type": random.choice(["alert", "info", "warning"]),
        "message": f"Event {random.randint(1,999)} occurred",
        "source": random.choice(["ec2", "lambda", "s3", "iam"]),
        "severity": random.choice(["low", "medium", "high", "critical"]),
    }),
    "logs": lambda: json.dumps({
        "logId": random.randint(100000, 999999),
        "service": random.choice(["api", "worker", "db", "cache"]),
        "level": random.choice(["INFO", "WARN", "ERROR"]),
        "message": f"Log entry #{random.randint(1,9999)}",
    }),
    "billing": lambda: json.dumps({
        "invoiceId": f"INV-{random.randint(1000,9999)}",
        "amount": round(random.uniform(100, 5000), 2),
        "period": "2026-07",
        "status": random.choice(["pending", "paid", "overdue"]),
    }),
    "alerts": lambda: json.dumps({
        "alertId": f"ALT-{random.randint(1000,9999)}",
        "type": random.choice(["cpu", "memory", "disk", "error", "budget"]),
        "value": round(random.uniform(50, 100), 1),
        "threshold": 80,
    }),
    "dead-letter-queue": lambda: json.dumps({
        "error": random.choice(["timeout", "exception", "throttle"]),
        "originalQueue": random.choice(["orders", "notifications", "logs"]),
        "messageId": f"msg-{random.randint(10000,99999)}",
        "retryCount": random.randint(1, 5),
    }),
}


class SQSGenerator(BaseGenerator):
    def __init__(self):
        super().__init__("SQS", 8)

    def generate(self):
        sqs = self.get_client("sqs")

        action = random.choices(
            ["send", "receive", "delete"],
            weights=[50, 30, 20],
        )[0]

        queue_name = random.choice(QUEUE_NAMES)
        queue_url = f"http://localhost:4566/000000000000/{queue_name}"

        if action == "send":
            msg_fn = MESSAGE_TYPES.get(queue_name, MESSAGE_TYPES["logs"])
            body = msg_fn()
            try:
                sqs.send_message(QueueUrl=queue_url, MessageBody=body)
                cost_engine.record_realistic("SQS")
                state.increment("sqs_send")
                log.info(f"Sent to {queue_name}", component=self.name)
                event_bus.publish("sqs.send_message", {"queue": queue_name})
            except Exception:
                pass

        elif action in ("receive", "delete"):
            try:
                resp = sqs.receive_message(
                    QueueUrl=queue_url,
                    MaxNumberOfMessages=1,
                    WaitTimeSeconds=0,
                )
                msgs = resp.get("Messages", [])
                if msgs:
                    msg = msgs[0]
                    if action == "delete":
                        sqs.delete_message(
                            QueueUrl=queue_url,
                            ReceiptHandle=msg["ReceiptHandle"],
                        )
                        cost_engine.record_realistic("SQS")
                        log.info(f"Processed from {queue_name}", component=self.name)
                    else:
                        cost_engine.record_realistic("SQS")
                        log.info(f"Read from {queue_name}", component=self.name)
                    event_bus.publish("sqs.receive_message", {"queue": queue_name})
            except Exception:
                pass

    def discover_existing(self):
        sqs = self.get_client("sqs")
        try:
            queues = sqs.list_queues().get("QueueUrls", [])
            for q_url in queues:
                qname = q_url.split("/")[-1]
                if qname not in QUEUE_NAMES:
                    QUEUE_NAMES.append(qname)
            log.info(f"Discovered {len(queues)} SQS queues", component=self.name)
        except Exception:
            pass
