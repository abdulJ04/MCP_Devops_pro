import json
from datetime import datetime

def lambda_handler(event, context):
    metrics = {
        "cpu_usage": 67.3,
        "memory_usage": 82.1,
        "disk_io": 1240,
        "network_in": 5200,
        "network_out": 3100,
        "timestamp": datetime.utcnow().isoformat()
    }
    return {
        "statusCode": 200,
        "body": json.dumps({
            "metrics": metrics,
            "function": "monitoring-collector"
        })
    }
