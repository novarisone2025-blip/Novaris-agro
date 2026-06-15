from datetime import date

from pydantic import BaseModel, EmailStr, Field, field_validator


class FarmCreate(BaseModel):
    name: str = Field(min_length=2, max_length=140)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=2)
    area_hectares: float | None = Field(default=None, gt=0)

    @field_validator("state")
    @classmethod
    def normalize_state(cls, value: str) -> str:
        return value.strip().upper()


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    farm: FarmCreate


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class AnimalCreate(BaseModel):
    tag_number: str = Field(min_length=1, max_length=40)
    name: str | None = Field(default=None, max_length=80)
    photo_url: str | None = None
    breed: str = Field(min_length=2, max_length=80)
    sex: str = Field(min_length=1, max_length=10)
    birth_date: date
    current_weight: float = Field(gt=0)
    category: str = "Adulto"
    lot: str = "Sem lote"
    paddock: str = "Sem piquete"
    status: str = "Ativo"
    father_tag: str | None = None
    mother_tag: str | None = None
    lineage: str | None = None
    blood_degree: str | None = None
    rfid_code: str | None = None
    sale_ready: bool = False
    purchase_value: float | None = Field(default=None, ge=0)


class WeighingCreate(BaseModel):
    animal_id: int = Field(gt=0)
    weight: float = Field(gt=0)
    weighed_at: date
    notes: str | None = None


class WeighingBatchCreate(BaseModel):
    items: list[WeighingCreate] = Field(min_length=1, max_length=500)


class VaccinationCreate(BaseModel):
    animal_id: int = Field(gt=0)
    vaccine_name: str = Field(min_length=2, max_length=120)
    applied_at: date
    next_dose_at: date | None = None
    batch: str | None = None
    notes: str | None = None


class HealthRecordCreate(BaseModel):
    animal_id: int = Field(gt=0)
    record_type: str = Field(min_length=2, max_length=30)
    product_name: str = Field(min_length=2, max_length=120)
    applied_at: date
    next_application_at: date | None = None
    expires_at: date | None = None
    batch: str | None = None
    dosage: str | None = None
    responsible: str | None = None
    notes: str | None = None


class ReproductionCreate(BaseModel):
    animal_id: int = Field(gt=0)
    event_type: str = Field(min_length=2, max_length=50)
    event_date: date
    bull_or_semen: str | None = None
    result: str | None = None
    expected_calving_at: date | None = None
    calf_tag: str | None = None
    notes: str | None = None


class PaddockCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    area_hectares: float = Field(gt=0)
    capacity: int = Field(gt=0)
    current_animals: int = Field(default=0, ge=0)
    status: str = "Em uso"
    rest_started_at: date | None = None


class FinanceCreate(BaseModel):
    entry_type: str
    category: str = Field(min_length=2, max_length=60)
    description: str = Field(min_length=2, max_length=180)
    amount: float = Field(gt=0)
    occurred_at: date
    lot: str | None = None
    animal_id: int | None = None
    notes: str | None = None

    @field_validator("entry_type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        if value not in {"Receita", "Despesa"}:
            raise ValueError("Tipo deve ser Receita ou Despesa.")
        return value


class MovementCreate(BaseModel):
    animal_id: int = Field(gt=0)
    movement_type: str
    from_location: str | None = None
    to_location: str | None = None
    moved_at: date
    notes: str | None = None


class ArrobaSettings(BaseModel):
    arroba_price: float = Field(gt=0)
    carcass_yield_percent: float = Field(ge=35, le=65)


class RuralEventCreate(BaseModel):
    event_type: str
    title: str = Field(min_length=2, max_length=160)
    event_date: date
    animal_id: int | None = None
    status: str = "Programado"
    notes: str | None = None


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    role: str = "Funcionário"


class InventoryCreate(BaseModel):
    item_type: str
    name: str = Field(min_length=2, max_length=160)
    quantity: float = Field(ge=0)
    unit: str
    minimum_quantity: float = Field(ge=0)
    expires_at: date | None = None
    batch: str | None = None
    supplier: str | None = None
    notes: str | None = None


class TradeCreate(BaseModel):
    trade_type: str
    animal_id: int | None = None
    counterparty_name: str = Field(min_length=2, max_length=160)
    counterparty_document: str | None = None
    carrier: str | None = None
    gta: str | None = None
    invoice_number: str | None = None
    amount: float = Field(gt=0)
    occurred_at: date
    lot: str | None = None
    notes: str | None = None


class DocumentCreate(BaseModel):
    document_type: str
    title: str = Field(min_length=1, max_length=180)
    file_name: str = Field(min_length=1, max_length=180)
    data_url: str = Field(min_length=1)
    document_date: date
    animal_id: int | None = None
    notes: str | None = None


class PhotoCreate(BaseModel):
    image_data: str = Field(min_length=1)
    captured_at: date
    notes: str | None = None


class WhatsAppRecipientCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=8, max_length=30)
    alert_types: str = "todos"
    active: bool = True


class ProfitSimulation(BaseModel):
    weight: float = Field(gt=0)
    average_daily_gain: float = Field(ge=0)
    purchase_value: float = Field(ge=0)
    daily_cost: float = Field(ge=0)


class AIQuery(BaseModel):
    question: str = Field(min_length=2, max_length=1000)
