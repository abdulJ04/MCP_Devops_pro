import os
import sys
import signal
import threading
import time
import subprocess
from datetime import datetime, timezone

from .logger import log
from .state_manager import state
from .event_bus import event_bus
from .cost_engine import cost_engine
from .business_hours import business_hours

from .s3_generator import S3Generator
from .iam_generator import IAMGenerator
from .lambda_generator import LambdaGenerator
from .dynamodb_generator import DynamoDBGenerator
from .sqs_generator import SQSGenerator
from .sns_generator import SNSGenerator
from .secrets_manager_generator import SecretsManagerGenerator
from .ec2_generator import EC2Generator
from .cloudwatch_generator import CloudWatchGenerator
from .cloudtrail_generator import CloudTrailGenerator
from .alert_generator import AlertGenerator
from .metrics_generator import MetricsGenerator
from .base_generator import BaseGenerator


class SimulationEngine:
    def __init__(self):
        self._generators: list[BaseGenerator] = []
        self._running = False
        self._start_time = None
        self._stats_thread = None
        event_bus.subscribe("s3.put_object", self._on_s3_put)
        event_bus.subscribe("ec2.cpu_high", self._on_cpu_high)
        event_bus.subscribe("secrets.rotate", self._on_secret_rotated)

    def _on_s3_put(self, event):
        cost_engine.add_cost("S3", 0.000005)

    def _on_cpu_high(self, event):
        log.warning(f"CPU high on {event['data'].get('instance_id')}: {event['data'].get('cpu')}%", component="ALERT")

    def _on_secret_rotated(self, event):
        log.info(f"Secret rotated: {event['data'].get('name')}", component="SECURITY")

    def check_localstack(self):
        import urllib.request
        import json
        try:
            resp = urllib.request.urlopen("http://localhost:4566/_localstack/health", timeout=3)
            data = json.loads(resp.read().decode())
            available = data.get("services", {})
            essential = ["s3", "iam", "lambda", "dynamodb", "sqs", "sns", "secretsmanager", "ec2", "cloudwatch", "cloudtrail", "sts"]
            missing = [s for s in essential if available.get(s) not in ("running", "available")]
            if missing:
                log.warning(f"Services not ready: {', '.join(missing)}", component="ENGINE")
                return False
            log.info("LocalStack is ready", component="ENGINE")
            return True
        except Exception as e:
            log.error(f"LocalStack not reachable: {e}", component="ENGINE")
            return False

    def wait_for_localstack(self, max_retries=30):
        for i in range(max_retries):
            if self.check_localstack():
                return True
            log.info(f"Waiting for LocalStack ({i+1}/{max_retries})...", component="ENGINE")
            time.sleep(2)
        return False

    def run_seed_script(self):
        script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        seed_script = os.path.join(script_dir, "setup-enterprise-demo.sh")
        if os.path.exists(seed_script):
            log.info("Running seed script...", component="ENGINE")
            try:
                result = subprocess.run(
                    ["bash", seed_script],
                    capture_output=True, text=True, timeout=120,
                )
                if result.returncode == 0:
                    log.info("Seed script completed", component="ENGINE")
                else:
                    log.warning(f"Seed script had issues: {result.stderr[:200]}", component="ENGINE")
            except subprocess.TimeoutExpired:
                log.warning("Seed script timed out, continuing anyway", component="ENGINE")
        else:
            log.warning(f"Seed script not found at {seed_script}", component="ENGINE")

    def _stats_loop(self):
        while self._running:
            time.sleep(30)
            if not self._running:
                break
            cost = cost_engine.get_summary()
            uptime = int(time.time() - (self._start_time or time.time()))
            ec2_count = state.get_active_ec2_count()
            s3_count = len(state.list_resources("s3"))
            iam_count = len(state.list_resources("iam"))
            lambda_invokes = state.get("counters.lambda_invoke", 0)
            s3_uploads = state.get("counters.s3_upload", 0)

            log.info(f"=== STATS ===", component="ENGINE")
            log.info(f"Uptime: {uptime}s | EC2: {ec2_count} | S3: {s3_count} | IAM: {iam_count}", component="ENGINE")
            log.info(f"Lambda invokes: {lambda_invokes} | S3 uploads: {s3_uploads}", component="ENGINE")
            log.info(f"Cost today: ${cost.get('today',0):.2f} | Month: ${cost.get('month',0):.2f} | Forecast: ${cost.get('forecast',0):.2f}", component="ENGINE")
            log.info(f"Business hours: {business_hours.get_activity_multiplier():.0%}", component="ENGINE")
            log.info(f"============", component="ENGINE")

    def _discover_existing(self):
        for gen in self._generators:
            try:
                gen.discover_existing()
            except Exception:
                pass

    def start(self):
        if self._running:
            log.warning("Engine already running", component="ENGINE")
            return

        self._running = True
        self._start_time = time.time()

        log.header = lambda: print(f"\n{'='*60}")
        log.info("Starting Enterprise AWS Simulation Engine", component="ENGINE")
        log.info("Target: LocalStack", component="ENGINE")

        if not self.wait_for_localstack():
            log.error("LocalStack not available. Exiting.", component="ENGINE")
            self._running = False
            return

        self._generators = [
            S3Generator(),
            IAMGenerator(),
            LambdaGenerator(),
            DynamoDBGenerator(),
            SQSGenerator(),
            SNSGenerator(),
            SecretsManagerGenerator(),
            EC2Generator(),
            CloudWatchGenerator(),
            CloudTrailGenerator(),
            AlertGenerator(),
            MetricsGenerator(),
        ]

        self._discover_existing()

        for gen in self._generators:
            gen.start()
            time.sleep(0.3)

        self._stats_thread = threading.Thread(target=self._stats_loop, daemon=True, name="Stats")
        self._stats_thread.start()

        log.info("All generators started", component="ENGINE")
        log.info("Enterprise Simulation Running — Press Ctrl+C to stop", component="ENGINE")

    def stop(self):
        log.info("Shutting down all generators...", component="ENGINE")
        self._running = False
        for gen in self._generators:
            try:
                gen.stop()
            except Exception:
                pass
        log.info("Enterprise Simulation Engine stopped", component="ENGINE")

    def get_status(self):
        return {
            "running": self._running,
            "uptime": int(time.time() - (self._start_time or time.time())),
            "generators": [gen.name for gen in self._generators],
            "active_ec2": state.get_active_ec2_count(),
            "cost": cost_engine.get_summary(),
            "business_hours": business_hours.get_activity_multiplier(),
        }


engine = SimulationEngine()
