# Preserve the previous entry point while sharing the portable launcher.
& (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\start-backend.ps1') @args
exit $LASTEXITCODE

