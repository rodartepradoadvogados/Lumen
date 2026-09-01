# Sincroniza esta pasta com o repositório e mostra o que mudou desde a última vez.
# Uso manual: clique duas vezes, ou rode "powershell -File scripts\sync-local.ps1" no terminal.
# Uso automático: ver docs/COMO-SINCRONIZAR.md para configurar o Agendador de Tarefas do Windows.

$ErrorActionPreference = "Stop"
Set-Location -Path (Join-Path $PSScriptRoot "..")

Write-Host "Lúmen — sincronizando com o GitHub..." -ForegroundColor Cyan

$branch = git rev-parse --abbrev-ref HEAD
if ($branch -ne "main") {
    Write-Host "Atenção: você está na branch '$branch', não em 'main'. Trocando para 'main'..." -ForegroundColor Yellow
    git checkout main
}

$before = git rev-parse HEAD
git fetch origin main --quiet
git pull origin main

$after = git rev-parse HEAD

if ($before -ne $after) {
    Write-Host "`nNovidades desde a última sincronização:" -ForegroundColor Green
    git log --oneline --no-merges "$before..$after"
    Write-Host "`nVeja docs/status/HISTORICO.md para o resumo em português de cada entrega." -ForegroundColor Green
} else {
    Write-Host "`nJá estava tudo em dia — nada novo desde a última sincronização." -ForegroundColor Yellow
}

Write-Host "`nPressione qualquer tecla para fechar..."
[void][System.Console]::ReadKey($true)
