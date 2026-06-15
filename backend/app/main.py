import io
import logging
import os
import re
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import quote

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.analytics import (
    ACTIVE_STATUSES,
    ai_answer,
    ai_insights,
    alerts_for_farm,
    animal_dict,
    arroba_summary,
    benchmark,
    dashboard_data,
    daily_gain,
    finance_summary,
    genetics,
    get_animals,
    health_dict,
    lot_summary,
    paddock_dict,
    permissions_for_role,
    profit_center,
    rankings,
    reproduction_dict,
    reproduction_indicators,
    user_dict,
    weighing_dict,
    age_label,
)
from app.database import Base, SessionLocal, engine, get_db
from app.models import (
    Animal,
    AnimalMovement,
    AnimalPhoto,
    AnimalTrade,
    Farm,
    FarmDocument,
    FinancialEntry,
    HealthRecord,
    InventoryItem,
    Paddock,
    ReproductionEvent,
    RuralEvent,
    User,
    Vaccination,
    Weighing,
    WhatsAppRecipient,
)
from app.reports import (
    REPORT_NAMES,
    generate_animal_pdf,
    generate_pdf,
    generate_qr_svg,
    generate_xlsx,
)
from app.schemas import (
    AIQuery,
    AnimalCreate,
    ArrobaSettings,
    DocumentCreate,
    FinanceCreate,
    HealthRecordCreate,
    InventoryCreate,
    LoginRequest,
    MovementCreate,
    PaddockCreate,
    PhotoCreate,
    ProfitSimulation,
    RegisterRequest,
    ReproductionCreate,
    RuralEventCreate,
    TradeCreate,
    UserCreate,
    VaccinationCreate,
    WeighingBatchCreate,
    WeighingCreate,
    WhatsAppRecipientCreate,
)
from app.security import (
    create_access_token,
    get_current_user,
    hash_password,
    require_admin,
    verify_password,
)
from app.seed import seed_demo


logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("novaris-agro")
APP_VERSION = os.getenv("APP_VERSION", "1.0.0")


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_demo(db)
    logger.info("api_started version=%s database=%s", APP_VERSION, engine.dialect.name)
    yield
    engine.dispose()


app = FastAPI(
    title="Novaris Agro API",
    version=APP_VERSION,
    description="API multiempresa para gestão pecuária bovina.",
    lifespan=lifespan,
)

default_origins = (
    "https://novaris-agro-web.onrender.com,"
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:3000,http://127.0.0.1:3000"
)
allowed_origins = [
    item.strip().rstrip("/")
    for item in os.getenv("ALLOWED_ORIGINS", default_origins).split(",")
    if item.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def farm_animal(db: Session, farm_id: int, animal_id: int) -> Animal:
    animal = db.scalar(
        select(Animal).where(
            Animal.id == animal_id,
            Animal.farm_id == farm_id,
        )
    )
    if not animal:
        raise HTTPException(404, "Animal não encontrado.")
    return animal


def model_dict(instance, exclude: set[str] | None = None) -> dict:
    exclude = exclude or set()
    return {
        column.name: getattr(instance, column.name)
        for column in instance.__table__.columns
        if column.name not in exclude
    }


@app.get("/health", tags=["Sistema"])
def health():
    database_status = "ok"
    code = 200
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        logger.exception("health_database_error")
        database_status = "unavailable"
        code = 503
    return JSONResponse(
        status_code=code,
        content={
            "status": "ok" if code == 200 else "degraded",
            "api": "ok",
            "database": database_status,
            "version": APP_VERSION,
            "server_time": datetime.now(timezone.utc).isoformat(),
        },
    )


@app.post("/auth/register", status_code=status.HTTP_201_CREATED, tags=["Auth"])
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = payload.email.lower()
    if db.scalar(select(User.id).where(func.lower(User.email) == email)):
        raise HTTPException(409, "Este e-mail já está cadastrado.")
    farm = Farm(**payload.farm.model_dump())
    db.add(farm)
    db.flush()
    user = User(
        farm_id=farm.id,
        name=payload.name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        role="Administrador",
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, "Não foi possível criar esta conta.") from error
    db.refresh(user)
    logger.info("register_success user_id=%s farm_id=%s", user.id, farm.id)
    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "user": user_dict(user),
    }


