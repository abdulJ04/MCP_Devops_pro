import threading
from typing import Callable, Dict, List


class EventBus:
    def __init__(self):
        self._lock = threading.RLock()
        self._subscribers: Dict[str, List[Callable]] = {}
        self._event_history: List[dict] = []
        self._max_history = 1000

    def subscribe(self, event_type: str, callback: Callable):
        with self._lock:
            if event_type not in self._subscribers:
                self._subscribers[event_type] = []
            self._subscribers[event_type].append(callback)

    def unsubscribe(self, event_type: str, callback: Callable):
        with self._lock:
            if event_type in self._subscribers:
                self._subscribers[event_type] = [
                    cb for cb in self._subscribers[event_type] if cb != callback
                ]

    def publish(self, event_type: str, data: dict = None):
        with self._lock:
            entry = {"type": event_type, "data": data or {}}
            self._event_history.append(entry)
            if len(self._event_history) > self._max_history:
                self._event_history.pop(0)
            subs = list(self._subscribers.get(event_type, []))
            wildcard_subs = list(self._subscribers.get("*", []))

        for cb in subs:
            try:
                cb(entry)
            except Exception:
                pass
        for cb in wildcard_subs:
            try:
                cb(entry)
            except Exception:
                pass

    def get_recent_events(self, n: int = 50) -> List[dict]:
        with self._lock:
            return list(self._event_history[-n:])


event_bus = EventBus()
