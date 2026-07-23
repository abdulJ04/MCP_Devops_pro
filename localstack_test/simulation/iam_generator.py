import random
import string
from datetime import datetime, timezone
from .base_generator import BaseGenerator
from .logger import log
from .state_manager import state
from .event_bus import event_bus
from .cost_engine import cost_engine

USER_NAMES = [
    "john.doe", "jane.smith", "mike.chen", "sarah.wilson", "alex.kumar",
    "lisa.park", "tom.brown", "emma.davis", "ryan.jones", "nina.patel",
]

GROUP_NAMES = ["Admins", "Developers", "DevOps", "Security", "Auditors", "DataEngineers"]

POLICY_DOCS = {
    "FullAccess": {
        "Version": "2012-10-17",
        "Statement": [{"Effect": "Allow", "Action": "*", "Resource": "*"}],
    },
    "ReadOnly": {
        "Version": "2012-10-17",
        "Statement": [{"Effect": "Allow", "Action": ["s3:Get*", "s3:List*", "ec2:Describe*"], "Resource": "*"}],
    },
    "S3Access": {
        "Version": "2012-10-17",
        "Statement": [{"Effect": "Allow", "Action": ["s3:Get*", "s3:Put*", "s3:List*"], "Resource": "*"}],
    },
    "LambdaAccess": {
        "Version": "2012-10-17",
        "Statement": [{"Effect": "Allow", "Action": ["lambda:Invoke*", "lambda:List*"], "Resource": "*"}],
    },
}


class IAMGenerator(BaseGenerator):
    def __init__(self):
        super().__init__("IAM", 15)

    def generate(self):
        iam = self.get_client("iam")
        action = random.choices(
            ["create_user", "delete_user", "rotate_keys", "attach_policy", "create_group"],
            weights=[25, 10, 30, 20, 15],
        )[0]

        if action == "create_user":
            name = random.choice(USER_NAMES) + f"-{random.randint(1,999)}"
            try:
                iam.create_user(UserName=name)
                state.add_resource("iam", name, {"type": "user", "active": True})
                cost_engine.record_realistic("IAM")
                log.info(f"Created user {name}", component=self.name)
                event_bus.publish("iam.create_user", {"user": name})

                if random.random() < 0.7:
                    resp = iam.create_access_key(UserName=name)
                    log.info(f"  AccessKey created for {name}", component=self.name)
                    event_bus.publish("iam.create_access_key", {"user": name})

                for group in random.sample(GROUP_NAMES, min(2, len(GROUP_NAMES))):
                    try:
                        iam.add_user_to_group(GroupName=group, UserName=name)
                    except Exception:
                        try:
                            iam.create_group(GroupName=group)
                            iam.add_user_to_group(GroupName=group, UserName=name)
                        except Exception:
                            pass
            except Exception:
                pass

        elif action == "delete_user":
            users = state.list_resources("iam")
            active_users = [u for u in users if u.get("metadata", {}).get("type") == "user"]
            if active_users:
                target = random.choice(active_users)
                name = target["id"]
                try:
                    try:
                        keys = iam.list_access_keys(UserName=name).get("AccessKeyMetadata", [])
                        for k in keys:
                            iam.delete_access_key(UserName=name, AccessKeyId=k["AccessKeyId"])
                    except Exception:
                        pass
                    iam.delete_user(UserName=name)
                    state.remove_resource("iam", name)
                    cost_engine.record_realistic("IAM")
                    log.info(f"Deleted user {name}", component=self.name)
                    event_bus.publish("iam.delete_user", {"user": name})
                except Exception:
                    pass

        elif action == "rotate_keys":
            users = state.list_resources("iam")
            active_users = [u for u in users if u.get("metadata", {}).get("type") == "user"]
            if active_users:
                name = random.choice(active_users)["id"]
                try:
                    keys = iam.list_access_keys(UserName=name).get("AccessKeyMetadata", [])
                    if keys:
                        old_key = keys[0]["AccessKeyId"]
                        iam.update_access_key(UserName=name, AccessKeyId=old_key, Status="Inactive")
                        iam.create_access_key(UserName=name)
                        iam.delete_access_key(UserName=name, AccessKeyId=old_key)
                        cost_engine.record_realistic("IAM")
                        log.info(f"Rotated keys for {name}", component=self.name)
                        event_bus.publish("iam.rotate_keys", {"user": name})
                except Exception:
                    pass

        elif action == "attach_policy":
            users = state.list_resources("iam")
            active_users = [u for u in users if u.get("metadata", {}).get("type") == "user"]
            if active_users:
                name = random.choice(active_users)["id"]
                policy_name = random.choice(list(POLICY_DOCS.keys()))
                try:
                    try:
                        resp = iam.create_policy(
                            PolicyName=policy_name,
                            PolicyDocument=json.dumps(POLICY_DOCS[policy_name]),
                        )
                        policy_arn = resp["Policy"]["Arn"]
                    except Exception:
                        policy_arn = f"arn:aws:iam::000000000000:policy/{policy_name}"
                    try:
                        iam.attach_user_policy(UserName=name, PolicyArn=policy_arn)
                        cost_engine.record_realistic("IAM")
                        log.info(f"Attached {policy_name} to {name}", component=self.name)
                        event_bus.publish("iam.attach_policy", {"user": name, "policy": policy_name})
                    except Exception:
                        pass
                except Exception:
                    pass

    def discover_existing(self):
        iam = self.get_client("iam")
        try:
            users = iam.list_users().get("Users", [])
            for u in users:
                name = u["UserName"]
                if not state.resource_exists("iam", name):
                    state.add_resource("iam", name, {"type": "user"})
            log.info(f"Discovered {len(users)} IAM users", component=self.name)
        except Exception:
            pass


import json
