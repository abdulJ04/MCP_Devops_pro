import random
from datetime import datetime, timezone
from .base_generator import BaseGenerator
from .logger import log
from .state_manager import state
from .event_bus import event_bus
from .cost_engine import cost_engine, cost_engine as ce


class MetricsGenerator(BaseGenerator):
    def __init__(self):
        super().__init__("Metrics", 5)

    def generate(self):
        cw = self.get_client("cloudwatch")

        cost_summary = cost_engine.get_summary()
        ec2_count = state.get_active_ec2_count()
        total_uploads = state.get("counters.s3_upload", 0)
        lambda_invokes = state.get("counters.lambda_invoke", 0)
        iam_users = len(state.list_resources("iam"))
        dynamo_writes = state.get("counters.dynamodb_write", 0)

        custom_metrics = [
            {"MetricName": "ActiveEC2Instances", "Value": ec2_count, "Unit": "Count"},
            {"MetricName": "TotalS3Uploads", "Value": total_uploads, "Unit": "Count"},
            {"MetricName": "LambdaInvocations", "Value": lambda_invokes, "Unit": "Count"},
            {"MetricName": "IAMUserCount", "Value": iam_users, "Unit": "Count"},
            {"MetricName": "DynamoDBWrites", "Value": dynamo_writes, "Unit": "Count"},
            {"MetricName": "MonthlyCost", "Value": cost_summary.get("month", 0), "Unit": "USD"},
            {"MetricName": "DailyCost", "Value": cost_summary.get("today", 0), "Unit": "USD"},
            {"MetricName": "CostForecast", "Value": cost_summary.get("forecast", 0), "Unit": "USD"},
        ]

        for m in custom_metrics:
            m["Timestamp"] = datetime.now(timezone.utc)
            m["Dimensions"] = [{"Name": "Environment", "Value": "production"}]

        try:
            cw.put_metric_data(Namespace="Custom/Simulation", MetricData=custom_metrics)
            cost_engine.compute_forecast()
            log.info(f"Published {len(custom_metrics)} simulation metrics", component=self.name)
        except Exception:
            pass

    def discover_existing(self):
        pass
