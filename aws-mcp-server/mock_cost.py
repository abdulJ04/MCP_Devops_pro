"""Mock cost data generator for LocalStack testing."""
import random
from datetime import datetime, timedelta, timezone


def get_mock_cost_data() -> dict:
    """Generate realistic mock cost data for LocalStack testing.

    Returns cost data in the same format as the real /cost endpoint.
    Used when use_localstack=True (since LocalStack doesn't support Cost Explorer).

    For testing alerts:
    - Simulates a cost spike on day 20 of each month ($85.23)
    - Other days: $40-$60 range
    """
    now = datetime.now(timezone.utc)
    day_of_month = now.day

    # Base daily cost with variation
    base_cost = 45.00
    variation = random.uniform(-5, 15)
    today_cost = round(base_cost + variation, 2)

    # Simulate cost spike on day 20 (for testing $70 limit)
    if day_of_month == 20:
        today_cost = 85.23

    # Yesterday's cost
    yesterday_cost = round(base_cost + random.uniform(-3, 8), 2)

    # Month-to-date cost (accumulating)
    month_cost = round(today_cost * day_of_month * 0.85, 2)

    # Forecast (extrapolate to end of month)
    days_in_month = 30
    forecast = round((month_cost / day_of_month) * days_in_month, 2)

    # Generate 30 days of daily cost history
    daily = []
    for i in range(30):
        date = (now - timedelta(days=29 - i)).strftime("%Y-%m-%d")
        day_cost = round(base_cost + random.uniform(-8, 18), 2)
        # Spike on day 20
        if (now - timedelta(days=29 - i)).day == 20:
            day_cost = 85.23
        daily.append({"date": date, "cost": day_cost})

    # Generate last month daily costs (same structure, offset by 1 month)
    last_month = now.month - 1 if now.month > 1 else 12
    last_month_year = now.year if now.month > 1 else now.year - 1
    import calendar
    days_in_last_month = calendar.monthrange(last_month_year, last_month)[1]
    daily_last_month = []
    for d in range(1, days_in_last_month + 1):
        date_str = f"{last_month_year}-{last_month:02d}-{d:02d}"
        day_cost = round(base_cost + random.uniform(-8, 18), 2)
        if d == 20:
            day_cost = 85.23
        daily_last_month.append({"date": date_str, "cost": day_cost})

    # Service breakdown (realistic AWS service names)
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
    """Generate realistic mock budget data for LocalStack testing.

    Returns in the format the frontend BudgetsTab expects:
    name, type, amount, spent, timeUnit.
    """
    now = datetime.now(timezone.utc)
    return [
        {
            "name": "Monthly Total Spend",
            "type": "COST",
            "timeUnit": "MONTHLY",
            "amount": "2000.00",
            "spent": "1448.91",
        },
        {
            "name": "EC2 Compute Spend",
            "type": "COST",
            "timeUnit": "MONTHLY",
            "amount": "800.00",
            "spent": "507.12",
        },
        {
            "name": "RDS Database Spend",
            "type": "COST",
            "timeUnit": "MONTHLY",
            "amount": "500.00",
            "spent": "318.76",
        },
    ]
