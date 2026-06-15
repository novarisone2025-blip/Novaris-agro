from collections import defaultdict
from datetime import date, datetime, timedelta
from statistics import mean

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Animal,
    AnimalMovement,
    FinancialEntry,
    HealthRecord,
    Paddock,
    ReproductionEvent,
    User,
    Vaccination,
    Weighing,
)


ACTIVE_STATUSES = {"Ativo", "Prenhe"}


def rounded(value: float, digits: int = 2) -> float:
    return round(float(value or 0), digits)


def farm_dict(farm) -> dict:
    return {
        "id": farm.id,
        "name": farm.name,
        "city": farm.city,
        "state": farm.state,
        "area_hectares": farm.area_hectares,
        "arroba_price": farm.arroba_price,
        "carcass_yield_percent": farm.carcass_yield_percent,
    }


def user_dict(user: User, include_permissions: bool = False) -> dict:
    result = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "farm": farm_dict(user.farm),
    }
    if include_permissions:
        result["permissions"] = permissions_for_role(user.role)
    return result


def permissions_for_role(role: str) -> list[str]:
    if role == "Administrador":
        return ["*"]
    mapping = {
        "Gerente": [
            "dashboard", "rebanho", "pesagens", "sanidade", "reproducao",
            "pastagens", "financeiro", "relatorios", "ia",
        ],
        "Veterinário": [
            "dashboard", "rebanho", "pesagens", "sanidade", "reproducao", "ia",
        ],
        "Funcionário": [
            "dashboard", "rebanho", "pesagens", "sanidade", "pastagens",
        ],
    }
    return mapping.get(role, mapping["Funcionário"])


def age_label(birth_date: date) -> str:
    today = date.today()
    months = max(
        0,
        (today.year - birth_date.year) * 12 + today.month - birth_date.month,
    )
    return f"{months // 12}a {months % 12}m"


def animal_dict(animal: Animal) -> dict:
    return {
        "id": animal.id,
        "farm_id": animal.farm_id,
        "tag_number": animal.tag_number,
        "name": animal.name,
        "photo_url": animal.photo_url,
        "breed": animal.breed,
        "sex": animal.sex,
        "birth_date": animal.birth_date,
        "current_weight": rounded(animal.current_weight, 1),
        "category": animal.category,
        "lot": animal.lot,
        "paddock": animal.paddock,
        "status": animal.status,
        "sale_ready": bool(animal.sale_ready),
        "purchase_value": animal.purchase_value,
        "unique_code": animal.unique_code,
        "rfid_code": animal.rfid_code,
        "father_tag": animal.father_tag,
        "mother_tag": animal.mother_tag,
        "lineage": animal.lineage,
        "blood_degree": animal.blood_degree,
        "created_at": animal.created_at,
    }


def get_animals(db: Session, farm_id: int) -> list[Animal]:
    return list(
        db.scalars(
            select(Animal)
            .where(Animal.farm_id == farm_id)
            .order_by(Animal.tag_number)
        ).all()
    )


def weighing_dict(item: Weighing, animal: Animal) -> dict:
    return {
        "id": item.id,
        "animal_id": item.animal_id,
        "animal_tag": animal.tag_number,
        "animal_name": animal.name,
        "animal_lot": animal.lot,
        "weight": rounded(item.weight, 1),
        "weighed_at": item.weighed_at,
        "notes": item.notes,
        "created_at": item.created_at,
    }


def daily_gain(db: Session, animal_id: int) -> float | None:
    items = list(
        db.scalars(
            select(Weighing)
            .where(Weighing.animal_id == animal_id)
            .order_by(Weighing.weighed_at.desc(), Weighing.id.desc())
            .limit(2)
        ).all()
    )
    if len(items) < 2:
        return None
    days = max((items[0].weighed_at - items[1].weighed_at).days, 1)
    return rounded((items[0].weight - items[1].weight) / days, 3)


def health_situation(next_date: date | None) -> tuple[str, int | None]:
    if not next_date:
        return "ok", None
    days = (next_date - date.today()).days
    if days < 0:
        return "expired", days
    if days <= 30:
        return "upcoming", days
    return "ok", days


