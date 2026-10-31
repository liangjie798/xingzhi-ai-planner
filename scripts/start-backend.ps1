[CmdletBinding()]
param(
    [ValidateRange(1, 65535)][int]$Port,
    [switch]$CheckOnly,
    [switch]$UseJar
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $repoRoot 'backend'

function Find-Jdk {
    $candidates = New-Object 'System.Collections.Generic.List[string]'
    if ($env:JAVA_HOME) { $candidates.Add($env:JAVA_HOME.Trim('"')) }
    $javaCommand = Get-Command java.exe -ErrorAction SilentlyContinue
    if ($javaCommand) { $candidates.Add((Split-Path -Parent (Split-Path -Parent $javaCommand.Source))) }
    $roots = @(
        (Join-Path $repoRoot '.tools\jdk'),
        (Join-Path $env:ProgramFiles 'Java'),
        (Join-Path $env:ProgramFiles 'Eclipse Adoptium'),
        (Join-Path $env:ProgramFiles 'Microsoft'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Eclipse Adoptium'),
        (Join-Path ([System.IO.Path]::GetPathRoot($repoRoot)) 'JavaVersions')
    )
    foreach ($root in $roots) {
        if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }
        $candidates.Add($root)
        Get-ChildItem -LiteralPath $root -Directory | Sort-Object Name -Descending | ForEach-Object { $candidates.Add($_.FullName) }
    }
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        $java = Join-Path $candidate 'bin\java.exe'
        if (-not (Test-Path -LiteralPath $java) -or -not (Test-Path -LiteralPath (Join-Path $candidate 'bin\javac.exe'))) { continue }
        # Read the JDK release metadata instead of running an incompatible Java.
        $release = Join-Path $candidate 'release'
        if (-not (Test-Path -LiteralPath $release)) { continue }
        $versionLine = Get-Content -LiteralPath $release | Where-Object { $_ -match '^JAVA_VERSION=' } | Select-Object -First 1
        if ($versionLine -match '^JAVA_VERSION="(?<major>\d+)') {
            if ([int]$Matches.major -ge 21) { return (Resolve-Path -LiteralPath $candidate).Path }
        }
    }
    throw 'JDK 21 or newer was not found. Install JDK 21 and set JAVA_HOME to its installation directory.'
}

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
    $jdk = Find-Jdk
    $env:JAVA_HOME = $jdk
    $env:Path = (Join-Path $jdk 'bin') + ';' + $env:Path
    if ($PSBoundParameters.ContainsKey('Port')) { $env:SERVER_PORT = [string]$Port }
    if (-not $env:SERVER_PORT) { $env:SERVER_PORT = '8080' }
    $portNumber = 0
    if (-not [int]::TryParse($env:SERVER_PORT, [ref]$portNumber) -or $portNumber -lt 1 -or $portNumber -gt 65535) { throw 'SERVER_PORT must be an integer between 1 and 65535.' }
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $portNumber)
    try { $listener.Start() } catch { throw "Port $portNumber is already in use. Close the existing service or run start-backend.bat -Port 18080." } finally { $listener.Stop() }
    Write-Host 'Xingzhi backend - local launcher'
    Write-Host "JDK: $jdk"
    Write-Host "Backend directory: $backendRoot"
    Write-Host "Loaded local environment entries: $loaded (existing process variables take precedence)"
    Write-Host "Health: http://localhost:$portNumber/actuator/health"
    if ($CheckOnly) { Write-Host 'Prerequisite check passed. No service was started.'; exit 0 }
    Write-Host 'Press Ctrl+C to stop. The default H2 development database is in memory; restarting clears local records.'
    Push-Location -LiteralPath $backendRoot
    try {
        if ($UseJar) {
            $jar = Join-Path $backendRoot 'target\backend-0.0.1-SNAPSHOT.jar'
            if (-not (Test-Path -LiteralPath $jar)) { throw 'No packaged JAR found. Run backend\mvnw.cmd package first, or omit -UseJar.' }
            & (Join-Path $jdk 'bin\java.exe') -jar $jar
        } else {
            & (Join-Path $backendRoot 'mvnw.cmd') --batch-mode spring-boot:run
        }
        $result = $LASTEXITCODE
    } finally { Pop-Location }
    exit $result
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