@app.post("/auth/login", tags=["Auth"])
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(
        select(User).where(func.lower(User.email) == payload.email.lower())
    )
    if not user or not verify_password(payload.password, user.password_hash):
        logger.warning("login_failed")
        raise HTTPException(401, "E-mail ou senha inválidos.")
    logger.info("login_success user_id=%s farm_id=%s", user.id, user.farm_id)
    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "user": user_dict(user),
    }


@app.get("/auth/me", tags=["Auth"])
def me(user: User = Depends(get_current_user)):
    return user_dict(user)


@app.get("/dashboard", tags=["Dashboard"])
def dashboard(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return dashboard_data(db, user)


@app.get("/animals", tags=["Rebanho"])
def list_animals(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return [animal_dict(item) for item in get_animals(db, user.farm_id)]


@app.post("/animals", status_code=201, tags=["Rebanho"])
def create_animal(
    payload: AnimalCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    duplicate = db.scalar(
        select(Animal.id).where(
            Animal.farm_id == user.farm_id,
            Animal.tag_number == payload.tag_number.strip(),
        )
    )
    if duplicate:
        raise HTTPException(409, "Já existe um animal com este brinco.")
    animal = Animal(
        farm_id=user.farm_id,
        **payload.model_dump(),
    )
    db.add(animal)
    db.flush()
    animal.unique_code = f"NOV-{user.farm_id}-{animal.id:06d}"
    db.commit()
    db.refresh(animal)
    return animal_dict(animal)


@app.get("/animals/{animal_id}/profile", tags=["Rebanho"])
def animal_profile(
    animal_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    animal = farm_animal(db, user.farm_id, animal_id)
    weighings = list(
        db.scalars(
            select(Weighing)
            .where(Weighing.animal_id == animal.id)
            .order_by(Weighing.weighed_at.desc())
        ).all()
    )
    vaccinations = list(
        db.scalars(
            select(Vaccination)
            .where(Vaccination.animal_id == animal.id)
            .order_by(Vaccination.applied_at.desc())
        ).all()
    )
    health_records = list(
        db.scalars(
            select(HealthRecord)
            .where(HealthRecord.animal_id == animal.id)
            .order_by(HealthRecord.applied_at.desc())
        ).all()
    )
    reproduction = list(
        db.scalars(
            select(ReproductionEvent)
            .where(ReproductionEvent.animal_id == animal.id)
            .order_by(ReproductionEvent.event_date.desc())
        ).all()
    )
    financial = list(
        db.scalars(
            select(FinancialEntry)
            .where(
                FinancialEntry.farm_id == user.farm_id,
                FinancialEntry.animal_id == animal.id,
            )
            .order_by(FinancialEntry.occurred_at.desc())
        ).all()
    )
    movements = list(
        db.scalars(
            select(AnimalMovement)
            .where(AnimalMovement.animal_id == animal.id)
            .order_by(AnimalMovement.moved_at.desc())
        ).all()
    )
    timeline = []
    timeline.extend(
        {
            "id": f"w-{item.id}",
            "kind": "Pesagem",
            "title": f"{item.weight:g} kg",
            "date": item.weighed_at,
            "detail": item.notes or "Peso atualizado",
        }
        for item in weighings
    )
    timeline.extend(
        {
            "id": f"h-{item.id}",
            "kind": "Sanidade",
            "title": item.product_name,
            "date": item.applied_at,
            "detail": item.notes or item.record_type,
        }
        for item in health_records
    )
    timeline.extend(
        {
            "id": f"r-{item.id}",
            "kind": "Reprodução",
            "title": item.event_type,
            "date": item.event_date,
            "detail": item.result or item.notes or "Evento registrado",
        }
        for item in reproduction
    )
    timeline.sort(key=lambda item: item["date"], reverse=True)
    result = animal_dict(animal)
    result.update(
        {
            "age_label": age_label(animal.birth_date),
            "weighings": [weighing_dict(item, animal) for item in weighings],
            "vaccinations": [
                {
                    **model_dict(item),
                    "product_name": item.vaccine_name,
                }
                for item in vaccinations
            ],
            "health_records": [
                health_dict(item, animal) for item in health_records
            ],
            "reproduction": [
                reproduction_dict(item, animal) for item in reproduction
            ],
            "financial_entries": [model_dict(item) for item in financial],
            "movements": [model_dict(item) for item in movements],
            "timeline": timeline,
        }
    )
    return result


@app.get("/animals/{animal_id}/qr.svg", tags=["Rebanho"])
def animal_qr(
    animal_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    animal = farm_animal(db, user.farm_id, animal_id)
    frontend = os.getenv(
        "FRONTEND_URL",
        "https://novaris-agro-web.onrender.com",
    ).rstrip("/")
    content = f"{frontend}/?animalCode={quote(animal.unique_code or '')}"
    return Response(generate_qr_svg(content), media_type="image/svg+xml")


@app.get("/animals/{animal_id}/print.pdf", tags=["Rebanho"])
def animal_print(
    animal_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    animal = farm_animal(db, user.farm_id, animal_id)
    return Response(
        generate_animal_pdf(animal, db),
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'inline; filename="animal-{animal.tag_number}.pdf"'
            )
        },
    )


@app.get("/animals/{animal_id}/photos", tags=["Rebanho"])
def animal_photos(
    animal_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    animal = farm_animal(db, user.farm_id, animal_id)
    rows = db.scalars(
        select(AnimalPhoto)
        .where(AnimalPhoto.animal_id == animal.id)
        .order_by(AnimalPhoto.captured_at.desc(), AnimalPhoto.id.desc())
    ).all()
    return [model_dict(item) for item in rows]


@app.post("/animals/{animal_id}/photos", status_code=201, tags=["Rebanho"])
def add_animal_photo(
    animal_id: int,
    payload: PhotoCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    animal = farm_animal(db, user.farm_id, animal_id)
    if len(payload.image_data) > 8_000_000:
        raise HTTPException(413, "A imagem é muito grande.")
    item = AnimalPhoto(animal_id=animal.id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_dict(item)


@app.get("/weighings", tags=["Pesagens"])
def list_weighings(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    animals = {item.id: item for item in get_animals(db, user.farm_id)}
    rows = db.scalars(
        select(Weighing)
        .join(Animal, Animal.id == Weighing.animal_id)
        .where(Animal.farm_id == user.farm_id)
        .order_by(Weighing.weighed_at.desc(), Weighing.id.desc())
    ).all()
    return [weighing_dict(item, animals[item.animal_id]) for item in rows]


def save_weighing(payload: WeighingCreate, user: User, db: Session) -> Weighing:
    animal = farm_animal(db, user.farm_id, payload.animal_id)
    item = Weighing(**payload.model_dump())
    db.add(item)
    animal.current_weight = payload.weight
    return item


@app.post("/weighings", status_code=201, tags=["Pesagens"])
def create_weighing(
    payload: WeighingCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = save_weighing(payload, user, db)
    db.commit()
    db.refresh(item)
    animal = farm_animal(db, user.farm_id, item.animal_id)
    return weighing_dict(item, animal)


@app.post("/weighings/batch", status_code=201, tags=["Pesagens"])
def create_batch_weighings(
    payload: WeighingBatchCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = [save_weighing(row, user, db) for row in payload.items]
    db.commit()
    return {"created": len(items)}


@app.get("/vaccinations", tags=["Sanidade"])
def list_vaccinations(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    animal_ids = select(Animal.id).where(Animal.farm_id == user.farm_id)
    rows = db.scalars(
        select(Vaccination)
        .where(Vaccination.animal_id.in_(animal_ids))
        .order_by(Vaccination.applied_at.desc())
    ).all()
    return [model_dict(item) for item in rows]


@app.post("/vaccinations", status_code=201, tags=["Sanidade"])
def create_vaccination(
    payload: VaccinationCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm_animal(db, user.farm_id, payload.animal_id)
    item = Vaccination(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_dict(item)


@app.get("/health-records", tags=["Sanidade"])
def list_health_records(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    animals = {item.id: item for item in get_animals(db, user.farm_id)}
    rows = db.scalars(
        select(HealthRecord)
        .join(Animal, Animal.id == HealthRecord.animal_id)
        .where(Animal.farm_id == user.farm_id)
        .order_by(HealthRecord.applied_at.desc(), HealthRecord.id.desc())
    ).all()
    return [health_dict(item, animals[item.animal_id]) for item in rows]


@app.post("/health-records", status_code=201, tags=["Sanidade"])
def create_health_record(
    payload: HealthRecordCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    animal = farm_animal(db, user.farm_id, payload.animal_id)
    item = HealthRecord(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return health_dict(item, animal)


@app.get("/health-calendar", tags=["Sanidade"])
def health_calendar(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    records = list_health_records(user, db)
    return sorted(
        [
            item for item in records
            if item["next_application_at"]
            and (item["next_application_at"] - date.today()).days <= 90
        ],
        key=lambda item: item["next_application_at"],
    )


@app.get("/reproduction", tags=["Reprodução"])
def list_reproduction(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    animals = {item.id: item for item in get_animals(db, user.farm_id)}
    rows = db.scalars(
        select(ReproductionEvent)
        .join(Animal, Animal.id == ReproductionEvent.animal_id)
        .where(Animal.farm_id == user.farm_id)
        .order_by(ReproductionEvent.event_date.desc())
    ).all()
    return [reproduction_dict(item, animals[item.animal_id]) for item in rows]


@app.post("/reproduction", status_code=201, tags=["Reprodução"])
def create_reproduction(
    payload: ReproductionCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    animal = farm_animal(db, user.farm_id, payload.animal_id)
    item = ReproductionEvent(**payload.model_dump())
    db.add(item)
    if (
        payload.event_type == "Diagnóstico de prenhez"
        and payload.result
        and "posit" in payload.result.lower()
    ):
        animal.status = "Prenhe"
    db.commit()
    db.refresh(item)
    return reproduction_dict(item, animal)


@app.get("/reproduction/indicators", tags=["Reprodução"])
def reproduction_metrics(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return reproduction_indicators(db, user.farm_id)


@app.get("/paddocks", tags=["Pastagens"])
def list_paddocks(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        select(Paddock)
        .where(Paddock.farm_id == user.farm_id)
        .order_by(Paddock.name)
    ).all()
    return [paddock_dict(item) for item in rows]


@app.post("/paddocks", status_code=201, tags=["Pastagens"])
def create_paddock(
    payload: PaddockCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = Paddock(farm_id=user.farm_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return paddock_dict(item)


@app.post("/movements", status_code=201, tags=["Pastagens"])
def create_movement(
    payload: MovementCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    animal = farm_animal(db, user.farm_id, payload.animal_id)
    item = AnimalMovement(**payload.model_dump())
    db.add(item)
    if payload.to_location:
        animal.paddock = payload.to_location
    db.commit()
    db.refresh(item)
    return model_dict(item)


@app.get("/finance", tags=["Financeiro"])
def finance(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return finance_summary(db, user.farm_id)


@app.post("/finance", status_code=201, tags=["Financeiro"])
def create_finance(
    payload: FinanceCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.animal_id:
        farm_animal(db, user.farm_id, payload.animal_id)
    item = FinancialEntry(farm_id=user.farm_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_dict(item)


@app.get("/arroba", tags=["Comercial"])
def arroba(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return arroba_summary(db, user)


@app.put("/arroba/settings", tags=["Comercial"])
def update_arroba(
    payload: ArrobaSettings,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.farm.arroba_price = payload.arroba_price
    user.farm.carcass_yield_percent = payload.carcass_yield_percent
    db.commit()
    return arroba_summary(db, user)


@app.get("/alerts", tags=["Alertas"])
def alerts(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return alerts_for_farm(db, user.farm_id)


@app.get("/permissions", tags=["Usuários"])
def permissions(user: User = Depends(get_current_user)):
    return {"permissions": permissions_for_role(user.role), "role": user.role}


@app.get("/users", tags=["Usuários"])
def users(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        select(User).where(User.farm_id == user.farm_id).order_by(User.name)
    ).all()
    return [user_dict(item, include_permissions=True) for item in rows]


@app.post("/users", status_code=201, tags=["Usuários"])
def create_user(
    payload: UserCreate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.scalar(
        select(User.id).where(func.lower(User.email) == payload.email.lower())
    ):
        raise HTTPException(409, "Este e-mail já está cadastrado.")
    item = User(
        farm_id=user.farm_id,
        name=payload.name,
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return user_dict(item, include_permissions=True)


@app.get("/weather", tags=["Dashboard"])
def weather(user: User = Depends(get_current_user)):
    return {
        "available": False,
        "temperature": None,
        "humidity": None,
        "wind": None,
        "condition": "Clima indisponível",
        "city": user.farm.city,
        "state": user.farm.state,
        "forecast": [],
    }


@app.get("/lots", tags=["Lotes"])
def lots(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return lot_summary(db, user)


@app.get("/rural-calendar", tags=["Calendário"])
def rural_calendar(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    animals = {item.id: item for item in get_animals(db, user.farm_id)}
    events = []
    rows = db.scalars(
        select(RuralEvent)
        .where(RuralEvent.farm_id == user.farm_id)
        .order_by(RuralEvent.event_date)
    ).all()
    for item in rows:
        animal = animals.get(item.animal_id)
        events.append(
            {
                **model_dict(item),
                "source": "manual",
                "animal_tag": animal.tag_number if animal else None,
            }
        )
    for item in list_health_records(user, db):
        if item["next_application_at"]:
            events.append(
                {
                    "id": item["id"],
                    "source": "sanidade",
                    "event_type": item["record_type"],
                    "title": item["product_name"],
                    "event_date": item["next_application_at"],
                    "status": (
                        "Vencido" if item["situation"] == "expired" else "Programado"
                    ),
                    "animal_tag": item["animal_tag"],
                    "notes": item["notes"],
                }
            )
    for item in list_reproduction(user, db):
        if item["expected_calving_at"]:
            events.append(
                {
                    "id": item["id"],
                    "source": "reproducao",
                    "event_type": "Parto",
                    "title": "Parto previsto",
                    "event_date": item["expected_calving_at"],
                    "status": "Programado",
                    "animal_tag": item["animal_tag"],
                    "notes": item["notes"],
                }
            )
    return sorted(events, key=lambda item: item["event_date"])


@app.post("/rural-calendar", status_code=201, tags=["Calendário"])
def create_rural_event(
    payload: RuralEventCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.animal_id:
        farm_animal(db, user.farm_id, payload.animal_id)
    item = RuralEvent(farm_id=user.farm_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_dict(item)


@app.get("/rankings", tags=["Análises"])
def ranking_data(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return rankings(db, user)


@app.get("/genetics", tags=["Análises"])
def genetics_data(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return genetics(db, user.farm_id)


@app.get("/inventory", tags=["Estoque veterinário"])
def inventory(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        select(InventoryItem)
        .where(InventoryItem.farm_id == user.farm_id)
        .order_by(InventoryItem.name)
    ).all()
    result = []
    for item in rows:
        expiry_status = "ok"
        if item.expires_at:
            days = (item.expires_at - date.today()).days
            expiry_status = "expired" if days < 0 else "soon" if days <= 30 else "ok"
        result.append(
            {
                **model_dict(item),
                "low_stock": item.quantity <= item.minimum_quantity,
                "expiry_status": expiry_status,
            }
        )
    return result


@app.post("/inventory", status_code=201, tags=["Estoque veterinário"])
def create_inventory(
    payload: InventoryCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = InventoryItem(farm_id=user.farm_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_dict(item)


@app.get("/trades", tags=["Comercial"])
def trades(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    animals = {item.id: item for item in get_animals(db, user.farm_id)}
    rows = db.scalars(
        select(AnimalTrade)
        .where(AnimalTrade.farm_id == user.farm_id)
        .order_by(AnimalTrade.occurred_at.desc())
    ).all()
    return [
        {
            **model_dict(item),
            "animal_tag": animals[item.animal_id].tag_number
            if item.animal_id in animals else None,
        }
        for item in rows
    ]


@app.post("/trades", status_code=201, tags=["Comercial"])
def create_trade(
    payload: TradeCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    animal = (
        farm_animal(db, user.farm_id, payload.animal_id)
        if payload.animal_id else None
    )
    item = AnimalTrade(farm_id=user.farm_id, **payload.model_dump())
    db.add(item)
    if animal and payload.trade_type == "Venda":
        animal.status = "Vendido"
    db.add(
        FinancialEntry(
            farm_id=user.farm_id,
            entry_type="Receita" if payload.trade_type == "Venda" else "Despesa",
            category=f"{payload.trade_type} de animais",
            description=f"{payload.trade_type}: {payload.counterparty_name}",
            amount=payload.amount,
            occurred_at=payload.occurred_at,
            lot=payload.lot,
            animal_id=payload.animal_id,
            notes=payload.notes,
        )
    )
    db.commit()
    db.refresh(item)
    return model_dict(item)


@app.post("/profit-simulator", tags=["Análises"])
def profit_simulator(
    payload: ProfitSimulation,
    user: User = Depends(get_current_user),
):
    scenarios = []
    for days in [0, 30, 60, 90]:
        projected_weight = payload.weight + payload.average_daily_gain * days
        carcass = projected_weight * user.farm.carcass_yield_percent / 100
        value = carcass / 15 * user.farm.arroba_price
        total_cost = payload.purchase_value + payload.daily_cost * days
        scenarios.append(
            {
                "days": days,
                "projected_weight": round(projected_weight, 1),
                "estimated_value": round(value, 2),
                "estimated_cost": round(total_cost, 2),
                "estimated_profit": round(value - total_cost, 2),
            }
        )
    return {"scenarios": scenarios}


@app.get("/benchmark", tags=["Análises"])
def benchmark_data(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return benchmark(db, user)


@app.get("/profit-center", tags=["Análises"])
def profit_data(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return profit_center(db, user)


@app.get("/documents", tags=["Documentos"])
def documents(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        select(FarmDocument)
        .where(FarmDocument.farm_id == user.farm_id)
        .order_by(FarmDocument.document_date.desc())
    ).all()
    return [model_dict(item) for item in rows]


@app.post("/documents", status_code=201, tags=["Documentos"])
def create_document(
    payload: DocumentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if len(payload.data_url) > 12_000_000:
        raise HTTPException(413, "O arquivo é muito grande.")
    if payload.animal_id:
        farm_animal(db, user.farm_id, payload.animal_id)
    item = FarmDocument(farm_id=user.farm_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_dict(item)


@app.get("/whatsapp/recipients", tags=["WhatsApp"])
def whatsapp_recipients(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        select(WhatsAppRecipient)
        .where(WhatsAppRecipient.farm_id == user.farm_id)
        .order_by(WhatsAppRecipient.name)
    ).all()
    return [model_dict(item) for item in rows]


@app.post("/whatsapp/recipients", status_code=201, tags=["WhatsApp"])
def create_whatsapp_recipient(
    payload: WhatsAppRecipientCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = WhatsAppRecipient(farm_id=user.farm_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_dict(item)


@app.get("/whatsapp/outbox", tags=["WhatsApp"])
def whatsapp_outbox(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    alerts = alerts_for_farm(db, user.farm_id)
    recipients = db.scalars(
        select(WhatsAppRecipient).where(
            WhatsAppRecipient.farm_id == user.farm_id,
            WhatsAppRecipient.active.is_(True),
        )
    ).all()
    message = (
        f"Novaris Agro - {user.farm.name}: "
        f"{len(alerts)} alerta(s) pendente(s)."
    )
    return {
        "notice": "O envio é aberto no WhatsApp para confirmação do usuário.",
        "messages": [
            {
                "recipient": item.name,
                "phone": item.phone,
                "share_url": (
                    f"https://wa.me/{re.sub(r'\\D', '', item.phone)}"
                    f"?text={quote(message)}"
                ),
            }
            for item in recipients
        ],
    }


@app.get("/ai/insights", tags=["IA"])
def insights(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ai_insights(db, user)


@app.post("/ai/query", tags=["IA"])
def ai_query(
    payload: AIQuery,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ai_answer(db, user, payload.question)


@app.get("/reports", tags=["Relatórios"])
def reports_list(user: User = Depends(get_current_user)):
    return [
        {
            "kind": kind,
            "name": name,
            "formats": ["pdf", "xlsx"],
        }
        for kind, name in REPORT_NAMES.items()
    ]


@app.get("/reports/{kind}.{file_format}", tags=["Relatórios"])
def download_report(
    kind: str,
    file_format: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if kind not in REPORT_NAMES or file_format not in {"pdf", "xlsx"}:
        raise HTTPException(404, "Relatório não encontrado.")
    if file_format == "pdf":
        content = generate_pdf(kind, db, user)
        media_type = "application/pdf"
    else:
        content = generate_xlsx(kind, db, user)
        media_type = (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={
            "Content-Disposition": (
                f'attachment; filename="novaris-agro-{kind}.{file_format}"'
            )
        },
    )


frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
else:
    @app.get("/", tags=["Sistema"])
    def root():
        return {
            "name": "Novaris Agro API",
            "version": APP_VERSION,
            "docs": "/docs",
            "health": "/health",
        }