def health_dict(item: HealthRecord, animal: Animal) -> dict:
    situation, days = health_situation(item.next_application_at)
    return {
        "id": item.id,
        "animal_id": item.animal_id,
        "animal_tag": animal.tag_number,
        "animal_name": animal.name,
        "animal_lot": animal.lot,
        "record_type": item.record_type,
        "product_name": item.product_name,
        "applied_at": item.applied_at,
        "next_application_at": item.next_application_at,
        "expires_at": item.expires_at,
        "batch": item.batch,
        "dosage": item.dosage,
        "responsible": item.responsible,
        "notes": item.notes,
        "situation": situation,
        "days_until": days,
    }


def reproduction_dict(item: ReproductionEvent, animal: Animal) -> dict:
    return {
        "id": item.id,
        "animal_id": item.animal_id,
        "animal_tag": animal.tag_number,
        "animal_name": animal.name,
        "event_type": item.event_type,
        "event_date": item.event_date,
        "bull_or_semen": item.bull_or_semen,
        "result": item.result,
        "expected_calving_at": item.expected_calving_at,
        "calf_tag": item.calf_tag,
        "notes": item.notes,
    }


def paddock_dict(item: Paddock) -> dict:
    occupancy = (
        rounded(item.current_animals / item.capacity * 100, 1)
        if item.capacity
        else 0
    )
    rest_days = (
        max((date.today() - item.rest_started_at).days, 0)
        if item.rest_started_at
        else 0
    )
    return {
        "id": item.id,
        "name": item.name,
        "area_hectares": item.area_hectares,
        "capacity": item.capacity,
        "current_animals": item.current_animals,
        "status": item.status,
        "rest_started_at": item.rest_started_at,
        "occupancy_rate": occupancy,
        "rest_days": rest_days,
    }


def finance_summary(db: Session, farm_id: int) -> dict:
    animals = get_animals(db, farm_id)
    entries = list(
        db.scalars(
            select(FinancialEntry)
            .where(FinancialEntry.farm_id == farm_id)
            .order_by(FinancialEntry.occurred_at.desc(), FinancialEntry.id.desc())
        ).all()
    )
    revenue = sum(item.amount for item in entries if item.entry_type == "Receita")
    expenses = sum(item.amount for item in entries if item.entry_type == "Despesa")
    active_count = sum(item.status in ACTIVE_STATUSES for item in animals)
    lots: dict[str, dict] = defaultdict(
        lambda: {"revenue": 0.0, "expenses": 0.0}
    )
    for item in entries:
        lot = item.lot or "Geral"
        key = "revenue" if item.entry_type == "Receita" else "expenses"
        lots[lot][key] += item.amount
    return {
        "entries": [
            {
                "id": item.id,
                "entry_type": item.entry_type,
                "category": item.category,
                "description": item.description,
                "amount": rounded(item.amount),
                "occurred_at": item.occurred_at,
                "lot": item.lot,
                "animal_id": item.animal_id,
                "notes": item.notes,
            }
            for item in entries
        ],
        "revenue": rounded(revenue),
        "expenses": rounded(expenses),
        "profit": rounded(revenue - expenses),
        "cost_per_animal": rounded(expenses / active_count) if active_count else 0,
        "profit_per_animal": (
            rounded((revenue - expenses) / active_count) if active_count else 0
        ),
        "lots": [
            {
                "lot": lot,
                "revenue": rounded(values["revenue"]),
                "expenses": rounded(values["expenses"]),
                "profit": rounded(values["revenue"] - values["expenses"]),
            }
            for lot, values in sorted(lots.items())
        ],
    }


