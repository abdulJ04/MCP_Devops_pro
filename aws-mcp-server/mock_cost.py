"""Mock cost data generator for LocalStack testing."""
import random
import hashlib
from datetime import datetime, timedelta, timezone


def _day_seed(date_str: str) -> int:
    """Generate a deterministic seed from a date string."""
    return int(hashlib.md5(date_str.encode()).hexdigest()[:8], 16)


def get_mock_cost_data() -> dict:
    """Generate deterministic mock cost data (same values for same day)."""
    now = datetime.now(timezone.utc)
    day_of_month = now.day
    today_str = now.strftime("%Y-%m-%d")

    # Seeded random for today — same value all day
    rng = random.Random(_day_seed(today_str))
    today_cost = round(45.00 + rng.uniform(-5, 15), 2)
    if day_of_month == 20:
        today_cost = 85.23

    # Yesterday
    yesterday_str = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    rng_y = random.Random(_day_seed(yesterday_str))
    yesterday_cost = round(45.00 + rng_y.uniform(-3, 8), 2)

    # Generate 30 days of daily cost (deterministic per day)
    daily = []
    for i in range(30):
        d = now - timedelta(days=29 - i)
        ds = d.strftime("%Y-%m-%d")
        r = random.Random(_day_seed(ds))
        day_cost = round(45.00 + r.uniform(-8, 18), 2)
        if d.day == 20:
            day_cost = 85.23
        daily.append({"date": ds, "cost": day_cost})

    # Cumulative month cost from daily
    month_cost = round(sum(d["cost"] for d in daily), 2)
    forecast = round((month_cost / max(day_of_month, 1)) * 30, 2)

    # Last month daily costs (deterministic)
    last_month = now.month - 1 if now.month > 1 else 12
    last_month_year = now.year if now.month > 1 else now.year - 1
    import calendar
    days_in_last_month = calendar.monthrange(last_month_year, last_month)[1]
    daily_last_month = []
    for d in range(1, days_in_last_month + 1):
        ds = f"{last_month_year}-{last_month:02d}-{d:02d}"
        r = random.Random(_day_seed(ds))
        day_cost = round(45.00 + r.uniform(-8, 18), 2)
        if d == 20:
            day_cost = 85.23
        daily_last_month.append({"date": ds, "cost": day_cost})

    # Service breakdown (proportional to month cost)
    services = [
        ("Amazon Elastic Compute Cloud - Compute", 0.35),
        ("Amazon Relational Database Service", 0.22),
        ("Amazon Simple Storage Service", 0.12),
        ("Amazon Lambda", 0.08),
        ("Amazon CloudFront", 0.07),
        ("Amazon ElastiCache", 0.06),
        ("Amazon Route 53", 0.03),
        ("Amazon Simple Queue Service", 0.02),
        ("Other", 0.05),
    ]
    by_service = []
    for svc_name, pct in services:
        cost = round(month_cost * pct, 2)
        by_service.append({"service": svc_name, "cost": cost})
    by_service.sort(key=lambda x: x["cost"], reverse=True)

    # Region breakdown
    regions = [
        ("us-east-1", 0.65),
        ("eu-west-1", 0.20),
        ("ap-southeast-1", 0.10),
        ("us-west-2", 0.05),
    ]
    by_region = []
    for region_name, pct in regions:
        value = round(month_cost * pct, 2)
        by_region.append({"name": region_name, "value": value})
    by_region.sort(key=lambda x: x["value"], reverse=True)

    return {
        "today": today_cost,
        "yesterday": yesterday_cost,
        "month": month_cost,
        "forecast": forecast,
        "daily": daily,
        "daily_last_month": daily_last_month,
        "byService": by_service,
        "byRegion": by_region,
        "source": "mock",
    }


def get_mock_budgets() -> list:
    """Generate realistic mock budget data for LocalStack testing."""
    return [
        {"name": "Monthly Total Spend", "type": "COST", "timeUnit": "MONTHLY", "amount": "2000.00", "spent": "1448.91"},
        {"name": "EC2 Compute Spend", "type": "COST", "timeUnit": "MONTHLY", "amount": "800.00", "spent": "507.12"},
        {"name": "RDS Database Spend", "type": "COST", "timeUnit": "MONTHLY", "amount": "500.00", "spent": "318.76"},
    ]
