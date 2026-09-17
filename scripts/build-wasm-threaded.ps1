param(
    [string]$Toolchain = 'nightly'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$cratePath = Join-Path $projectRoot 'rust\processing-wasm'
$outputPath = Join-Path $projectRoot 'src\wasm\processing-threaded'
$previousRustFlags = $env:RUSTFLAGS

try {
    $env:RUSTFLAGS = @(
        '-C target-feature=+atomics,+bulk-memory,+mutable-globals'
        '-C link-arg=--shared-memory'
        '-C link-arg=--max-memory=1073741824'
        '-C link-arg=--import-memory'
        '-C link-arg=--export=__heap_base'
        '-C link-arg=--export=__wasm_init_tls'
        '-C link-arg=--export=__tls_size'
        '-C link-arg=--export=__tls_align'
        '-C link-arg=--export=__tls_base'
    ) -join ' '

    rustup run $toolchain wasm-pack build $cratePath `
        --target web `
        --release `
        --out-dir $outputPath `
        -- `
        --features parallel `
        -Z build-std=panic_abort,std

    if ($LASTEXITCODE -ne 0) {
        throw "Threaded wasm build failed with exit code $LASTEXITCODE"
    }

    $generatedIgnore = Join-Path $outputPath '.gitignore'
    if (Test-Path -LiteralPath $generatedIgnore) {
        Remove-Item -LiteralPath $generatedIgnore
    }
}
finally {
    if ($null -eq $previousRustFlags) {
        Remove-Item Env:RUSTFLAGS -ErrorAction SilentlyContinue
    }
    else {
        $env:RUSTFLAGS = $previousRustFlags
    }
}