def arroba_summary(db: Session, user: User) -> dict:
    animals = [
        item for item in get_animals(db, user.farm_id)
        if item.status in ACTIVE_STATUSES
    ]
    price = user.farm.arroba_price or 340
    yield_percent = user.farm.carcass_yield_percent or 50
    rows = []
    for animal in animals:
        carcass = animal.current_weight * yield_percent / 100
        arrobas = carcass / 15
        last_date = db.scalar(
            select(Weighing.weighed_at)
            .where(Weighing.animal_id == animal.id)
            .order_by(Weighing.weighed_at.desc())
            .limit(1)
        )
        near_target = 420 <= animal.current_weight < 450
        rows.append(
            {
                "animal_id": animal.id,
                "tag_number": animal.tag_number,
                "name": animal.name,
                "lot": animal.lot,
                "live_weight": rounded(animal.current_weight, 1),
                "carcass_weight": rounded(carcass, 1),
                "estimated_arrobas": rounded(arrobas, 2),
                "estimated_value": rounded(arrobas * price),
                "last_weighing_at": last_date,
                "sale_ready": bool(
                    animal.sale_ready or animal.current_weight >= 450
                ),
                "near_target": near_target,
                "kilograms_to_target": rounded(max(450 - animal.current_weight, 0), 1),
            }
        )
    rows.sort(key=lambda item: item["estimated_value"], reverse=True)
    return {
        "arroba_price": rounded(price),
        "carcass_yield_percent": rounded(yield_percent, 1),
        "total_live_weight": rounded(sum(item["live_weight"] for item in rows), 1),
        "total_arrobas": rounded(sum(item["estimated_arrobas"] for item in rows), 2),
        "estimated_total_value": rounded(
            sum(item["estimated_value"] for item in rows)
        ),
        "sale_ready_count": sum(item["sale_ready"] for item in rows),
        "near_target_count": sum(item["near_target"] for item in rows),
        "methodology": (
            "Estimativa: peso vivo × rendimento de carcaça ÷ 15 kg × preço da arroba."
        ),
        "animals": rows,
    }


def alerts_for_farm(db: Session, farm_id: int) -> list[dict]:
    animals = {item.id: item for item in get_animals(db, farm_id)}
    alerts = []
    records = db.scalars(
        select(HealthRecord)
        .join(Animal, Animal.id == HealthRecord.animal_id)
        .where(Animal.farm_id == farm_id)
    ).all()
    for item in records:
        situation, _ = health_situation(item.next_application_at)
        if situation in {"expired", "upcoming"}:
            animal = animals[item.animal_id]
            alerts.append(
                {
                    "type": "danger" if situation == "expired" else "warning",
                    "category": "Sanidade",
                    "title": item.product_name,
                    "detail": f"Brinco {animal.tag_number} • {item.record_type}",
                    "date": item.next_application_at,
                }
            )
    events = db.scalars(
        select(ReproductionEvent)
        .join(Animal, Animal.id == ReproductionEvent.animal_id)
        .where(
            Animal.farm_id == farm_id,
            ReproductionEvent.expected_calving_at.is_not(None),
        )
    ).all()
    for item in events:
        days = (item.expected_calving_at - date.today()).days
        if 0 <= days <= 45:
            animal = animals[item.animal_id]
            alerts.append(
                {
                    "type": "reproduction",
                    "category": "Reprodução",
                    "title": "Parto previsto",
                    "detail": f"Brinco {animal.tag_number} em {days} dias",
                    "date": item.expected_calving_at,
                }
            )
    paddocks = db.scalars(
        select(Paddock).where(Paddock.farm_id == farm_id)
    ).all()
    for item in paddocks:
        rate = item.current_animals / item.capacity * 100 if item.capacity else 0
        if rate >= 90:
            alerts.append(
                {
                    "type": "warning",
                    "category": "Pastagens",
                    "title": f"{item.name} com alta ocupação",
                    "detail": f"{rounded(rate, 1)}% da capacidade",
                    "date": date.today(),
                }
            )
    return sorted(alerts, key=lambda item: item["date"] or date.max)


def month_sequence(count: int = 12) -> list[str]:
    current = date.today().replace(day=1)
    values = []
    for offset in range(count - 1, -1, -1):
        year = current.year
        month = current.month - offset
        while month <= 0:
            month += 12
            year -= 1
        values.append(f"{year:04d}-{month:02d}")
    return values


