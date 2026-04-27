from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import Boolean, Column, DateTime, String, Text
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class TenantORM(Base):
    """Modèle SQLAlchemy — table stockée dans PostgreSQL."""

    __tablename__ = "tenants"

    id = Column(String(64), primary_key=True)
    name = Column(String(256), nullable=False)
    api_key_hash = Column(String(64), nullable=False, index=True)
    plan = Column(String(32), default="free")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Tenant(BaseModel):
    """Modèle Pydantic — utilisé dans l'application."""

    id: str
    name: str
    plan: str = "free"
    is_active: bool = True

    model_config = {"from_attributes": True}
