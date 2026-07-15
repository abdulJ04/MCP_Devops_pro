import json
from datetime import datetime

def lambda_handler(event, context):
    for record in event.get("Records", []):
        body = json.loads(record.get("body", "{}"))
        print(f"Processing billing: {body}")

    return {
        "statusCode": 200,
        "body": json.dumps({
            "processed": len(event.get("Records", [])),
            "timestamp": datetime.utcnow().isoformat(),
            "function": "billing-processor"
        })
    }
