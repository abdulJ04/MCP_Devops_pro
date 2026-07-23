import threading
import time as time_module
from abc import ABC, abstractmethod
from .logger import log
from .state_manager import state
from .event_bus import event_bus
from .cost_engine import cost_engine


class BaseGenerator(ABC):
    def __init__(self, name: str, interval: int):
        self.name = name
        self.interval = interval
        self._running = False
        self._thread = None
        self._lock = threading.RLock()
        self._clients = {}

    @abstractmethod
    def generate(self):
        pass

    def run_once(self):
        try:
            self.generate()
        except Exception as e:
            log.error(f"{self.name}: {e}", component=self.name)

    def start(self):
        self._running = True
        log.info(f"Started (interval={self.interval}s)", component=self.name)
        self._thread = threading.Thread(target=self._loop, daemon=True, name=self.name)
        self._thread.start()

    def stop(self):
        self._running = False
        log.info(f"Stopped", component=self.name)

    def _loop(self):
        while self._running:
            self.run_once()
            time_module.sleep(self.interval)

    def get_client(self, service: str):
        if service in self._clients:
            return self._clients[service]
        import boto3
        endpoint = "http://localhost:4566"
        client = boto3.client(
            service,
            endpoint_url=endpoint,
            region_name="us-east-1",
            aws_access_key_id="test",
            aws_secret_access_key="test",
        )
        self._clients[service] = client
        return client