def dashboard_data(db: Session, user: User) -> dict:
    animals = get_animals(db, user.farm_id)
    active = [item for item in animals if item.status in ACTIVE_STATUSES]
    gains = [daily_gain(db, item.id) for item in active]
    gains = [item for item in gains if item is not None]
    health = list(
        db.scalars(
            select(HealthRecord)
            .join(Animal, Animal.id == HealthRecord.animal_id)
            .where(Animal.farm_id == user.farm_id)
        ).all()
    )
    finance = finance_summary(db, user.farm_id)
    current_month = date.today().strftime("%Y-%m")
    current_entries = [
        item for item in finance["entries"]
        if item["occurred_at"].strftime("%Y-%m") == current_month
    ]
    monthly_revenue = sum(
        item["amount"] for item in current_entries
        if item["entry_type"] == "Receita"
    )
    monthly_expenses = sum(
        item["amount"] for item in current_entries
        if item["entry_type"] == "Despesa"
    )
    months = month_sequence()
    financial_group = {
        month: {"month": month, "revenue": 0.0, "expenses": 0.0}
        for month in months
    }
    for item in finance["entries"]:
        month = item["occurred_at"].strftime("%Y-%m")
        if month in financial_group:
            key = "revenue" if item["entry_type"] == "Receita" else "expenses"
            financial_group[month][key] += item["amount"]
    weights_group: dict[str, list[float]] = defaultdict(list)
    vaccines_group: dict[str, int] = defaultdict(int)
    weighings = list(
        db.scalars(
            select(Weighing)
            .join(Animal, Animal.id == Weighing.animal_id)
            .where(Animal.farm_id == user.farm_id)
            .order_by(Weighing.weighed_at.desc())
        ).all()
    )
    animal_map = {item.id: item for item in animals}
    for item in weighings:
        weights_group[item.weighed_at.strftime("%Y-%m")].append(item.weight)
    for item in health:
        if item.record_type == "Vacina":
            vaccines_group[item.applied_at.strftime("%Y-%m")] += 1
    expired = sum(
        bool(
            item.next_application_at
            and item.next_application_at < date.today()
        )
        for item in health
    )
    upcoming = sum(
        bool(
            item.next_application_at
            and 0 <= (item.next_application_at - date.today()).days <= 30
        )
        for item in health
    )
    female_count = sum(item.sex == "Fêmea" for item in active)
    pregnant = sum(item.status == "Prenhe" for item in animals)
    area = user.farm.area_hectares or 0
    created_group: dict[str, int] = defaultdict(int)
    for item in animals:
        created_group[item.created_at.strftime("%Y-%m")] += 1
    cumulative = 0
    herd_evolution = []
    all_months = month_sequence()
    before_first = sum(
        item.created_at.strftime("%Y-%m") < all_months[0] for item in animals
    )
    cumulative += before_first
    for month in all_months:
        cumulative += created_group[month]
        herd_evolution.append({"month": month, "total": cumulative})
    return {
        "total_animals": len(animals),
        "active_animals": len(active),
        "average_weight": rounded(mean([item.current_weight for item in active]), 1)
        if active else 0,
        "expired_vaccines": expired,
        "upcoming_vaccines_count": upcoming,
        "pregnant_animals": pregnant,
        "pregnancy_rate": rounded(pregnant / female_count * 100, 1)
        if female_count else 0,
        "average_daily_gain": rounded(mean(gains), 3) if gains else 0,
        "sale_ready_animals": sum(
            bool(item.sale_ready or item.current_weight >= 450) for item in active
        ),
        "monthly_revenue": rounded(monthly_revenue),
        "monthly_expenses": rounded(monthly_expenses),
        "monthly_profit": rounded(monthly_revenue - monthly_expenses),
        "monthly_cost_per_head": (
            rounded(monthly_expenses / len(active)) if active else 0
        ),
        "stocking_rate": rounded(len(active) / area, 2) if area else 0,
        "mortality_rate": rounded(
            sum(item.status == "Morto" for item in animals)
            / max(len(animals), 1)
            * 100,
            1,
        ),
        "weight_evolution": [
            {
                "month": month,
                "weight": rounded(mean(weights_group[month]), 1)
                if weights_group[month] else 0,
            }
            for month in months
        ],
        "herd_evolution": herd_evolution,
        "financial_evolution": [
            {
                "month": month,
                "revenue": rounded(financial_group[month]["revenue"]),
                "expenses": rounded(financial_group[month]["expenses"]),
            }
            for month in months
        ],
        "vaccines_by_month": [
            {"month": month, "count": vaccines_group[month]}
            for month in months
        ],
        "recent_weighings": [
            weighing_dict(item, animal_map[item.animal_id])
            for item in weighings[:8]
        ],
        "trends": {
            "total_animals": 0,
            "average_weight": 0,
            "monthly_revenue": 0,
            "monthly_expenses": 0,
            "monthly_profit": 0,
        },
    }


