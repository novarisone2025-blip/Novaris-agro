# Novaris Agro

Plataforma SaaS profissional para gestão pecuária bovina, com interface
responsiva e foco no uso em campo.

## Iniciar no Windows

Dê dois cliques em:

```text
INICIAR_NOVARIS_AGRO.bat
```

O sistema será aberto automaticamente em `http://127.0.0.1:8000`.
Para encerrar, use `PARAR_NOVARIS_AGRO.bat`.

Na primeira execução em outro computador, o iniciador pode instalar as
dependências do Python automaticamente.

## Módulos disponíveis

- Login e cadastro de conta com fazenda
- Autenticação JWT
- Isolamento dos dados por fazenda
- Ficha completa do animal e histórico integrado
- Pesagens com ganho diário, mensal e ranking de desempenho
- Sanidade com vacinas, vermífugos, medicamentos e alertas
- Reprodução com cio, inseminação, diagnóstico e previsão de parto
- Gestão visual de piquetes e ocupação
- Financeiro com fluxo de caixa e rentabilidade por lote
- Dashboard executivo com indicadores e gráficos
- Central de alertas operacionais
- Relatórios em PDF e Excel
- Multiusuários com perfis e permissões
- IA Agro para consultas sobre os dados cadastrados
- Layout responsivo com navegação própria para celular

## IA Agro analítica

A IA Agro não inventa números nem depende de respostas genéricas. Ela consulta
os registros da fazenda e apresenta evidências, premissas e nível de confiança.

Análises disponíveis:

- Diagnóstico geral da operação
- Ganho médio diário e projeção mensal
- Previsão matemática para peso-alvo
- Animais potencialmente prontos para venda
- Vacinas, medicamentos e aplicações vencidas
- Taxa cadastral de prenhez e partos previstos
- Ocupação, cabeças por hectare e UA por hectare
- Receita, despesas, margem e custo por animal
- Completude e qualidade dos dados cadastrados

Principais fórmulas:

- `GMD = (peso atual - peso anterior) / dias entre pesagens`
- `Projeção de dias = (peso-alvo - peso atual) / GMD`
- `UA estimada = peso vivo total / 450 kg`
- `Ocupação = animais atuais / capacidade cadastrada`
- `Lucro = receitas cadastradas - despesas cadastradas`
- `Custo por animal = despesas do mês / animais ativos`

As projeções são identificadas como estimativas. Protocolos sanitários,
nutricionais, reprodutivos e de lotação devem ser validados pelos responsáveis
técnicos da propriedade.

## Tecnologias

- React 19 + Vite
- FastAPI + SQLAlchemy
- PostgreSQL 16
- JWT assinado com HMAC SHA-256
- Docker Compose

## Executar com Docker

Na raiz do projeto:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Acesse:

- Aplicação: http://localhost:3000
- API: http://localhost:8000
- Swagger: http://localhost:8000/docs

## Executar para desenvolvimento

O backend usa SQLite automaticamente quando `DATABASE_URL` não é informada.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Em outro terminal:

```powershell
cd frontend
npm install
npm run dev
```

## Acesso de demonstração

Quando `SEED_DEMO=true`, a API cria uma fazenda com dados de exemplo:

- E-mail: `demo@novarisagro.com.br`
- Senha: `123456`

Em produção, defina `SEED_DEMO=false`, use uma `SECRET_KEY` forte e substitua todas as credenciais padrão.

## Estrutura

```text
backend/
  app/
    database.py
    main.py
    models.py
    schemas.py
    security.py
  tests/
frontend/
  src/
    App.jsx
    api.js
    styles.css
docker-compose.yml
```
