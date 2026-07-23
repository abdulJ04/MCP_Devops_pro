import random
import json
import time as time_module
from datetime import datetime, timezone
from .base_generator import BaseGenerator
from .logger import log
from .state_manager import state
from .event_bus import event_bus
from .cost_engine import cost_engine

FUNCTION_NAMES = ["hello-world", "billing-processor", "monitoring-collector", "notification-sender"]
FUNCTION_TIMEOUTS = {fn: random.choice([30, 60, 120]) for fn in FUNCTION_NAMES}
FUNCTION_MEMORY = {fn: random.choice([128, 256, 512, 1024]) for fn in FUNCTION_NAMES}

ERROR_RATES = {
    fn: random.uniform(0.01, 0.15) for fn in FUNCTION_NAMES
}


class LambdaGenerator(BaseGenerator):
    def __init__(self):
        super().__init__("Lambda", 10)

    def generate(self):
        lam = self.get_client("lambda")
        cw = self.get_client("cloudwatch")

        fn_name = random.choice(FUNCTION_NAMES)
        error_rate = ERROR_RATES.get(fn_name, 0.05)
        will_error = random.random() < error_rate
        will_timeout = random.random() < 0.02

        try:
            payload = json.dumps({
                "requestId": f"req-{random.randint(10000,99999)}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "data": {"value": random.randint(1, 1000)},
            })

            if will_timeout:
                try:
                    lam.invoke(FunctionName=fn_name, Payload=payload, InvocationType="RequestResponse")
                except Exception:
                    log.warning(f"{fn_name} timed out", component=self.name)
                    cost_engine.record_realistic("Lambda")
                    self._put_metric(cw, fn_name, "Duration", FUNCTION_TIMEOUTS.get(fn_name, 30) * 1000 + 100)
                    self._put_metric(cw, fn_name, "Errors", 1)
                    event_bus.publish("lambda.timeout", {"function": fn_name})
            elif will_error:
                bad_payload = json.dumps({"bad": "data"})
                try:
                    lam.invoke(FunctionName=fn_name, Payload=bad_payload)
                except Exception:
                    log.warning(f"{fn_name} error", component=self.name)
                    cost_engine.record_realistic("Lambda")
                    self._put_metric(cw, fn_name, "Errors", 1)
                    event_bus.publish("lambda.error", {"function": fn_name, "error": "RuntimeException"})
            else:
                resp = lam.invoke(FunctionName=fn_name, Payload=payload)
                duration = random.randint(50, FUNCTION_TIMEOUTS.get(fn_name, 30) * 1000 - 100)
                mem_used = random.randint(64, FUNCTION_MEMORY.get(fn_name, 128))
                cost_engine.record_realistic("Lambda")
                self._put_metric(cw, fn_name, "Duration", duration)
                self._put_metric(cw, fn_name, "Invocations", 1)
                self._put_metric(cw, fn_name, "MemoryUsed", mem_used)
                state.increment("lambda_invoke")
                log.info(f"{fn_name} invoked ({duration}ms)", component=self.name)
                event_bus.publish("lambda.invoke", {"function": fn_name, "duration": duration})

        except Exception:
            pass

    def _put_metric(self, cw, fn_name, metric_name, value):
        try:
            cw.put_metric_data(
                Namespace="AWS/Lambda",
                MetricData=[{
                    "MetricName": metric_name,
                    "Dimensions": [{"Name": "FunctionName", "Value": fn_name}],
                    "Value": value,
                    "Unit": "Count" if metric_name in ("Invocations", "Errors") else "Milliseconds" if metric_name == "Duration" else "Megabytes",
                    "Timestamp": datetime.now(timezone.utc),
                }],
            )
        except Exception:
            pass

    def discover_existing(self):
        lam = self.get_client("lambda")
        try:
            fns = lam.list_functions().get("Functions", [])
            for fn in fns:
                name = fn["FunctionName"]
                if name not in FUNCTION_NAMES:
                    FUNCTION_NAMES.append(name)
            log.info(f"Discovered {len(fns)} Lambda functions", component=self.name)
        except Exception:
            pass
