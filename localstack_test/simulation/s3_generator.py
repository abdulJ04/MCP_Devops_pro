import random
import json
from datetime import datetime, timezone
from .base_generator import BaseGenerator
from .logger import log
from .state_manager import state
from .event_bus import event_bus
from .cost_engine import cost_engine

DEPT_BUCKETS = {
    "hr": ["hr-data"],
    "finance": ["finance-data"],
    "engineering": ["dev-backup", "app-uploads"],
    "devops": ["logs-bucket", "monitoring-data", "prod-backup"],
    "marketing": ["images-bucket"],
}

OBJECT_NAMES = {
    "hr": ["employees.csv", "payroll.json", "onboarding.docx", "performance.pdf", "policies.txt"],
    "finance": ["q4-report.pdf", "budget.xlsx", "invoices.csv", "tax2026.pdf", "audit.log"],
    "engineering": ["deploy-config.json", "docker-compose.yml", "terraform.tf", "main.py", "requirements.txt"],
    "devops": ["deploy.log", "metrics.json", "alert-config.yml", "backup.tar.gz", "healthcheck.py"],
    "marketing": ["logo.png", "banner.jpg", "campaign.pdf", "social-post.png", "analytics.csv"],
}

FILE_SIZES = ["1KB", "10KB", "100KB", "512KB", "1MB", "5MB"]


class S3Generator(BaseGenerator):
    def __init__(self):
        super().__init__("S3", 8)

    def generate(self):
        s3 = self.get_client("s3")

        dept = random.choice(state.get_all_depts())
        buckets = DEPT_BUCKETS.get(dept, ["dev-backup"])
        bucket = random.choice(buckets)

        action = random.choices(
            ["upload", "delete", "list", "lifecycle"],
            weights=[50, 15, 25, 10],
        )[0]

        if action == "upload":
            obj_name = random.choice(OBJECT_NAMES.get(dept, OBJECT_NAMES["engineering"]))
            size_str = random.choice(FILE_SIZES)
            size_bytes = int(size_str.replace("KB", "000").replace("MB", "000000").replace("B", ""))
            content = json.dumps({
                "id": random.randint(1, 999999),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "dept": dept,
                "content": f"Sample data for {obj_name}",
                "size": size_str,
            })
            try:
                s3.put_object(Bucket=bucket, Key=obj_name, Body=content)
                cost_engine.record_realistic("S3")
                state.increment("s3_upload")
                log.info(f"s3://{bucket}/{obj_name} ({size_str})", component=self.name)
                event_bus.publish("s3.put_object", {"bucket": bucket, "key": obj_name, "size": size_str, "dept": dept})
            except Exception as e:
                if "NoSuchBucket" in str(e):
                    try:
                        s3.create_bucket(Bucket=bucket)
                        cost_engine.record_realistic("S3")
                        log.info(f"Created bucket s3://{bucket}", component=self.name)
                    except Exception:
                        pass

        elif action == "delete":
            try:
                resp = s3.list_objects_v2(Bucket=bucket, MaxKeys=10)
                contents = resp.get("Contents", [])
                if contents:
                    obj = random.choice(contents)
                    s3.delete_object(Bucket=bucket, Key=obj["Key"])
                    cost_engine.record_realistic("S3")
                    log.info(f"Deleted s3://{bucket}/{obj['Key']}", component=self.name)
                    event_bus.publish("s3.delete_object", {"bucket": bucket, "key": obj["Key"]})
            except Exception:
                pass

        elif action == "lifecycle":
            try:
                s3.put_bucket_lifecycle_configuration(
                    Bucket=bucket,
                    LifecycleConfiguration={
                        "Rules": [
                            {
                                "ID": f"auto-archive-{random.randint(1,100)}",
                                "Status": "Enabled",
                                "Prefix": "",
                                "Transitions": [
                                    {"Days": 30, "StorageClass": "STANDARD_IA"},
                                    {"Days": 90, "StorageClass": "GLACIER"},
                                ],
                                "Expiration": {"Days": 365},
                            }
                        ]
                    },
                )
                cost_engine.record_realistic("S3")
                log.info(f"Lifecycle updated on {bucket}", component=self.name)
            except Exception:
                pass

    def discover_existing(self):
        s3 = self.get_client("s3")
        try:
            buckets = s3.list_buckets().get("Buckets", [])
            for b in buckets:
                name = b["Name"]
                if not state.resource_exists("s3", name):
                    state.add_resource("s3", name, {"name": name, "created": str(b.get("CreationDate", ""))})
            log.info(f"Discovered {len(buckets)} buckets", component=self.name)
        except Exception:
            pass
