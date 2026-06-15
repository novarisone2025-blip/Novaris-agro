from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Farm(Base):
    __tablename__ = "farms"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(140))
    city: Mapped[str] = mapped_column(String(100))
    state: Mapped[str] = mapped_column(String(2))
    area_hectares: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    arroba_price: Mapped[float] = mapped_column(Float, default=340)
    carcass_yield_percent: Mapped[float] = mapped_column(Float, default=50)

    users: Mapped[list["User"]] = relationship(back_populates="farm")
    animals: Mapped[list["Animal"]] = relationship(back_populates="farm")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_farm_email", "farm_id", "email"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(
        ForeignKey("farms.id", ondelete="CASCADE"),
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(30), default="Administrador")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    farm: Mapped[Farm] = relationship(back_populates="users")


class Animal(Base):
    __tablename__ = "animals"
    __table_args__ = (
        UniqueConstraint("farm_id", "tag_number", name="uq_animal_farm_tag"),
        Index("ix_animals_farm_status", "farm_id", "status"),
        Index("ix_animals_farm_lot", "farm_id", "lot"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(
        ForeignKey("farms.id", ondelete="CASCADE"),
        index=True,
    )
    tag_number: Mapped[str] = mapped_column(String(40))
    name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    breed: Mapped[str] = mapped_column(String(80))
    sex: Mapped[str] = mapped_column(String(10))
    birth_date: Mapped[date] = mapped_column(Date)
    current_weight: Mapped[float] = mapped_column(Float)
    lot: Mapped[str] = mapped_column(String(80), default="Sem lote")
    paddock: Mapped[str] = mapped_column(String(80), default="Sem piquete")
    status: Mapped[str] = mapped_column(String(30), default="Ativo")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    sale_ready: Mapped[bool] = mapped_column(Boolean, default=False)
    purchase_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    category: Mapped[str] = mapped_column(String(50), default="Adulto")
    unique_code: Mapped[str | None] = mapped_column(
        String(80),
        unique=True,
        nullable=True,
    )
    rfid_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    father_tag: Mapped[str | None] = mapped_column(String(80), nullable=True)
    mother_tag: Mapped[str | None] = mapped_column(String(80), nullable=True)
    lineage: Mapped[str | None] = mapped_column(String(160), nullable=True)
    blood_degree: Mapped[str | None] = mapped_column(String(80), nullable=True)

    farm: Mapped[Farm] = relationship(back_populates="animals")
    weighings: Mapped[list["Weighing"]] = relationship(
        back_populates="animal",
        cascade="all, delete-orphan",
    )


class Weighing(Base):
    __tablename__ = "weighings"
    __table_args__ = (Index("ix_weighings_animal_date", "animal_id", "weighed_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    animal_id: Mapped[int] = mapped_column(
        ForeignKey("animals.id", ondelete="CASCADE"),
        index=True,
    )
    weight: Mapped[float] = mapped_column(Float)
    weighed_at: Mapped[date] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    animal: Mapped[Animal] = relationship(back_populates="weighings")


class Vaccination(Base):
    __tablename__ = "vaccinations"

    id: Mapped[int] = mapped_column(primary_key=True)
    animal_id: Mapped[int] = mapped_column(
        ForeignKey("animals.id", ondelete="CASCADE"),
        index=True,
    )
    vaccine_name: Mapped[str] = mapped_column(String(120))
    applied_at: Mapped[date] = mapped_column(Date)
    next_dose_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    batch: Mapped[str | None] = mapped_column(String(80), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class HealthRecord(Base):
    __tablename__ = "health_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    animal_id: Mapped[int] = mapped_column(
        ForeignKey("animals.id", ondelete="CASCADE"),
        index=True,
    )
    record_type: Mapped[str] = mapped_column(String(30))
    product_name: Mapped[str] = mapped_column(String(120))
    applied_at: Mapped[date] = mapped_column(Date)
    next_application_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    expires_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    batch: Mapped[str | None] = mapped_column(String(80), nullable=True)
    dosage: Mapped[str | None] = mapped_column(String(80), nullable=True)
    responsible: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ReproductionEvent(Base):
    __tablename__ = "reproduction_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    animal_id: Mapped[int] = mapped_column(
        ForeignKey("animals.id", ondelete="CASCADE"),
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(50))
    event_date: Mapped[date] = mapped_column(Date)
    bull_or_semen: Mapped[str | None] = mapped_column(String(120), nullable=True)
    result: Mapped[str | None] = mapped_column(String(80), nullable=True)
    expected_calving_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    calf_tag: Mapped[str | None] = mapped_column(String(40), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Paddock(Base):
    __tablename__ = "paddocks"

    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(
        ForeignKey("farms.id", ondelete="CASCADE"),
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100))
    area_hectares: Mapped[float] = mapped_column(Float)
    capacity: Mapped[int] = mapped_column(Integer)
    current_animals: Mapped[int] = mapped_column(Integer, default=0)
    rest_started_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="Em uso")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class FinancialEntry(Base):
    __tablename__ = "financial_entries"
    __table_args__ = (
        Index("ix_financial_farm_date", "farm_id", "occurred_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(
        ForeignKey("farms.id", ondelete="CASCADE"),
        index=True,
    )
    entry_type: Mapped[str] = mapped_column(String(20))
    category: Mapped[str] = mapped_column(String(60))
    description: Mapped[str] = mapped_column(String(180))
    amount: Mapped[float] = mapped_column(Float)
    occurred_at: Mapped[date] = mapped_column(Date)
    lot: Mapped[str | None] = mapped_column(String(80), nullable=True)
    animal_id: Mapped[int | None] = mapped_column(
        ForeignKey("animals.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AnimalMovement(Base):
    __tablename__ = "animal_movements"

    id: Mapped[int] = mapped_column(primary_key=True)
    animal_id: Mapped[int] = mapped_column(
        ForeignKey("animals.id", ondelete="CASCADE"),
        index=True,
    )
    movement_type: Mapped[str] = mapped_column(String(30))
    from_location: Mapped[str | None] = mapped_column(String(100), nullable=True)
    to_location: Mapped[str | None] = mapped_column(String(100), nullable=True)
    moved_at: Mapped[date] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AnimalPhoto(Base):
    __tablename__ = "animal_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    animal_id: Mapped[int] = mapped_column(
        ForeignKey("animals.id", ondelete="CASCADE"),
        index=True,
    )
    image_data: Mapped[str] = mapped_column(Text)
    captured_at: Mapped[date] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class RuralEvent(Base):
    __tablename__ = "rural_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(
        ForeignKey("farms.id", ondelete="CASCADE"),
        index=True,
    )
    animal_id: Mapped[int | None] = mapped_column(
        ForeignKey("animals.id", ondelete="SET NULL"),
        nullable=True,
    )
    event_type: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(160))
    event_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(30))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(
        ForeignKey("farms.id", ondelete="CASCADE"),
        index=True,
    )
    item_type: Mapped[str] = mapped_column(String(60))
    name: Mapped[str] = mapped_column(String(160))
    quantity: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(30))
    minimum_quantity: Mapped[float] = mapped_column(Float)
    expires_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    batch: Mapped[str | None] = mapped_column(String(100), nullable=True)
    supplier: Mapped[str | None] = mapped_column(String(160), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AnimalTrade(Base):
    __tablename__ = "animal_trades"

    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(
        ForeignKey("farms.id", ondelete="CASCADE"),
        index=True,
    )
    animal_id: Mapped[int | None] = mapped_column(
        ForeignKey("animals.id", ondelete="SET NULL"),
        nullable=True,
    )
    trade_type: Mapped[str] = mapped_column(String(30))
    counterparty_name: Mapped[str] = mapped_column(String(160))
    counterparty_document: Mapped[str | None] = mapped_column(
        String(40),
        nullable=True,
    )
    carrier: Mapped[str | None] = mapped_column(String(160), nullable=True)
    gta: Mapped[str | None] = mapped_column(String(100), nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )
    amount: Mapped[float] = mapped_column(Float)
    occurred_at: Mapped[date] = mapped_column(Date)
    lot: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class FarmDocument(Base):
    __tablename__ = "farm_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(
        ForeignKey("farms.id", ondelete="CASCADE"),
        index=True,
    )
    animal_id: Mapped[int | None] = mapped_column(
        ForeignKey("animals.id", ondelete="SET NULL"),
        nullable=True,
    )
    document_type: Mapped[str] = mapped_column(String(60))
    title: Mapped[str] = mapped_column(String(180))
    file_name: Mapped[str] = mapped_column(String(180))
    data_url: Mapped[str] = mapped_column(Text)
    document_date: Mapped[date] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class WhatsAppRecipient(Base):
    __tablename__ = "whatsapp_recipients"

    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(
        ForeignKey("farms.id", ondelete="CASCADE"),
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(30))
    alert_types: Mapped[str] = mapped_column(String(240))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
