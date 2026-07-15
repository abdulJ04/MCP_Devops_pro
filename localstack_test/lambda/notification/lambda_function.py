import json
from datetime import datetime

def lambda_handler(event, context):
    for record in event.get("Records", []):
        msg = json.loads(record.get("body", "{}"))
        channel = msg.get("channel", "email")
        to = msg.get("to", "user@example.com")
        subject = msg.get("subject", "Notification")
        print(f"[{channel}] Sending to {to}: {subject}")

    return {
        "statusCode": 200,
        "body": json.dumps({
            "sent": len(event.get("Records", [])),
            "function": "notification-sender",
            "timestamp": datetime.utcnow().isoformat()
        })
    }
