[CmdletBinding()]
param(
    [ValidateRange(1, 65535)][int]$Port,
    [switch]$CheckOnly,
    [switch]$UseJar,
    [switch]$InstallOnly,
    [switch]$LocalEnvironment
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $repoRoot 'backend'

. (Join-Path $PSScriptRoot 'backend-environment.ps1')

try {
    if (-not (Test-Path -LiteralPath (Join-Path $backendRoot 'mvnw.cmd'))) { throw 'backend\mvnw.cmd is missing. Extract the complete project folder first.' }
    $envFile = Join-Path $backendRoot '.env'
    $loaded = 0
    if (Test-Path -LiteralPath $envFile) {
        foreach ($line in (Get-Content -LiteralPath $envFile -Encoding UTF8)) {
            $trimmed = $line.Trim()
            if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
            if ($trimmed -notmatch '^(?:export\s+)?(?<key>[A-Za-z_][A-Za-z0-9_]*)\s*=(?<value>.*)$') { throw 'Invalid backend/.env line. Use KEY=value; shell commands are not supported.' }
            $key, $value = $Matches.key, $Matches.value.Trim()
            if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) { $value = $value.Substring(1, $value.Length - 2) }
            if ($null -eq [Environment]::GetEnvironmentVariable($key, 'Process')) {
                [Environment]::SetEnvironmentVariable($key, $value, 'Process')
                $loaded++
            }
        }
    }
    if ($PSBoundParameters.ContainsKey('Port')) { $env:SERVER_PORT = [string]$Port }
    if (-not $env:SERVER_PORT) { $env:SERVER_PORT = '8080' }
    $portNumber = 0
    if (-not [int]::TryParse($env:SERVER_PORT, [ref]$portNumber) -or $portNumber -lt 1 -or $portNumber -gt 65535) { throw 'SERVER_PORT must be an integer between 1 and 65535.' }
    if (-not $InstallOnly) {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $portNumber)
        try { $listener.Start() } catch { throw "Port $portNumber is already in use. Close the existing service or run start-backend.bat -Port 18080." } finally { $listener.Stop() }
    }
    $environment = Initialize-BackendEnvironment -Repository $repoRoot -AllowInstall (-not $CheckOnly) -NeedsMaven (-not $UseJar) -LocalEnvironment ([bool]$LocalEnvironment)
    $jdk = $environment.JdkHome
    Write-Host '[3/4] Runtime ready.'
    Write-Host 'Xingzhi backend - local launcher'
    Write-Host "JDK: $jdk"
    Write-Host "Backend directory: $backendRoot"
    Write-Host "Loaded local environment entries: $loaded (existing process variables take precedence)"
    Write-Host "Health: http://localhost:$portNumber/actuator/health"
    if ($CheckOnly) { Write-Host 'Prerequisite check passed. No service was started.'; exit 0 }
    if ($InstallOnly) { Write-Host 'Environment preparation completed. No service was started.'; exit 0 }
    Write-Host '[4/4] Starting backend (first-time dependency downloads are shown by Maven)...'
    Write-Host 'Press Ctrl+C to stop. The default H2 development database is in memory; restarting clears local records.'
    Push-Location -LiteralPath $backendRoot
    try {
        if ($UseJar) {
            $jar = Join-Path $backendRoot 'target\backend-0.0.1-SNAPSHOT.jar'
            if (-not (Test-Path -LiteralPath $jar)) { throw 'No packaged JAR found. Run backend\mvnw.cmd package first, or omit -UseJar.' }
            & (Join-Path $jdk 'bin\java.exe') -jar $jar
        } else {
            & $environment.MavenCommand --batch-mode spring-boot:run
        }
        $result = $LASTEXITCODE
    } finally { Pop-Location }
    exit $result
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
