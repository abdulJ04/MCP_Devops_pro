"""SQLite database models for cost alert + report system."""
import os
import json
from sqlalchemy import create_engine, Column, Integer, Float, String, Boolean, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

Base = declarative_base()

DB_PATH = os.path.join(os.path.dirname(__file__), "cost_alerts.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class CostAlertConfig(Base):
    """Persistent alert configuration — survives server restarts."""
    __tablename__ = "cost_alert_config"

    id = Column(Integer, primary_key=True, default=1)
    daily_limit = Column(Float, default=70.0)
    monthly_limit = Column(Float, default=2000.0)
    email = Column(String(255), default="")
    smtp_host = Column(String(255), default="")
    smtp_port = Column(Integer, default=465)
    smtp_user = Column(String(255), default="")
    smtp_password = Column(String(255), default="")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CostHistory(Base):
    """Historical cost data for tracking trends."""
    __tablename__ = "cost_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(String(10), nullable=False)
    cost = Column(Float, nullable=False)
    source = Column(String(20), default="real")  # 'real' or 'mock'
    fetched_at = Column(DateTime, default=datetime.utcnow)


class CostAlertLog(Base):
    """Audit trail for sent alerts."""
    __tablename__ = "cost_alert_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    alert_type = Column(String(50), nullable=False)  # 'daily' or 'monthly'
    current_cost = Column(Float, nullable=False)
    threshold = Column(Float, nullable=False)
    channel = Column(String(20), nullable=False)  # 'email', 'dashboard'
    message = Column(Text, default="")
    sent_at = Column(DateTime, default=datetime.utcnow)


class ReportConfig(Base):
    """Report scheduling and delivery configuration — opt-in feature."""
    __tablename__ = "report_config"

    id = Column(Integer, primary_key=True, default=1)
    is_enabled = Column(Boolean, default=False)
    report_type = Column(String(20), default="daily")  # daily, weekly, monthly
    schedule_hour = Column(Integer, default=8)
    schedule_minute = Column(Integer, default=0)
    schedule_day_of_week = Column(Integer, default=0)  # 0=Mon, 6=Sun
    schedule_day_of_month = Column(Integer, default=1)
    recipients = Column(Text, default="")
    include_anomaly_detection = Column(Boolean, default=True)
    include_service_breakdown = Column(Boolean, default=True)
    include_region_breakdown = Column(Boolean, default=True)
    include_yesterday_comparison = Column(Boolean, default=True)
    google_sheets_enabled = Column(Boolean, default=False)
    google_sheets_id = Column(String(255), default="")
    google_sheets_tab = Column(String(255), default="")
    apps_script_url = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ReportHistory(Base):
    """Historical record of generated reports."""
    __tablename__ = "report_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    report_type = Column(String(20), nullable=False)
    report_date = Column(String(10), nullable=False)
    period_start = Column(String(10), nullable=False)
    period_end = Column(String(10), nullable=False)
    total_cost = Column(Float, nullable=False)
    yesterday_cost = Column(Float, default=0)
    month_cost = Column(Float, default=0)
    forecast = Column(Float, default=0)
    top_services_json = Column(Text, default="[]")
    region_breakdown_json = Column(Text, default="[]")
    anomaly_score = Column(Float, default=0)
    anomaly_details = Column(Text, default="")
    email_sent = Column(Boolean, default=False)
    email_recipients = Column(Text, default="")
    google_sheets_uploaded = Column(Boolean, default=False)
    generated_at = Column(DateTime, default=datetime.utcnow)
    source = Column(String(20), default="real")


def init_db():
    """Create all tables if they don't exist."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_config():
    """Get or create default alert config."""
    db = SessionLocal()
    try:
        config = db.query(CostAlertConfig).filter(CostAlertConfig.id == 1).first()
        if not config:
            config = CostAlertConfig(id=1)
            db.add(config)
            db.commit()
            db.refresh(config)
        return config
    finally:
        db.close()


def update_config(**kwargs):
    """Update alert config fields."""
    db = SessionLocal()
    try:
        config = db.query(CostAlertConfig).filter(CostAlertConfig.id == 1).first()
        if not config:
            config = CostAlertConfig(id=1)
            db.add(config)
        for key, value in kwargs.items():
            if hasattr(config, key):
                setattr(config, key, value)
        config.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(config)
        return config
    finally:
        db.close()


def add_cost_history(date: str, cost: float, source: str = "real"):
    """Add a cost history entry."""
    db = SessionLocal()
    try:
        entry = CostHistory(date=date, cost=cost, source=source)
        db.add(entry)
        db.commit()
    finally:
        db.close()


def add_alert_log(alert_type: str, current_cost: float, threshold: float, channel: str, message: str = ""):
    """Add an alert log entry."""
    db = SessionLocal()
    try:
        log = CostAlertLog(
            alert_type=alert_type,
            current_cost=current_cost,
            threshold=threshold,
            channel=channel,
            message=message,
        )
        db.add(log)
        db.commit()
    finally:
        db.close()


def get_recent_alerts(limit: int = 10):
    """Get recent alert logs."""
    db = SessionLocal()
    try:
        logs = db.query(CostAlertLog).order_by(CostAlertLog.sent_at.desc()).limit(limit).all()
        return [
            {
                "id": log.id,
                "alert_type": log.alert_type,
                "current_cost": log.current_cost,
                "threshold": log.threshold,
                "channel": log.channel,
                "message": log.message,
                "sent_at": log.sent_at.isoformat() if log.sent_at else None,
            }
            for log in logs
        ]
    finally:
        db.close()


def get_report_config():
    """Get or create default report config."""
    db = SessionLocal()
    try:
        config = db.query(ReportConfig).filter(ReportConfig.id == 1).first()
        if not config:
            config = ReportConfig(id=1)
            db.add(config)
            db.commit()
            db.refresh(config)
        return config
    finally:
        db.close()


def update_report_config(**kwargs):
    """Update report config fields."""
    db = SessionLocal()
    try:
        config = db.query(ReportConfig).filter(ReportConfig.id == 1).first()
        if not config:
            config = ReportConfig(id=1)
            db.add(config)
        for key, value in kwargs.items():
            if hasattr(config, key):
                setattr(config, key, value)
        config.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(config)
        return config
    finally:
        db.close()


def add_report_history(**kwargs):
    """Add a report history entry."""
    db = SessionLocal()
    try:
        entry = ReportHistory(**kwargs)
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return entry
    finally:
        db.close()


def get_report_history(limit: int = 50, report_type: str = None):
    """Get report history entries."""
    db = SessionLocal()
    try:
        q = db.query(ReportHistory)
        if report_type:
            q = q.filter(ReportHistory.report_type == report_type)
        logs = q.order_by(ReportHistory.generated_at.desc()).limit(limit).all()
        return [
            {
                "id": log.id,
                "report_type": log.report_type,
                "report_date": log.report_date,
                "period_start": log.period_start,
                "period_end": log.period_end,
                "total_cost": log.total_cost,
                "yesterday_cost": log.yesterday_cost,
                "month_cost": log.month_cost,
                "forecast": log.forecast,
                "top_services": json.loads(log.top_services_json) if log.top_services_json else [],
                "region_breakdown": json.loads(log.region_breakdown_json) if log.region_breakdown_json else [],
                "anomaly_score": log.anomaly_score,
                "anomaly_details": log.anomaly_details,
                "email_sent": log.email_sent,
                "email_recipients": log.email_recipients,
                "google_sheets_uploaded": log.google_sheets_uploaded,
                "generated_at": log.generated_at.isoformat() if log.generated_at else None,
                "source": log.source,
            }
            for log in logs
        ]
    finally:
        db.close()
