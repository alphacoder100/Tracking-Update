# Quick-start benchmark script: compare recognition models (buffalo_l, buffalo_s, AdaFace, etc.)
# Usage: .\run_model_comparison.ps1 [-Models "buffalo_l,buffalo_s,adaface"] [-Align "resize|detect"]
# Example: .\run_model_comparison.ps1 -Models "buffalo_l,buffalo_s,adaface" -Align detect

param(
    [string]$Models = "buffalo_l,buffalo_s,adaface",
    [string]$Align = "resize"
)

$ErrorActionPreference = "Stop"

# Activate backend venv if it exists
$venvPath = ".\backend\venv\Scripts\Activate.ps1"
if (Test-Path $venvPath) {
    & $venvPath
}

Write-Host "🚀 Running model comparison benchmark..." -ForegroundColor Cyan
Write-Host "  Models: $Models" -ForegroundColor Gray
Write-Host "  Align mode: $Align" -ForegroundColor Gray
Write-Host "  Dataset: storage/visitor_photos/" -ForegroundColor Gray
Write-Host ""

python -m backend.benchmark recognition `
    --models $Models `
    --align $Align `
    --device cpu

Write-Host ""
Write-Host "✅ Benchmark complete! Results saved to storage/benchmarks/" -ForegroundColor Green
