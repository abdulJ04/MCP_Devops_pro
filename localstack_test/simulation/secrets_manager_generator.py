import random
import string
from datetime import datetime, timezone
from .base_generator import BaseGenerator
from .logger import log
from .state_manager import state
from .event_bus import event_bus
from .cost_engine import cost_engine

SECRET_NAMES = [
    "prod/db-password", "prod/api-key", "prod/jwt-secret", "dev/stripe-key",
    "prod/redis-password", "staging/db-password", "prod/oauth-client-secret",
    "prod/ssl-private-key", "dev/github-token", "prod/docker-registry-auth",
]

SECRET_TEMPLATES = {
    "password": lambda: ''.join(random.choices(string.ascii_letters + string.digits + "!@#$%", k=16)),
    "api_key": lambda: f"sk-{''.join(random.choices(string.ascii_lowercase + string.digits, k=24))}",
    "jwt": lambda: f"eyJ{''.join(random.choices(string.ascii_letters + string.digits + '-_', k=40))}",
    "token": lambda: f"ghp_{''.join(random.choices(string.ascii_letters + string.digits, k=36))}",
}


class SecretsManagerGenerator(BaseGenerator):
    def __init__(self):
        super().__init__("SecretsMgr", 20)

    def generate(self):
        sm = self.get_client("secretsmanager")

        action = random.choices(
            ["create", "rotate", "delete", "get"],
            weights=[20, 30, 10, 40],
        )[0]

        if action == "create":
            name = random.choice(SECRET_NAMES)
            template_key = random.choice(list(SECRET_TEMPLATES.keys()))
            value = SECRET_TEMPLATES[template_key]()
            try:
                sm.create_secret(
                    Name=name,
                    SecretString=value,
                    Description=f"{template_key} for {name}",
                )
                state.add_resource("secrets", name, {"type": "secret"})
                cost_engine.record_realistic("SecretsManager")
                log.info(f"Created {name}", component=self.name)
                event_bus.publish("secrets.create", {"name": name})
            except Exception:
                pass

        elif action == "rotate":
            existing = state.list_resources("secrets")
            if existing:
                target = random.choice(existing)
                name = target["id"]
                try:
                    sm.get_secret_value(SecretId=name)
                    template_key = random.choice(list(SECRET_TEMPLATES.keys()))
                    new_value = SECRET_TEMPLATES[template_key]()
                    sm.put_secret_value(SecretId=name, SecretString=new_value)
                    cost_engine.record_realistic("SecretsManager")
                    log.info(f"Rotated {name}", component=self.name)
                    event_bus.publish("secrets.rotate", {"name": name})
                except Exception:
                    pass

        elif action == "delete":
            existing = state.list_resources("secrets")
            if existing:
                target = random.choice(existing)
                name = target["id"]
                try:
                    sm.delete_secret(SecretId=name, ForceDeleteWithoutRecovery=True)
                    state.remove_resource("secrets", name)
                    cost_engine.record_realistic("SecretsManager")
                    log.info(f"Deleted {name}", component=self.name)
                    event_bus.publish("secrets.delete", {"name": name})
                except Exception:
                    pass

        elif action == "get":
            existing = state.list_resources("secrets")
            if existing:
                target = random.choice(existing)
                name = target["id"]
                try:
                    sm.get_secret_value(SecretId=name)
                    cost_engine.record_realistic("SecretsManager")
                except Exception:
                    pass

    def discover_existing(self):
        sm = self.get_client("secretsmanager")
        try:
            secrets = sm.list_secrets().get("SecretList", [])
            for s in secrets:
                name = s["Name"]
                if not state.resource_exists("secrets", name):
                    state.add_resource("secrets", name, {"type": "secret"})
            log.info(f"Discovered {len(secrets)} secrets", component=self.name)
        except Exception:
            pass
