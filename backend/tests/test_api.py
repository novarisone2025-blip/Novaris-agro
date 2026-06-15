import os
from pathlib import Path
from uuid import uuid4


TEST_DB = Path(__file__).resolve().parent / "novaris_agro_test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["SECRET_KEY"] = "test-secret-key-for-novaris-agro-api"
os.environ["SEED_DEMO"] = "true"

from fastapi.testclient import TestClient

from app.main import app


def auth_headers(client: TestClient) -> dict:
    response = client.post(
        "/auth/login",
        json={"email": "demo@novarisagro.com.br", "password": "123456"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_health_demo_login_and_required_routes():
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["database"] == "ok"

        headers = auth_headers(client)
        required = [
            "/auth/me",
            "/dashboard",
            "/animals",
            "/weighings",
            "/vaccinations",
            "/finance",
            "/paddocks",
            "/reproduction",
            "/arroba",
            "/alerts",
            "/reports",
        ]
        for path in required:
            response = client.get(path, headers=headers)
            assert response.status_code == 200, (path, response.text)

        query = client.post(
            "/ai/query",
            headers=headers,
            json={"question": "Faça um diagnóstico geral"},
        )
        assert query.status_code == 200
        assert query.json()["confidence"]["label"] == "alta"


def test_openapi_lists_required_routes():
    with TestClient(app) as client:
        response = client.get("/openapi.json")
        assert response.status_code == 200
        paths = response.json()["paths"]
        required = {
            "/health",
            "/auth/register",
            "/auth/login",
            "/auth/me",
            "/dashboard",
            "/animals",
            "/weighings",
            "/vaccinations",
            "/finance",
            "/paddocks",
            "/reproduction",
            "/arroba",
            "/alerts",
            "/ai/query",
            "/reports",
        }
        assert required.issubset(paths)


def test_frontend_contract_and_writes():
    with TestClient(app) as client:
        headers = auth_headers(client)
        frontend_paths = [
            "/health-records",
            "/health-calendar",
            "/permissions",
            "/weather",
            "/lots",
            "/rural-calendar",
            "/reproduction/indicators",
            "/rankings",
            "/genetics",
            "/inventory",
            "/trades",
            "/benchmark",
            "/profit-center",
            "/documents",
            "/whatsapp/recipients",
            "/whatsapp/outbox",
            "/ai/insights",
        ]
        for path in frontend_paths:
            response = client.get(path, headers=headers)
            assert response.status_code == 200, (path, response.text)

        tag = f"TEST-{uuid4().hex[:8]}"
        animal = client.post(
            "/animals",
            headers=headers,
            json={
                "tag_number": tag,
                "breed": "Nelore",
                "sex": "Macho",
                "birth_date": "2025-01-10",
                "current_weight": 310,
                "category": "Novilho",
                "lot": "Teste",
                "paddock": "Piquete Teste",
                "status": "Ativo",
            },
        )
        assert animal.status_code == 201
        animal_id = animal.json()["id"]
        assert animal.json()["unique_code"]

        weighing = client.post(
            "/weighings",
            headers=headers,
            json={
                "animal_id": animal_id,
                "weight": 320,
                "weighed_at": "2026-06-15",
            },
        )
        assert weighing.status_code == 201

        profile = client.get(
            f"/animals/{animal_id}/profile",
            headers=headers,
        )
        assert profile.status_code == 200
        assert profile.json()["current_weight"] == 320

        pdf = client.get("/reports/rebanho.pdf", headers=headers)
        xlsx = client.get("/reports/rebanho.xlsx", headers=headers)
        assert pdf.status_code == 200
        assert pdf.content.startswith(b"%PDF")
        assert xlsx.status_code == 200
        assert xlsx.content.startswith(b"PK")


def test_register_creates_isolated_farm():
    with TestClient(app) as client:
        email = f"farm-{uuid4().hex}@example.com"
        response = client.post(
            "/auth/register",
            json={
                "name": "Novo Produtor",
                "email": email,
                "password": "123456",
                "farm": {
                    "name": "Fazenda Nova",
                    "city": "Goiânia",
                    "state": "GO",
                    "area_hectares": 120,
                },
            },
        )
        assert response.status_code == 201
        headers = {
            "Authorization": f"Bearer {response.json()['access_token']}"
        }
        assert client.get("/animals", headers=headers).json() == []
        assert client.get("/auth/me", headers=headers).json()["farm"]["name"] == (
            "Fazenda Nova"
        )
