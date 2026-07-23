import random
from datetime import datetime, timezone


class BusinessHours:
    def __init__(self, timezone_offset=0):
        self.tz = timezone.utc

    def get_activity_multiplier(self) -> float:
        now = datetime.now(self.tz)
        hour = now.hour
        weekday = now.weekday()

        if weekday >= 5:
            return 0.1

        if 9 <= hour < 12:
            return 1.0
        if 12 <= hour < 14:
            return 0.5
        if 14 <= hour < 18:
            return 0.9
        if 18 <= hour < 22:
            return 0.3
        return 0.1

    def should_act(self, base_chance: float = 0.6) -> bool:
        multiplier = self.get_activity_multiplier()
        roll = random.random()
        threshold = base_chance * multiplier
        return roll < threshold

    def is_business_hours(self) -> bool:
        now = datetime.now(self.tz)
        return now.weekday() < 5 and 9 <= now.hour < 18


business_hours = BusinessHours()
