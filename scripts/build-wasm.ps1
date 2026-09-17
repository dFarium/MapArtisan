$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$cratePath = Join-Path $projectRoot 'rust\processing-wasm'
$outputPath = Join-Path $projectRoot 'src\wasm\processing'

wasm-pack build $cratePath `
    --target web `
    --release `
    --out-dir $outputPath

if ($LASTEXITCODE -ne 0) {
    throw "Serial wasm build failed with exit code $LASTEXITCODE"
}

$generatedIgnore = Join-Path $outputPath '.gitignore'
if (Test-Path -LiteralPath $generatedIgnore) {
    Remove-Item -LiteralPath $generatedIgnore
}
