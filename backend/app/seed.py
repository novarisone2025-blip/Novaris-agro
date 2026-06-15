import os
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Animal,
    Farm,
    FinancialEntry,
    HealthRecord,
    Paddock,
    ReproductionEvent,
    User,
    Vaccination,
    Weighing,
)
from app.security import hash_password


def seed_demo(db: Session) -> None:
    if os.getenv("SEED_DEMO", "true").lower() not in {"1", "true", "yes", "sim"}:
        return
    if db.scalar(select(User.id).where(User.email == "demo@novarisagro.com.br")):
        return

    farm = Farm(
        name="Fazenda Horizonte",
        city="Uberaba",
        state="MG",
        area_hectares=820,
        arroba_price=380,
        carcass_yield_percent=50,
    )
    db.add(farm)
    db.flush()
    db.add(
        User(
            farm_id=farm.id,
            name="Lucas Martins",
            email="demo@novarisagro.com.br",
            password_hash=hash_password("123456"),
            role="Administrador",
        )
    )

    animals = [
        Animal(
            farm_id=farm.id,
            tag_number="BR-1042",
            name="Aurora",
            breed="Nelore",
            sex="Fêmea",
            birth_date=date(2024, 2, 12),
            current_weight=402,
            lot="Lote A",
            paddock="Piquete Leste",
            status="Prenhe",
            unique_code=f"NOV-{farm.id}-000001",
        ),
        Animal(
            farm_id=farm.id,
            tag_number="BR-1088",
            name="Trovão",
            breed="Angus",
            sex="Macho",
            birth_date=date(2023, 10, 3),
            current_weight=512,
            lot="Lote B",
            paddock="Piquete Sul",
            status="Ativo",
            sale_ready=True,
            purchase_value=4200,
            unique_code=f"NOV-{farm.id}-000002",
        ),
        Animal(
            farm_id=farm.id,
            tag_number="BR-1121",
            name="Estrela",
            breed="Senepol",
            sex="Fêmea",
            birth_date=date(2024, 5, 21),
            current_weight=450,
            lot="Lote A",
            paddock="Piquete Norte",
            status="Ativo",
            unique_code=f"NOV-{farm.id}-000003",
        ),
        Animal(
            farm_id=farm.id,
            tag_number="BR-1165",
            breed="Nelore",
            sex="Fêmea",
            birth_date=date(2023, 8, 8),
            current_weight=428,
            lot="Matrizes",
            paddock="Piquete Leste",
            status="Ativo",
            unique_code=f"NOV-{farm.id}-000004",
        ),
        Animal(
            farm_id=farm.id,
            tag_number="BR-1190",
            name="Valente",
            breed="Guzerá",
            sex="Macho",
            birth_date=date(2024, 1, 15),
            current_weight=412,
            lot="Lote B",
            paddock="Piquete Sul",
            status="Ativo",
            unique_code=f"NOV-{farm.id}-000005",
        ),
    ]
    db.add_all(animals)
    db.flush()

    weights = [
        (animals[0], 328, date(2026, 1, 10)),
        (animals[0], 337, date(2026, 2, 12)),
        (animals[0], 346, date(2026, 3, 11)),
        (animals[0], 361, date(2026, 4, 13)),
        (animals[0], 374, date(2026, 5, 15)),
        (animals[0], 402, date(2026, 6, 12)),
        (animals[1], 487, date(2026, 6, 10)),
        (animals[2], 351, date(2026, 6, 8)),
    ]
    db.add_all(
        [
            Weighing(animal_id=animal.id, weight=weight, weighed_at=weighed_at)
            for animal, weight, weighed_at in weights
        ]
    )
    db.add_all(
        [
            Vaccination(
                animal_id=animals[0].id,
                vaccine_name="Clostridioses",
                applied_at=date(2026, 6, 5),
                next_dose_at=date(2026, 7, 5),
                batch="CL-2605",
            ),
            Vaccination(
                animal_id=animals[2].id,
                vaccine_name="Febre aftosa",
                applied_at=date(2026, 6, 1),
                next_dose_at=date(2026, 6, 28),
                batch="FA-1822",
            ),
        ]
    )
    db.add_all(
        [
            HealthRecord(
                animal_id=animals[0].id,
                record_type="Vacina",
                product_name="Clostridioses",
                applied_at=date(2026, 5, 5),
                next_application_at=date(2026, 6, 5),
                batch="CL-2605",
                dosage="5 ml",
                responsible="Dr. Rafael",
            ),
            HealthRecord(
                animal_id=animals[1].id,
                record_type="Vermífugo",
                product_name="Ivermectina",
                applied_at=date(2026, 5, 20),
                next_application_at=date(2026, 6, 25),
                batch="IV-0912",
                dosage="1 ml/50 kg",
            ),
            HealthRecord(
                animal_id=animals[2].id,
                record_type="Vacina",
                product_name="Brucelose",
                applied_at=date(2026, 6, 2),
                next_application_at=date(2026, 7, 2),
                batch="BR-8841",
                dosage="2 ml",
            ),
            HealthRecord(
                animal_id=animals[3].id,
                record_type="Medicamento",
                product_name="Antibiótico LA",
                applied_at=date(2026, 6, 8),
                expires_at=date(2027, 1, 15),
                batch="AT-1120",
                dosage="10 ml",
            ),
        ]
    )
    db.add_all(
        [
            ReproductionEvent(
                animal_id=animals[0].id,
                event_type="Diagnóstico de prenhez",
                event_date=date(2026, 5, 12),
                bull_or_semen="Nelore PO 908",
                result="Positivo",
                expected_calving_at=date(2026, 11, 28),
            ),
            ReproductionEvent(
                animal_id=animals[2].id,
                event_type="Inseminação artificial",
                event_date=date(2026, 6, 6),
                bull_or_semen="Sêmen Angus 442",
                result="Aguardando diagnóstico",
            ),
        ]
    )
    db.add_all(
        [
            Paddock(
                farm_id=farm.id,
                name="Piquete Norte",
                area_hectares=32,
                capacity=45,
                current_animals=28,
                status="Em uso",
            ),
            Paddock(
                farm_id=farm.id,
                name="Piquete Sul",
                area_hectares=25,
                capacity=36,
                current_animals=31,
                status="Em uso",
            ),
            Paddock(
                farm_id=farm.id,
                name="Piquete Leste",
                area_hectares=18,
                capacity=24,
                current_animals=0,
                rest_started_at=date(2026, 6, 1),
                status="Descanso",
            ),
        ]
    )
    db.add_all(
        [
            FinancialEntry(
                farm_id=farm.id,
                entry_type="Receita",
                category="Venda de animais",
                description="Venda lote de terminação",
                amount=48500,
                occurred_at=date(2026, 6, 4),
                lot="Lote B",
            ),
            FinancialEntry(
                farm_id=farm.id,
                entry_type="Despesa",
                category="Ração",
                description="Suplemento mineral",
                amount=8400,
                occurred_at=date(2026, 6, 3),
                lot="Lote A",
            ),
            FinancialEntry(
                farm_id=farm.id,
                entry_type="Despesa",
                category="Medicamentos",
                description="Protocolo sanitário",
                amount=2650,
                occurred_at=date(2026, 6, 7),
            ),
            FinancialEntry(
                farm_id=farm.id,
                entry_type="Despesa",
                category="Funcionários",
                description="Folha mensal",
                amount=12400,
                occurred_at=date(2026, 6, 5),
            ),
            FinancialEntry(
                farm_id=farm.id,
                entry_type="Receita",
                category="Venda de animais",
                description="Venda de descarte",
                amount=13600,
                occurred_at=date(2026, 5, 20),
                lot="Matrizes",
            ),
        ]
    )
    db.commit()
