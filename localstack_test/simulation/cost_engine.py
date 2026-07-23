import os
import json
import threading
import random
from datetime import datetime, timezone, timedelta
from .logger import log

COST_DATA_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "aws-mcp-server", "sim_cost_data.json",
)

BASE_COST = 45.0
COST_PER_S3_UPLOAD = 0.55
COST_PER_LAMBDA_INVOKE = 0.12
COST_PER_DYNAMODB_WRITE = 0.08
COST_PER_SQS_OPERATION = 0.004
COST_PER_SNS_PUBLISH = 0.005
COST_PER_SECRET_OPERATION = 0.15
COST_PER_EC2_OPERATION = 0.35
COST_PER_IAM_OPERATION = 0.02


class CostEngine:
    def __init__(self):
        self._lock = threading.RLock()
        self._data = {
            "today": BASE_COST,
            "yesterday": 0.0,
            "month": 0.0,
            "forecast": 0.0,
            "daily": [],
            "daily_last_month": [],
            "byService": {},
            "byRegion": [],
            "source": "simulation",
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }
        self._today_str = ""
        self._init_from_file()

    def _file_path(self):
        return COST_DATA_FILE

    def _init_from_file(self):
        try:
            if os.path.exists(self._file_path()):
                with open(self._file_path()) as f:
                    data = json.load(f)
                    for k in ("today", "yesterday", "month", "forecast", "daily", "daily_last_month", "byRegion"):
                        if k in data:
                            self._data[k] = data[k]
                    svc = data.get("byService", [])
                    if isinstance(svc, list):
                        self._data["byService"] = {s["service"]: s["cost"] for s in svc}
                    elif isinstance(svc, dict):
                        self._data["byService"] = svc
                    self._today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        except Exception:
            pass

    def _write(self):
        try:
            out = dict(self._data)
            out["last_updated"] = datetime.now(timezone.utc).isoformat()
            svc = out.get("byService", {})
            if isinstance(svc, dict):
                out["byService"] = [{"service": k, "cost": round(v, 2)} for k, v in svc.items()]
                out["byService"].sort(key=lambda x: x["cost"], reverse=True)
            with open(self._file_path(), "w") as f:
                json.dump(out, f, indent=2)
        except Exception:
            pass

    def _check_day_rollover(self):
        now = datetime.now(timezone.utc)
        today_str = now.strftime("%Y-%m-%d")
        if today_str != self._today_str:
            self._data["yesterday"] = self._data["today"]
            self._data["today"] = BASE_COST
            self._data["daily"].append({"date": self._today_str, "cost": round(self._data["yesterday"], 2)})
            if len(self._data["daily"]) > 60:
                self._data["daily"] = self._data["daily"][-60:]
            self._today_str = today_str
            self._populate_last_month()
            self._write()

    def _populate_last_month(self):
        now = datetime.now(timezone.utc)
        last_month = now.month - 1 if now.month > 1 else 12
        last_month_year = now.year if now.month > 1 else now.year - 1
        import calendar
        days = calendar.monthrange(last_month_year, last_month)[1]
        self._data["daily_last_month"] = []
        for d in range(1, days + 1):
            ds = f"{last_month_year}-{last_month:02d}-{d:02d}"
            r = random.Random(hash(ds) & 0xFFFFFFFF)
            self._data["daily_last_month"].append({
                "date": ds,
                "cost": round(BASE_COST + r.uniform(-8, 18), 2),
            })

    def record(self, service: str, amount: float):
        with self._lock:
            self._check_day_rollover()
            self._data["today"] = round(self._data["today"] + amount, 2)
            self._data["month"] = round(self._data.get("month", 0) + amount, 2)
            if service not in self._data["byService"]:
                self._data["byService"][service] = 0.0
            self._data["byService"][service] = round(self._data["byService"][service] + amount, 2)
            self._compute_forecast()
            self._write()
            log.cost(service, amount)

    def record_realistic(self, service: str, count: int = 1):
        costs = {
            "S3": COST_PER_S3_UPLOAD,
            "Lambda": COST_PER_LAMBDA_INVOKE,
            "DynamoDB": COST_PER_DYNAMODB_WRITE,
            "SQS": COST_PER_SQS_OPERATION,
            "SNS": COST_PER_SNS_PUBLISH,
            "SecretsManager": COST_PER_SECRET_OPERATION,
            "EC2": COST_PER_EC2_OPERATION,
            "IAM": COST_PER_IAM_OPERATION,
        }
        amount = round(costs.get(service, 0.05) * count, 4)
        self.record(service, amount)

    def _compute_forecast(self):
        now = datetime.now(timezone.utc)
        day = max(now.day, 1)
        days_in_month = 30
        month_cost = self._data.get("month", 0)
        self._data["forecast"] = round((month_cost / day) * days_in_month, 2)
        month_total = sum(v for v in self._data["byService"].values()) if isinstance(self._data["byService"], dict) else 0
        self._data["byRegion"] = [
            {"name": "us-east-1", "value": round(month_total * 0.65, 2)},
            {"name": "eu-west-1", "value": round(month_total * 0.20, 2)},
            {"name": "ap-southeast-1", "value": round(month_total * 0.10, 2)},
            {"name": "us-west-2", "value": round(month_total * 0.05, 2)},
        ]
        daily_for_month = [d for d in self._data["daily"] if d["date"].startswith(now.strftime("%Y-%m"))]
        month_from_daily = round(sum(d["cost"] for d in daily_for_month), 2)
        if month_from_daily > 0:
            self._data["month"] = month_from_daily

    def get_summary(self):
        with self._lock:
            out = dict(self._data)
            svc = out.get("byService", {})
            if isinstance(svc, dict):
                out["byService"] = [{"service": k, "cost": round(v, 2)} for k, v in svc.items()]
                out["byService"].sort(key=lambda x: x["cost"], reverse=True)
            return out

    def reset(self):
        with self._lock:
            self._data = {
                "today": BASE_COST,
                "yesterday": 0.0,
                "month": 0.0,
                "forecast": 0.0,
                "daily": [],
                "daily_last_month": [],
                "byService": {},
                "byRegion": [],
                "source": "simulation",
                "last_updated": datetime.now(timezone.utc).isoformat(),
            }
            self._write()


cost_engine = CostEngine()
