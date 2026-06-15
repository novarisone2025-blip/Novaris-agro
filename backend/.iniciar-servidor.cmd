@echo off
cd /d "C:\Users\Davi\Documents\Codex\2026-06-14\crie-um-sistema-saas-chamado-novaris\outputs\novaris-agro\backend"
set "PYTHONPATH=C:\Users\Davi\Documents\Codex\2026-06-14\crie-um-sistema-saas-chamado-novaris\outputs\novaris-agro\backend;C:\Users\Davi\Documents\Codex\2026-06-08\files-mentioned-by-the-user-texto\outputs\novaris-one\backend\.deps"
set "DATABASE_URL=sqlite:///./novaris_agro.db"
set "SEED_DEMO=true"
"C:\Users\Davi\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 1>"C:\Users\Davi\Documents\Codex\2026-06-14\crie-um-sistema-saas-chamado-novaris\outputs\novaris-agro\backend\novaris-agro.log" 2>"C:\Users\Davi\Documents\Codex\2026-06-14\crie-um-sistema-saas-chamado-novaris\outputs\novaris-agro\backend\novaris-agro-error.log"
