# Backend Novaris Agro

API FastAPI restaurada para o frontend atual do Novaris Agro.

## Executar localmente

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL="sqlite:///./novaris_agro.db"
$env:SEED_DEMO="true"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Acesse:

- API: `http://127.0.0.1:8000`
- Swagger: `http://127.0.0.1:8000/docs`
- Saúde: `http://127.0.0.1:8000/health`

Usuário demonstrativo:

```text
E-mail: demo@novarisagro.com.br
Senha: 123456
```

## Render

Ao configurar manualmente um Web Service, selecione `backend` como Root
Directory e use:

```text
Build Command: pip install -r requirements.txt
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health Check Path: /health
```

Crie um PostgreSQL no Render e configure:

```text
DATABASE_URL=<URL interna do PostgreSQL>
SECRET_KEY=<chave longa e aleatória>
ACCESS_TOKEN_MINUTES=720
SEED_DEMO=true
ALLOWED_ORIGINS=https://novaris-agro-web.onrender.com
FRONTEND_URL=https://novaris-agro-web.onrender.com
```

O arquivo `render.yaml` desta pasta também permite criar a API e o PostgreSQL
por Blueprint quando esta pasta for a raiz de um repositório.