def lot_summary(db: Session, user: User) -> dict:
    animals = [
        item for item in get_animals(db, user.farm_id)
        if item.status in ACTIVE_STATUSES
    ]
    finance = finance_summary(db, user.farm_id)
    finance_lots = {item["lot"]: item for item in finance["lots"]}
    arroba = {item["animal_id"]: item for item in arroba_summary(db, user)["animals"]}
    grouped: dict[str, list[Animal]] = defaultdict(list)
    for animal in animals:
        grouped[animal.lot or "Sem lote"].append(animal)
    items = []
    for lot, lot_animals in grouped.items():
        gains = [daily_gain(db, animal.id) for animal in lot_animals]
        gains = [value for value in gains if value is not None]
        financial = finance_lots.get(lot, {"revenue": 0, "expenses": 0})
        estimated_value = sum(
            arroba.get(animal.id, {}).get("estimated_value", 0)
            for animal in lot_animals
        )
        items.append(
            {
                "lot": lot,
                "animal_count": len(lot_animals),
                "average_weight": rounded(
                    mean([item.current_weight for item in lot_animals]), 1
                ),
                "average_daily_gain": rounded(mean(gains), 3) if gains else None,
                "estimated_value": rounded(estimated_value),
                "revenue": financial["revenue"],
                "expenses": financial["expenses"],
                "estimated_profit": rounded(
                    financial["revenue"] - financial["expenses"]
                ),
            }
        )
    items.sort(
        key=lambda item: item["average_daily_gain"]
        if item["average_daily_gain"] is not None else -999,
        reverse=True,
    )
    with_gain = [item for item in items if item["average_daily_gain"] is not None]
    return {
        "items": items,
        "best_performance": with_gain[0] if with_gain else None,
        "lowest_performance": with_gain[-1] if with_gain else None,
        "most_profitable": max(
            items,
            key=lambda item: item["estimated_profit"],
            default=None,
        ),
    }


def reproduction_indicators(db: Session, farm_id: int) -> dict:
    animals = get_animals(db, farm_id)
    eligible = [
        item for item in animals
        if item.sex == "Fêmea" and item.status in ACTIVE_STATUSES
    ]
    events = list(
        db.scalars(
            select(ReproductionEvent)
            .join(Animal, Animal.id == ReproductionEvent.animal_id)
            .where(Animal.farm_id == farm_id)
        ).all()
    )
    pregnant = sum(item.status == "Prenhe" for item in animals)
    births = sum(item.event_type == "Parto" for item in events)
    calves = sum(item.category in {"Bezerro", "Bezerra"} for item in animals)
    return {
        "eligible_females": len(eligible),
        "pregnant_animals": pregnant,
        "pregnancy_rate": rounded(pregnant / len(eligible) * 100, 1)
        if eligible else 0,
        "births": births,
        "birth_rate": rounded(births / len(eligible) * 100, 1)
        if eligible else 0,
        "calves": calves,
        "weaning_rate": rounded(calves / max(births, 1) * 100, 1)
        if births else 0,
    }


def rankings(db: Session, user: User) -> dict:
    animals = [
        item for item in get_animals(db, user.farm_id)
        if item.status in ACTIVE_STATUSES
    ]
    arroba = {item["animal_id"]: item for item in arroba_summary(db, user)["animals"]}
    rows = []
    for item in animals:
        gain = daily_gain(db, item.id) or 0
        value = arroba.get(item.id, {}).get("estimated_value", 0)
        rows.append(
            {
                "id": item.id,
                "tag_number": item.tag_number,
                "name": item.name,
                "breed": item.breed,
                "weight": rounded(item.current_weight, 1),
                "gmd": rounded(gain, 3),
                "estimated_value": rounded(value),
                "score": rounded(item.current_weight / 10 + max(gain, 0) * 40, 1),
            }
        )
    return {
        "heaviest": sorted(rows, key=lambda item: item["weight"], reverse=True),
        "best_gmd": sorted(rows, key=lambda item: item["gmd"], reverse=True),
        "highest_value": sorted(
            rows, key=lambda item: item["estimated_value"], reverse=True
        ),
        "overall": sorted(rows, key=lambda item: item["score"], reverse=True),
    }


