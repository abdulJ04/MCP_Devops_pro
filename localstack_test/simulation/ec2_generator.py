import random
import time as time_module
from datetime import datetime, timezone
from .base_generator import BaseGenerator
from .logger import log
from .state_manager import state
from .event_bus import event_bus
from .cost_engine import cost_engine

INSTANCE_TYPES = ["t2.micro", "t3.small", "t3.medium", "m5.large", "c5.xlarge"]
AMI_ID = "ami-0c55b159cbfafe1f0"

INSTANCE_NAMES = [
    "prod-app-01", "prod-app-02", "prod-api-01", "prod-worker-01",
    "dev-api-01", "dev-worker-01", "staging-app-01",
    "monitoring-01", "build-server-01", "cache-01",
]

INSTANCE_ACTIONS = ["launch", "stop", "start", "terminate", "modify", "describe"]


class EC2Generator(BaseGenerator):
    def __init__(self):
        super().__init__("EC2", 15)

    def generate(self):
        ec2 = self.get_client("ec2")
        cw = self.get_client("cloudwatch")

        action = random.choices(
            INSTANCE_ACTIONS,
            weights=[15, 20, 15, 5, 10, 35],
        )[0]

        if action == "launch":
            instance_type = random.choice(INSTANCE_TYPES)
            name = random.choice(INSTANCE_NAMES)
            try:
                resp = ec2.run_instances(
                    ImageId=AMI_ID,
                    InstanceType=instance_type,
                    MaxCount=1,
                    MinCount=1,
                    TagSpecifications=[{
                        "ResourceType": "instance",
                        "Tags": [
                            {"Key": "Name", "Value": name},
                            {"Key": "Environment", "Value": random.choice(["production", "staging", "development"])},
                            {"Key": "Dept", "Value": random.choice(state.get_all_depts())},
                            {"Key": "CostCenter", "Value": f"CC-{random.randint(100,999)}"},
                        ],
                    }],
                )
                instance_id = resp["Instances"][0]["InstanceId"]
                state.add_resource("ec2", instance_id, {
                    "name": name,
                    "type": instance_type,
                    "state": "running",
                })
                cost_engine.record_realistic("EC2")
                state.increment("ec2_launch")
                log.info(f"{name} ({instance_id}) {instance_type} Running", component=self.name)
                event_bus.publish("ec2.run_instances", {"instance_id": instance_id, "name": name})

                self._put_metric(cw, instance_id, "CPUUtilization", random.uniform(5, 30))
                self._put_metric(cw, instance_id, "NetworkIn", random.randint(100000, 5000000))
                self._put_metric(cw, instance_id, "NetworkOut", random.randint(50000, 2000000))
            except Exception:
                pass

        elif action == "stop":
            running = [r for r in state.list_resources("ec2") if r.get("metadata", {}).get("state") == "running"]
            if running:
                target = random.choice(running)
                iid = target["id"]
                try:
                    ec2.stop_instances(InstanceIds=[iid])
                    state.set(f"ec2.{iid}.metadata.state", "stopped")
                    cost_engine.record_realistic("EC2")
                    log.info(f"Stopped {target['metadata'].get('name', iid)}", component=self.name)
                    event_bus.publish("ec2.stop_instances", {"instance_id": iid})
                except Exception:
                    pass

        elif action == "start":
            stopped = [r for r in state.list_resources("ec2") if r.get("metadata", {}).get("state") == "stopped"]
            if stopped:
                target = random.choice(stopped)
                iid = target["id"]
                try:
                    ec2.start_instances(InstanceIds=[iid])
                    state.set(f"ec2.{iid}.metadata.state", "running")
                    cost_engine.record_realistic("EC2")
                    log.info(f"Started {target['metadata'].get('name', iid)}", component=self.name)
                    event_bus.publish("ec2.start_instances", {"instance_id": iid})
                except Exception:
                    pass

        elif action == "terminate":
            all_instances = state.list_resources("ec2")
            if all_instances:
                target = random.choice(all_instances)
                iid = target["id"]
                try:
                    ec2.terminate_instances(InstanceIds=[iid])
                    state.remove_resource("ec2", iid)
                    cost_engine.record_realistic("EC2")
                    log.info(f"Terminated {target['metadata'].get('name', iid)}", component=self.name)
                    event_bus.publish("ec2.terminate_instances", {"instance_id": iid})
                except Exception:
                    pass

        elif action == "modify":
            all_instances = state.list_resources("ec2")
            if all_instances:
                target = random.choice(all_instances)
                iid = target["id"]
                try:
                    new_type = random.choice(INSTANCE_TYPES)
                    ec2.modify_instance_attribute(
                        InstanceId=iid,
                        InstanceType={"Value": new_type},
                    )
                    cost_engine.record_realistic("EC2")
                    log.info(f"Modified {iid} to {new_type}", component=self.name)
                except Exception:
                    pass

        running = state.list_resources("ec2")
        for inst in running:
            if inst.get("metadata", {}).get("state") == "running":
                iid = inst["id"]
                cpu = random.uniform(10, 95)
                mem = random.uniform(20, 90)
                disk = random.uniform(10, 80)
                self._put_metric(cw, iid, "CPUUtilization", cpu)
                self._put_metric(cw, iid, "MemoryUtilization", mem)
                self._put_metric(cw, iid, "DiskReadOps", random.randint(100, 10000))
                self._put_metric(cw, iid, "DiskWriteOps", random.randint(50, 5000))

                if cpu > 90:
                    event_bus.publish("ec2.cpu_high", {"instance_id": iid, "cpu": cpu})

    def _put_metric(self, cw, instance_id, metric_name, value):
        try:
            cw.put_metric_data(
                Namespace="AWS/EC2",
                MetricData=[{
                    "MetricName": metric_name,
                    "Dimensions": [{"Name": "InstanceId", "Value": instance_id}],
                    "Value": value,
                    "Unit": "Percent" if metric_name in ("CPUUtilization", "MemoryUtilization") else "Count",
                    "Timestamp": datetime.now(timezone.utc),
                }],
            )
        except Exception:
            pass

    def discover_existing(self):
        ec2 = self.get_client("ec2")
        try:
            resp = ec2.describe_instances()
            for r in resp.get("Reservations", []):
                for inst in r.get("Instances", []):
                    iid = inst["InstanceId"]
                    name = "unknown"
                    for tag in inst.get("Tags", []):
                        if tag["Key"] == "Name":
                            name = tag["Value"]
                    if not state.resource_exists("ec2", iid):
                        state.add_resource("ec2", iid, {
                            "name": name,
                            "type": inst.get("InstanceType", "t2.micro"),
                            "state": inst.get("State", {}).get("Name", "running"),
                        })
            log.info(f"Discovered existing EC2 instances", component=self.name)
        except Exception:
            pass
