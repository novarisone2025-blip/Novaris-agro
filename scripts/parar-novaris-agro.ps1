$ErrorActionPreference = "SilentlyContinue"

$raiz = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$arquivoPid = Join-Path $raiz ".novaris-agro.pid"

if (Test-Path $arquivoPid) {
    $servidorPid = Get-Content $arquivoPid | Select-Object -First 1
    if ($servidorPid) {
        Stop-Process -Id $servidorPid -Force
    }
    Remove-Item $arquivoPid -Force
}

$conexoes = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue
foreach ($conexao in $conexoes) {
    Stop-Process -Id $conexao.OwningProcess -Force
}

Write-Host "Novaris Agro encerrado." -ForegroundColor Green
