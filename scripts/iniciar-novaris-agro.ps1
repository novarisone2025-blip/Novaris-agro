$ErrorActionPreference = "Stop"

$raiz = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backend = Join-Path $raiz "backend"
$frontend = Join-Path $raiz "frontend"
$porta = 8000
$url = "http://127.0.0.1:$porta"
$arquivoPid = Join-Path $raiz ".novaris-agro.pid"
$log = Join-Path $backend "novaris-agro.log"
$logErro = Join-Path $backend "novaris-agro-error.log"
$comandoServidor = Join-Path $backend ".iniciar-servidor.cmd"

function Testar-Servidor {
    try {
        $resposta = Invoke-WebRequest "$url/health" -UseBasicParsing -TimeoutSec 2
        return $resposta.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Abrir-No-Navegador([string]$endereco) {
    & "$env:WINDIR\explorer.exe" $endereco
}

function Encontrar-Python {
    $candidatos = @(
        (Join-Path $backend ".venv\Scripts\python.exe"),
        (Join-Path $backend ".deps\bin\python.exe"),
        "C:\Users\Davi\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
    )

    foreach ($candidato in $candidatos) {
        if (Test-Path $candidato) {
            return $candidato
        }
    }

    $comando = Get-Command python -ErrorAction SilentlyContinue
    if ($comando) {
        return $comando.Source
    }

    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        return $py.Source
    }

    return $null
}

function Preparar-Dependencias([string]$python) {
    $depsLocal = Join-Path $backend ".deps"
    $depsCodex = "C:\Users\Davi\Documents\Codex\2026-06-08\files-mentioned-by-the-user-texto\outputs\novaris-one\backend\.deps"

    if (Test-Path (Join-Path $depsLocal "fastapi")) {
        return $depsLocal
    }

    if (Test-Path (Join-Path $depsCodex "fastapi")) {
        return $depsCodex
    }

    $venv = Join-Path $backend ".venv"
    $pythonVenv = Join-Path $venv "Scripts\python.exe"
    if (-not (Test-Path $pythonVenv)) {
        Write-Host "Preparando o ambiente local pela primeira vez..." -ForegroundColor Cyan
        & $python -m venv $venv
    }

    Write-Host "Instalando as dependencias do backend..." -ForegroundColor Cyan
    & $pythonVenv -m pip install -r (Join-Path $backend "requirements.txt")
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao instalar as dependencias. Verifique sua conexao com a internet."
    }

    return $null
}

if (Testar-Servidor) {
    Write-Host "O Novaris Agro ja esta iniciado." -ForegroundColor Green
    Abrir-No-Navegador $url
    exit 0
}

$python = Encontrar-Python
if (-not $python) {
    Write-Host "Python nao foi encontrado neste computador." -ForegroundColor Red
    Write-Host "Instale o Python 3.11 ou superior em https://www.python.org/downloads/"
    Write-Host "Na instalacao, marque a opcao 'Add Python to PATH'."
    exit 1
}

$deps = Preparar-Dependencias $python
$env:PYTHONPATH = $backend
if ($deps) {
    $env:PYTHONPATH = "$backend;$deps"
}
$env:DATABASE_URL = "sqlite:///./novaris_agro.db"
$env:SEED_DEMO = "true"

Remove-Item $log, $logErro -Force -ErrorAction SilentlyContinue

Write-Host "Iniciando o Novaris Agro..." -ForegroundColor Cyan
$linhasComando = @(
    "@echo off",
    "cd /d `"$backend`"",
    "set `"PYTHONPATH=$env:PYTHONPATH`"",
    "set `"DATABASE_URL=sqlite:///./novaris_agro.db`"",
    "set `"SEED_DEMO=true`"",
    "`"$python`" -m uvicorn app.main:app --host 127.0.0.1 --port $porta 1>`"$log`" 2>`"$logErro`""
)
$linhasComando | Set-Content -Path $comandoServidor -Encoding ASCII

$shell = New-Object -ComObject WScript.Shell
$shell.Run("`"$comandoServidor`"", 0, $false) | Out-Null

for ($tentativa = 1; $tentativa -le 20; $tentativa++) {
    Start-Sleep -Milliseconds 500
    if (Testar-Servidor) {
        $conexao = Get-NetTCPConnection -State Listen -LocalPort $porta -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($conexao) {
            $conexao.OwningProcess | Set-Content $arquivoPid
        }
        Write-Host "Novaris Agro iniciado com sucesso!" -ForegroundColor Green
        Write-Host "Endereco: $url"
        Abrir-No-Navegador $url
        exit 0
    }
}

Write-Host "O servidor nao conseguiu iniciar." -ForegroundColor Red
if (Test-Path $logErro) {
    Get-Content $logErro -Tail 20
}
exit 1
