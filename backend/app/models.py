"""Database models.

Provenance is explicit on every record:
  data_origin         where the record came from (demo / ground_measured / imported / satellite)
  verification_status whether an authorised person has checked it
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

ROLES = ("admin", "auditor", "moderator")
ROAD_TYPES = ("arterial", "sub_arterial", "collector", "residential", "pedestrian", "junction", "other")
DATA_ORIGINS = ("demo", "ground_measured", "imported", "satellite")
VERIFICATION = ("unverified", "verified", "expert_verified")
CLASSIFICATIONS = ("potential_excessive", "insufficient", "non_functional", "adequate", "needs_investigation")
FIXTURE_STATUS = ("working", "non_functional", "flickering", "obstructed", "unknown")
SHIELDING = ("full", "partial", "none", "unknown")
DIRECTION = ("downward", "sideways", "upward", "unknown")
ACTIVITY = ("low", "medium", "high", "unknown")
THRESHOLD_BASIS = ("demo_placeholder", "verified_standard", "local_policy")
REPORT_CATEGORIES = (
    "excessive_brightness",
    "light_trespass",
    "poorly_directed",
    "unnecessary_building_lighting",
    "broken_streetlight",
    "dark_road",
    "other",
)
REPORT_STATUSES = ("submitted", "under_review", "verified", "in_progress", "resolved", "rejected")
PUBLIC_REPORT_STATUSES = ("verified", "in_progress", "resolved")
REC_STATUSES = ("open", "accepted", "done", "dismissed")


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="moderator")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Dataset(Base):
    __tablename__ = "datasets"
    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="validated")  # validated | imported | discarded
    data_origin: Mapped[str] = mapped_column(String(20), default="ground_measured")
    source_note: Mapped[str] = mapped_column(String(500), default="")
    collected_on: Mapped[str] = mapped_column(String(40), default="")
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    valid_count: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    warning_count: Mapped[int] = mapped_column(Integer, default=0)
    duplicate_count: Mapped[int] = mapped_column(Integer, default=0)
    report_json: Mapped[str] = mapped_column(Text, default="{}")
    cleaned_csv: Mapped[str] = mapped_column(Text, default="")
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Location(Base):
    __tablename__ = "locations"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    zone: Mapped[str] = mapped_column(String(120), default="", index=True)
    road_type: Mapped[str] = mapped_column(String(20), default="other")
    safety_critical: Mapped[bool] = mapped_column(Boolean, default=False)
    safety_context: Mapped[str] = mapped_column(String(200), default="")
    data_origin: Mapped[str] = mapped_column(String(20), default="ground_measured", index=True)
    dataset_id: Mapped[int | None] = mapped_column(ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    observations: Mapped[list["Observation"]] = relationship(
        back_populates="location", cascade="all, delete-orphan", order_by="Observation.measured_at.desc()"
    )
    recommendations: Mapped[list["Recommendation"]] = relationship(
        back_populates="location", cascade="all, delete-orphan"
    )


class Observation(Base):
    __tablename__ = "observations"
    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"), index=True)
    measured_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    lux: Mapped[float | None] = mapped_column(Float, nullable=True)
    weather: Mapped[str] = mapped_column(String(60), default="")
    fixture_status: Mapped[str] = mapped_column(String(20), default="unknown")
    fixture_wattage: Mapped[float | None] = mapped_column(Float, nullable=True)
    shielding: Mapped[str] = mapped_column(String(20), default="unknown")
    light_direction: Mapped[str] = mapped_column(String(20), default="unknown")
    pedestrian_activity: Mapped[str] = mapped_column(String(20), default="unknown")
    vehicle_activity: Mapped[str] = mapped_column(String(20), default="unknown")
    notes: Mapped[str] = mapped_column(Text, default="")
    data_origin: Mapped[str] = mapped_column(String(20), default="ground_measured", index=True)
    verification_status: Mapped[str] = mapped_column(String(20), default="unverified", index=True)
    classification: Mapped[str] = mapped_column(String(30), default="needs_investigation", index=True)
    classification_basis: Mapped[str] = mapped_column(String(300), default="")
    dataset_id: Mapped[int | None] = mapped_column(ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    location: Mapped[Location] = relationship(back_populates="observations")


class Threshold(Base):
    """Lux range considered adequate for a road type.

    The platform ships with NO official values. An administrator must enter
    values from a verified standard (e.g. the applicable edition of IS 1944)
    and record the source. Until then observations are classified as
    'needs_investigation' (requires expert assessment).
    """

    __tablename__ = "thresholds"
    id: Mapped[int] = mapped_column(primary_key=True)
    road_type: Mapped[str] = mapped_column(String(20), unique=True)
    min_lux: Mapped[float] = mapped_column(Float)
    max_lux: Mapped[float] = mapped_column(Float)
    basis: Mapped[str] = mapped_column(String(30), default="local_policy")
    source_note: Mapped[str] = mapped_column(String(500), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class CitizenReport(Base):
    __tablename__ = "citizen_reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    public_id: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    category: Mapped[str] = mapped_column(String(40), index=True)
    description: Mapped[str] = mapped_column(Text)
    location_text: Mapped[str] = mapped_column(String(300), default="")
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    photo_path: Mapped[str] = mapped_column(String(300), default="")
    contact_name: Mapped[str] = mapped_column(String(120), default="")
    contact_info: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(20), default="submitted", index=True)
    duplicate_of_id: Mapped[int | None] = mapped_column(
        ForeignKey("citizen_reports.id", ondelete="SET NULL"), nullable=True
    )
    admin_note: Mapped[str] = mapped_column(Text, default="")
    public_note: Mapped[str] = mapped_column(String(500), default="")
    submitter_hash: Mapped[str] = mapped_column(String(64), default="", index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Recommendation(Base):
    __tablename__ = "recommendations"
    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"), index=True)
    observation_id: Mapped[int | None] = mapped_column(
        ForeignKey("observations.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    rationale: Mapped[str] = mapped_column(Text, default="")
    evidence_json: Mapped[str] = mapped_column(Text, default="[]")
    evidence_level: Mapped[str] = mapped_column(String(20), default="unverified")  # verified | unverified | demo
    safety_hold: Mapped[bool] = mapped_column(Boolean, default=False)
    priority_score: Mapped[float] = mapped_column(Float, default=0.0)
    priority_level: Mapped[str] = mapped_column(String(10), default="low", index=True)
    status: Mapped[str] = mapped_column(String(20), default="open")
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    location: Mapped[Location] = relationship(back_populates="recommendations")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_email: Mapped[str] = mapped_column(String(255), default="")
    action: Mapped[str] = mapped_column(String(60), index=True)
    entity: Mapped[str] = mapped_column(String(40), default="")
    entity_id: Mapped[str] = mapped_column(String(40), default="")
    detail: Mapped[str] = mapped_column(Text, default="")
    ip: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


Index("ix_obs_loc_time", Observation.location_id, Observation.measured_at)
