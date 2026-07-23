import json
import os
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

STATE_FILE = os.path.join(os.path.dirname(__file__), "..", "sim_state.json")


class StateManager:
    def __init__(self, state_file: str = STATE_FILE):
        self._lock = threading.RLock()
        self._state_file = state_file
        self._state: Dict[str, Any] = {
            "ec2": {},
            "s3": {},
            "iam": {},
            "lambda": {},
            "dynamodb": {},
            "sqs": {},
            "sns": {},
            "secrets": {},
            "cost": {
                "today": 0.0,
                "month": 0.0,
                "forecast": 0.0,
                "by_service": {},
                "daily": [],
            },
            "depts": {
                "hr": {"name": "HR", "services": ["s3", "dynamodb", "secrets"]},
                "finance": {"name": "Finance", "services": ["s3", "dynamodb", "sqs", "sns"]},
                "engineering": {"name": "Engineering", "services": ["lambda", "dynamodb", "s3", "sqs", "ec2", "iam"]},
                "devops": {"name": "DevOps", "services": ["ec2", "lambda", "iam", "s3", "cloudwatch"]},
                "qa": {"name": "QA", "services": ["lambda", "dynamodb", "s3"]},
                "security": {"name": "Security", "services": ["iam", "secrets", "cloudtrail"]},
                "operations": {"name": "Operations", "services": ["ec2", "s3", "cloudwatch", "sns"]},
                "marketing": {"name": "Marketing", "services": ["s3", "sns", "dynamodb"]},
            },
        }
        self._init_counters()
        self._load()

    def _init_counters(self):
        self._state.setdefault("counters", {})
        for key in ("ec2_launch", "s3_upload", "lambda_invoke", "iam_create", "dynamodb_write", "sqs_send"):
            self._state["counters"].setdefault(key, 0)

    def _load(self):
        try:
            if os.path.exists(self._state_file):
                with open(self._state_file) as f:
                    data = json.load(f)
                    for k, v in data.items():
                        if k == "cost":
                            for ck in ("today", "month", "forecast", "by_service", "daily"):
                                if ck in v:
                                    self._state["cost"][ck] = v[ck]
                        elif k in self._state:
                            if isinstance(v, dict):
                                self._state[k].update(v)
                            else:
                                self._state[k] = v
        except Exception:
            pass

    def _save(self):
        try:
            with open(self._state_file, "w") as f:
                json.dump(self._state, f, indent=2)
        except Exception:
            pass

    def get(self, key: str, default=None):
        with self._lock:
            keys = key.split(".")
            val = self._state
            for k in keys:
                if isinstance(val, dict):
                    val = val.get(k)
                else:
                    return default
            return val if val is not None else default

    def set(self, key: str, value: Any):
        with self._lock:
            keys = key.split(".")
            target = self._state
            for k in keys[:-1]:
                target = target.setdefault(k, {})
            target[keys[-1]] = value
            self._save()

    def update(self, key: str, value: Any):
        with self._lock:
            keys = key.split(".")
            target = self._state
            for k in keys[:-1]:
                target = target.setdefault(k, {})
            if isinstance(target.get(keys[-1]), dict) and isinstance(value, dict):
                target[keys[-1]].update(value)
            else:
                target[keys[-1]] = value
            self._save()

    def increment(self, key: str, amount: int = 1):
        with self._lock:
            current = self.get(key, 0)
            self.set(key, current + amount)
            return current + amount

    def resource_exists(self, service: str, resource_id: str) -> bool:
        with self._lock:
            resources = self._state.get(service, {})
            return resource_id in resources

    def add_resource(self, service: str, resource_id: str, metadata: dict = None):
        with self._lock:
            self._state.setdefault(service, {})[resource_id] = {
                "id": resource_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "metadata": metadata or {},
                "active": True,
            }
            self._save()

    def remove_resource(self, service: str, resource_id: str):
        with self._lock:
            if resource_id in self._state.get(service, {}):
                self._state[service][resource_id]["active"] = False
                self._state[service][resource_id]["deleted_at"] = datetime.now(timezone.utc).isoformat()
                self._save()

    def get_resource(self, service: str, resource_id: str) -> Optional[Dict]:
        with self._lock:
            return self._state.get(service, {}).get(resource_id)

    def list_resources(self, service: str, active_only: bool = True) -> List[Dict]:
        with self._lock:
            resources = self._state.get(service, {}).values()
            if active_only:
                resources = [r for r in resources if r.get("active", True)]
            return list(resources)

    def add_cost(self, service: str, amount: float):
        with self._lock:
            c = self._state["cost"]
            c["today"] = c.get("today", 0) + amount
            c["month"] = c.get("month", 0) + amount
            c.setdefault("by_service", {})
            c["by_service"][service] = c["by_service"].get(service, 0) + amount

    def get_cost_summary(self) -> Dict:
        with self._lock:
            return dict(self._state["cost"])

    def get_dept_services(self, dept: str) -> List[str]:
        with self._lock:
            return self._state.get("depts", {}).get(dept, {}).get("services", [])

    def get_all_depts(self) -> List[str]:
        with self._lock:
            return list(self._state.get("depts", {}).keys())

    def get_active_ec2_count(self) -> int:
        return len([r for r in self.list_resources("ec2") if r.get("metadata", {}).get("state") == "running"])

    def get_all_resources(self) -> Dict:
        with self._lock:
            return dict(self._state)

    def reset(self):
        with self._lock:
            self._state = {
                "ec2": {},
                "s3": {},
                "iam": {},
                "lambda": {},
                "dynamodb": {},
                "sqs": {},
                "sns": {},
                "secrets": {},
                "cost": {"today": 0.0, "month": 0.0, "forecast": 0.0, "by_service": {}, "daily": []},
                "counters": {},
                "depts": self._state.get("depts", {}),
            }
            self._init_counters()
            self._save()


state = StateManager()
