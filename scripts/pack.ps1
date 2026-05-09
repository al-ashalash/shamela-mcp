# Build everything and produce shamela-mcp-<version>.mcpb at the repo root.
# Requires: node + npm + JDK 21 + the @anthropic-ai/mcpb CLI on PATH (or
# accessible via npx).

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

# Read version from manifest.json so the .mcpb filename matches.
$manifestRaw = Get-Content -Raw -Path (Join-Path $repoRoot "manifest.json")
$manifest = $manifestRaw | ConvertFrom-Json
$version = $manifest.version
if (-not $version) { throw "manifest.json has no version field" }

Write-Host "Building shamela-mcp v$version..."

Write-Host "[1/3] Building Node server..."
npm run build:server
if ($LASTEXITCODE -ne 0) { throw "npm run build:server failed" }

Write-Host "[2/3] Building Java helper..."
powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build-java.ps1")
if ($LASTEXITCODE -ne 0) { throw "build-java.ps1 failed" }

Write-Host "[3/3] Packing .mcpb..."
$outFile = Join-Path $repoRoot ("shamela-mcp-$version.mcpb")

# Try `mcpb pack`; fall back to `npx @anthropic-ai/mcpb pack`.
$packed = $false
try {
    & mcpb pack $repoRoot $outFile
    if ($LASTEXITCODE -eq 0) { $packed = $true }
} catch {
    # mcpb not on PATH; try npx
}
if (-not $packed) {
    Write-Host "  mcpb not on PATH; falling back to npx..."
    & npx --yes @anthropic-ai/mcpb pack $repoRoot $outFile
    if ($LASTEXITCODE -ne 0) { throw "mcpb pack failed via both PATH and npx" }
}

if (-not (Test-Path $outFile)) { throw "Pack reported success but $outFile is missing" }
$size = (Get-Item $outFile).Length
Write-Host ("Produced {0} ({1:N1} MB)" -f $outFile, ($size / 1MB))
