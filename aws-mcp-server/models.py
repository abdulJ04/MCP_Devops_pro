"""SQLite database models for cost alert system."""
import os
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
