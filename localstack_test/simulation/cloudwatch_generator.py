import random
import math
from datetime import datetime, timezone
from .base_generator import BaseGenerator
from .logger import log
from .state_manager import state
from .event_bus import event_bus

NAMESPACES = ["AWS/EC2", "AWS/Lambda", "AWS/S3", "AWS/DynamoDB", "AWS/SQS", "AWS/RDS", "Custom/App"]

EC2_DIMENSIONS = [{"Name": "InstanceId", "Value": f"i-{random.randint(10000,99999)}"} for _ in range(5)]
LAMBDA_DIMENSIONS = [{"Name": "FunctionName", "Value": fn} for fn in ["hello-world", "billing-processor", "monitoring-collector"]]


class CloudWatchGenerator(BaseGenerator):
    def __init__(self):
        super().__init__("CloudWatch", 5)

    def generate(self):
        cw = self.get_client("cloudwatch")
        namespace = random.choice(NAMESPACES)

        metrics_data = []
        dimensions = [{"Name": "Environment", "Value": "production"}]

        if namespace == "AWS/EC2":
            dim = random.choice(EC2_DIMENSIONS)
            metrics_data.append({"MetricName": "CPUUtilization", "Value": random.uniform(10, 95), "Unit": "Percent", "Dimensions": [dim]})
            metrics_data.append({"MetricName": "MemoryUtilization", "Value": random.uniform(30, 90), "Unit": "Percent", "Dimensions": [dim]})
            metrics_data.append({"MetricName": "DiskReadBytes", "Value": random.randint(1000, 10000000), "Unit": "Bytes", "Dimensions": [dim]})
            metrics_data.append({"MetricName": "NetworkIn", "Value": random.randint(100000, 10000000), "Unit": "Bytes", "Dimensions": [dim]})

        elif namespace == "AWS/Lambda":
            dim = random.choice(LAMBDA_DIMENSIONS)
            metrics_data.append({"MetricName": "Invocations", "Value": random.randint(1, 100), "Unit": "Count", "Dimensions": [dim]})
            metrics_data.append({"MetricName": "Duration", "Value": random.randint(50, 5000), "Unit": "Milliseconds", "Dimensions": [dim]})
            metrics_data.append({"MetricName": "Errors", "Value": random.randint(0, 5), "Unit": "Count", "Dimensions": [dim]})
            if random.random() < 0.3:
                metrics_data.append({"MetricName": "Throttles", "Value": random.randint(0, 3), "Unit": "Count", "Dimensions": [dim]})

        elif namespace == "AWS/S3":
            metrics_data.append({"MetricName": "NumberOfObjects", "Value": random.randint(100, 50000), "Unit": "Count", "Dimensions": [{"Name": "BucketName", "Value": random.choice(["hr-data", "logs-bucket", "finance-data"])}]})
            metrics_data.append({"MetricName": "BucketSizeBytes", "Value": random.randint(1000000, 10000000000), "Unit": "Bytes", "Dimensions": [{"Name": "BucketName", "Value": random.choice(["hr-data", "logs-bucket", "finance-data"])}]})

        elif namespace == "AWS/DynamoDB":
            table = random.choice(["Employees", "Orders", "Products"])
            dims = [{"Name": "TableName", "Value": table}, {"Name": "GlobalSecondaryIndexName", "Value": "None"}]
            metrics_data.append({"MetricName": "ConsumedReadCapacityUnits", "Value": random.randint(1, 100), "Unit": "Count", "Dimensions": dims})
            metrics_data.append({"MetricName": "ConsumedWriteCapacityUnits", "Value": random.randint(1, 50), "Unit": "Count", "Dimensions": dims})

        elif namespace == "AWS/SQS":
            queue = random.choice(["orders", "notifications", "logs", "billing"])
            dims = [{"Name": "QueueName", "Value": queue}]
            metrics_data.append({"MetricName": "ApproximateNumberOfMessagesVisible", "Value": random.randint(0, 100), "Unit": "Count", "Dimensions": dims})
            metrics_data.append({"MetricName": "NumberOfMessagesSent", "Value": random.randint(1, 50), "Unit": "Count", "Dimensions": dims})

        elif namespace == "Custom/App":
            dimensions = [
                {"Name": "Service", "Value": random.choice(["api-gateway", "user-service", "payment-service", "auth-service"])},
                {"Name": "Environment", "Value": "production"},
            ]
            metrics_data.append({"MetricName": "RequestCount", "Value": random.randint(100, 5000), "Unit": "Count", "Dimensions": dimensions})
            metrics_data.append({"MetricName": "Latency", "Value": round(random.uniform(5, 500), 2), "Unit": "Milliseconds", "Dimensions": dimensions})
            metrics_data.append({"MetricName": "ErrorRate", "Value": round(random.uniform(0, 5), 2), "Unit": "Percent", "Dimensions": dimensions})
            metrics_data.append({"MetricName": "ActiveUsers", "Value": random.randint(10, 500), "Unit": "Count", "Dimensions": dimensions})

        for m in metrics_data:
            m["Timestamp"] = datetime.now(timezone.utc)

        try:
            cw.put_metric_data(Namespace=namespace, MetricData=metrics_data)
            log.info(f"Published {len(metrics_data)} metrics to {namespace}", component=self.name)
            event_bus.publish("cloudwatch.metrics", {"namespace": namespace, "count": len(metrics_data)})
        except Exception:
            pass
