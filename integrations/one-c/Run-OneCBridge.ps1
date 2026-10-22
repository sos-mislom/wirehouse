param(
    [Parameter(Mandatory = $true)][string]$EnvFile,
    [string]$PythonPath = "python"
)
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$privateFile = (Resolve-Path -LiteralPath $EnvFile).Path
Push-Location -LiteralPath $repoRoot
try {
    & $PythonPath (Join-Path $PSScriptRoot "wirehouse_bridge.py") --env-file $privateFile
    $resultCode = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $resultCode