def genetics(db: Session, farm_id: int) -> dict:
    animals = get_animals(db, farm_id)
    families: dict[str, list[Animal]] = defaultdict(list)
    lineages: dict[str, int] = defaultdict(int)
    for animal in animals:
        if animal.lineage:
            lineages[animal.lineage] += 1
        for parent in {animal.father_tag, animal.mother_tag} - {None, ""}:
            families[parent].append(animal)
    family_ranking = []
    for parent, children in families.items():
        gains = [daily_gain(db, item.id) for item in children]
        gains = [item for item in gains if item is not None]
        family_ranking.append(
            {
                "parent_tag": parent,
                "offspring_count": len(children),
                "average_offspring_weight": rounded(
                    mean([item.current_weight for item in children]), 1
                ),
                "average_offspring_gmd": rounded(mean(gains), 3)
                if gains else None,
                "offspring": [
                    {"id": item.id, "tag_number": item.tag_number}
                    for item in children
                ],
            }
        )
    return {
        "animals_with_genealogy": sum(
            bool(item.father_tag or item.mother_tag) for item in animals
        ),
        "lineages": dict(lineages),
        "family_ranking": sorted(
            family_ranking,
            key=lambda item: item["average_offspring_weight"],
            reverse=True,
        ),
    }


def benchmark(db: Session, user: User) -> list[dict]:
    dashboard = dashboard_data(db, user)
    targets = [
        ("Ganho médio diário", dashboard["average_daily_gain"], 0.7, "kg/dia", False),
        ("Taxa de prenhez", dashboard["pregnancy_rate"], 75, "%", False),
        ("Mortalidade", dashboard["mortality_rate"], 2, "%", True),
        ("Lotação", dashboard["stocking_rate"], 1.5, "cab/ha", False),
    ]
    return [
        {
            "name": name,
            "current": current,
            "target": target,
            "unit": unit,
            "lower_is_better": lower,
            "achievement": rounded(
                (target / max(current, 0.01) if lower else current / target) * 100,
                1,
            ),
        }
        for name, current, target, unit, lower in targets
    ]


def profit_center(db: Session, user: User) -> dict:
    finance = finance_summary(db, user.farm_id)
    arroba = arroba_summary(db, user)
    monthly = []
    grouped: dict[str, dict] = defaultdict(
        lambda: {"revenue": 0.0, "expenses": 0.0}
    )
    for entry in finance["entries"]:
        month = entry["occurred_at"].strftime("%Y-%m")
        key = "revenue" if entry["entry_type"] == "Receita" else "expenses"
        grouped[month][key] += entry["amount"]
    for month in month_sequence():
        monthly.append(
            {
                "month": month,
                "revenue": rounded(grouped[month]["revenue"]),
                "expenses": rounded(grouped[month]["expenses"]),
            }
        )
    active_count = sum(
        item.status in ACTIVE_STATUSES for item in get_animals(db, user.farm_id)
    )
    return {
        "herd_value": arroba["estimated_total_value"],
        "accumulated_revenue": finance["revenue"],
        "total_cost": finance["expenses"],
        "net_profit": finance["profit"],
        "profit_per_head": rounded(finance["profit"] / active_count)
        if active_count else 0,
        "lots": finance["lots"],
        "monthly": monthly,
    }


def ai_insights(db: Session, user: User) -> dict:
    dashboard = dashboard_data(db, user)
    expired = dashboard["expired_vaccines"]
    animals = get_animals(db, user.farm_id)
    stale = 0
    for animal in animals:
        last = db.scalar(
            select(Weighing.weighed_at)
            .where(Weighing.animal_id == animal.id)
            .order_by(Weighing.weighed_at.desc())
            .limit(1)
        )
        if not last or (date.today() - last).days > 60:
            stale += 1
    overloaded = sum(
        item["occupancy_rate"] >= 90
        for item in [
            paddock_dict(row)
            for row in db.scalars(
                select(Paddock).where(Paddock.farm_id == user.farm_id)
            ).all()
        ]
    )
    filled = sum(
        bool(item.tag_number and item.breed and item.birth_date and item.lot)
        for item in animals
    )
    quality = rounded(filled / max(len(animals), 1) * 100, 0)
    return {
        "indicators": [
            {"label": "Animais ativos", "value": dashboard["active_animals"], "unit": ""},
            {"label": "Peso médio", "value": dashboard["average_weight"], "unit": "kg"},
            {"label": "GMD médio", "value": dashboard["average_daily_gain"], "unit": "kg/dia"},
            {"label": "Lucro mensal", "value": dashboard["monthly_profit"], "unit": "R$"},
        ],
        "alerts": {
            "expired_health": expired,
            "stale_weighings": stale,
            "overloaded_paddocks": overloaded,
        },
        "data_quality": quality,
        "suggestions": [
            "Faça um diagnóstico geral da fazenda.",
            "Quais animais estão ganhando menos peso?",
            "Analise os custos deste mês.",
            "Quais animais estão próximos do peso de venda?",
        ],
        "methodology": [
            "GMD calculado com as duas últimas pesagens de cada animal.",
            "Valor comercial estimado pelo rendimento de carcaça e preço da arroba.",
            "Indicadores financeiros calculados somente com lançamentos cadastrados.",
        ],
    }


def ai_answer(db: Session, user: User, question: str) -> dict:
    text = question.lower()
    dashboard = dashboard_data(db, user)
    rank = rankings(db, user)
    finance = finance_summary(db, user.farm_id)
    arroba = arroba_summary(db, user)
    title = "Diagnóstico geral da fazenda"
    answer = (
        f"A fazenda possui {dashboard['active_animals']} animais ativos, "
        f"peso médio de {dashboard['average_weight']} kg e lucro mensal "
        f"de R$ {dashboard['monthly_profit']:.2f}."
    )
    sections = []
    metrics = [
        {"label": "Animais ativos", "value": dashboard["active_animals"], "unit": ""},
        {"label": "Peso médio", "value": dashboard["average_weight"], "unit": "kg"},
        {"label": "GMD", "value": dashboard["average_daily_gain"], "unit": "kg/dia"},
    ]
    if "peso" in text or "ganhando" in text or "gmd" in text:
        title = "Desempenho de ganho de peso"
        low = list(reversed(rank["best_gmd"]))[:5]
        answer = (
            "A análise compara as duas últimas pesagens disponíveis. "
            f"O GMD médio atual é {dashboard['average_daily_gain']} kg/dia."
        )
        sections = [
            {
                "title": "Animais que merecem acompanhamento",
                "items": [
                    f"Brinco {item['tag_number']}: {item['gmd']} kg/dia"
                    for item in low
                ],
            }
        ]
    elif "custo" in text or "finance" in text or "lucro" in text:
        title = "Análise financeira"
        answer = (
            f"As receitas acumuladas são R$ {finance['revenue']:.2f}, "
            f"as despesas R$ {finance['expenses']:.2f} e o resultado "
            f"R$ {finance['profit']:.2f}."
        )
        metrics = [
            {"label": "Receitas", "value": finance["revenue"], "unit": "R$"},
            {"label": "Despesas", "value": finance["expenses"], "unit": "R$"},
            {"label": "Resultado", "value": finance["profit"], "unit": "R$"},
        ]
    elif "venda" in text or "arroba" in text or "450" in text:
        title = "Projeção comercial do rebanho"
        answer = (
            f"O valor estimado do rebanho é R$ "
            f"{arroba['estimated_total_value']:.2f}, com "
            f"{arroba['sale_ready_count']} animal(is) pronto(s) para venda."
        )
        sections = [
            {
                "title": "Maiores valores estimados",
                "items": [
                    f"Brinco {item['tag_number']}: "
                    f"{item['live_weight']} kg, R$ {item['estimated_value']:.2f}"
                    for item in arroba["animals"][:5]
                ],
            }
        ]
    return {
        "title": title,
        "answer": answer,
        "sections": sections,
        "metrics": metrics,
        "evidence": [
            "Animais, pesagens, sanidade e lançamentos da fazenda atual.",
            f"Consulta processada em {datetime.now().isoformat(timespec='seconds')}.",
        ],
        "assumptions": [
            "Somente registros cadastrados no Novaris Agro foram considerados."
        ],
        "suggestions": [
            "Quais animais estão próximos do peso de venda?",
            "Analise os custos deste mês.",
        ],
        "confidence": {"label": "alta", "score": 0.9},
        "disclaimer": (
            "As projeções apoiam a gestão e devem ser validadas pelo responsável técnico."
        ),
    }
