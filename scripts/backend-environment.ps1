# Shared by the Windows launcher and its environment regression checks.
$ErrorActionPreference = 'Stop'

function Get-BackendRequirements([string]$Repository) {
    [xml]$pom = Get-Content -LiteralPath (Join-Path $Repository 'backend\pom.xml') -Raw
    $major = [int]$pom.project.properties.'java.version'
    if ($major -lt 21) { throw 'Invalid project Java requirement.' }
    $properties = Get-Content -LiteralPath (Join-Path $Repository 'backend\.mvn\wrapper\maven-wrapper.properties') -Raw | ConvertFrom-StringData
    $url = $properties.distributionUrl
    if ($url -notmatch '^https://repo\.maven\.apache\.org/maven2/org/apache/maven/apache-maven/(?<version>\d+\.\d+\.\d+)/apache-maven-\k<version>-bin\.zip$') { throw 'Unsupported Maven distribution URL in wrapper properties.' }
    $architecture = $env:PROCESSOR_ARCHITEW6432
    if (-not $architecture) { $architecture = $env:PROCESSOR_ARCHITECTURE }
    switch ($architecture.ToUpperInvariant()) {
        'AMD64' { $arch = 'x64'; $releaseArch = 'x86_64|amd64' }
        'ARM64' { $arch = 'aarch64'; $releaseArch = 'aarch64|arm64' }
        default { throw "Unsupported Windows architecture: $architecture. Use 64-bit Windows." }
    }
    return @{ JavaMajor = $major; Architecture = $arch; ReleaseArchitecture = $releaseArch; MavenVersion = $Matches.version; MavenUrl = $url }
}

function Test-BackendJdk([string]$Directory, $Requirements) {
    if (-not $Directory) { return $false }
    $release = Join-Path $Directory 'release'
    $java = Join-Path $Directory 'bin\java.exe'
    if (-not (Test-Path -LiteralPath $release) -or -not (Test-Path -LiteralPath $java) -or -not (Test-Path -LiteralPath (Join-Path $Directory 'bin\javac.exe'))) { return $false }
    $text = Get-Content -LiteralPath $release -Raw
    if ($text -notmatch ('(?m)^JAVA_VERSION="' + $Requirements.JavaMajor + '(?:[.+"-])')) { return $false }
    if ($text -notmatch ('(?m)^OS_ARCH="(?:' + $Requirements.ReleaseArchitecture + ')"')) { return $false }
    try {
        $output = & $java --version 2>&1
        return ($LASTEXITCODE -eq 0 -and (($output -join ' ') -match ('(?:openjdk|java)\s+' + $Requirements.JavaMajor + '(?:[.\s])')))
    } catch { return $false }
}

function Find-BackendJdk([string]$Repository, $Requirements, [bool]$LocalEnvironment) {
    $candidates = New-Object 'System.Collections.Generic.List[string]'
    $roots = @((Join-Path $Repository '.tools\jdk'))
    if (-not $LocalEnvironment) {
        if ($env:JAVA_HOME) { $candidates.Add($env:JAVA_HOME.Trim('"')) }
        $javaCommand = Get-Command java.exe -ErrorAction SilentlyContinue
        if ($javaCommand) { $candidates.Add((Split-Path -Parent (Split-Path -Parent $javaCommand.Source))) }
        $roots += @(
            (Join-Path $env:ProgramFiles 'Java'),
            (Join-Path $env:ProgramFiles 'Eclipse Adoptium'),
            (Join-Path $env:ProgramFiles 'Microsoft'),
            (Join-Path $env:LOCALAPPDATA 'Programs\Eclipse Adoptium'),
            (Join-Path ([IO.Path]::GetPathRoot($Repository)) 'JavaVersions')
        )
    }
    foreach ($root in $roots) {
        if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }
        $candidates.Add($root)
        Get-ChildItem -LiteralPath $root -Directory | Sort-Object Name -Descending | ForEach-Object { $candidates.Add($_.FullName) }
    }
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (Test-BackendJdk $candidate $Requirements) { return (Resolve-Path -LiteralPath $candidate).Path }
    }
    return $null
}

function Find-BackendMaven([string]$Repository, $Requirements, [bool]$LocalEnvironment) {
    $version = $Requirements.MavenVersion
    $candidates = @((Join-Path $Repository ".tools\maven\apache-maven-$version"))
    if (-not $LocalEnvironment) {
        $candidates += @($env:MAVEN_HOME, $env:M2_HOME)
        $mvn = Get-Command mvn.cmd -ErrorAction SilentlyContinue
        if ($mvn) { $candidates += Split-Path -Parent (Split-Path -Parent $mvn.Source) }
        $mavenUserHome = if ($env:MAVEN_USER_HOME) { $env:MAVEN_USER_HOME } else { Join-Path $env:USERPROFILE '.m2' }
        $wrapperRoot = Join-Path $mavenUserHome "wrapper\dists\apache-maven-$version"
        if (Test-Path -LiteralPath $wrapperRoot) { $candidates += (Get-ChildItem -LiteralPath $wrapperRoot -Directory).FullName }
    }
    foreach ($candidate in ($candidates | Where-Object { $_ } | Select-Object -Unique)) {
        $command = Join-Path $candidate 'bin\mvn.cmd'
        if (-not (Test-Path -LiteralPath $command) -or -not (Test-Path -LiteralPath (Join-Path $candidate "lib\maven-core-$version.jar"))) { continue }
        try {
            $output = & $command --version --batch-mode 2>&1
            if ($LASTEXITCODE -eq 0 -and (($output -join ' ') -match ('Apache Maven ' + [regex]::Escape($version) + '\s'))) { return (Resolve-Path -LiteralPath $command).Path }
        } catch { continue }
    }
    return $null
}

function Get-BackendRemoteData([string]$Uri, [switch]$Json) {
    if (-not $Uri.StartsWith('https://')) { throw 'Environment metadata must use HTTPS.' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            if ($Json) { return Invoke-RestMethod -Uri $Uri -TimeoutSec 45 -UserAgent 'Xingzhi-Local-Launcher/1.0' }
            return (Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 45 -UserAgent 'Xingzhi-Local-Launcher/1.0').Content
        } catch {
            if ($attempt -eq 3) { throw "Cannot reach environment download metadata. Check your network and retry. $($_.Exception.Message)" }
            Write-Host "Metadata request failed; retry $attempt/3..."
        }
    }
}

function Get-BackendFileHash([string]$File, [string]$Algorithm) {
    $hasher = [Security.Cryptography.HashAlgorithm]::Create($Algorithm)
    $stream = [IO.File]::OpenRead($File)
    try { return ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $hasher.Dispose() }
}

function Receive-BackendArchive([string]$Uri, [string]$Destination, [string]$Checksum, [ValidateSet('SHA256','SHA512')][string]$Algorithm, [string]$Label) {
    if (-not $Uri.StartsWith('https://')) { throw 'Environment downloads must use HTTPS.' }
    $length = if ($Algorithm -eq 'SHA256') { 64 } else { 128 }
    if ($Checksum -notmatch ('^[a-fA-F0-9]{' + $length + '}$')) { throw 'Missing or invalid environment checksum.' }
    if (Test-Path -LiteralPath $Destination) {
        if ((Get-BackendFileHash $Destination $Algorithm) -eq $Checksum) { Write-Host "$Label archive already verified; reusing download."; return }
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $partial = $Destination + ".$PID.part"
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        $response = $null; $inputStream = $null; $outputStream = $null
        try {
            $request = [Net.HttpWebRequest]::Create($Uri)
            $request.UserAgent = 'Xingzhi-Local-Launcher/1.0'
            $request.Timeout = 45000
            $request.ReadWriteTimeout = 60000
            $response = $request.GetResponse()
            $total = $response.ContentLength
            $inputStream = $response.GetResponseStream()
            $outputStream = [IO.File]::Open($partial, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
            $buffer = New-Object byte[] 131072
            $downloaded = 0L; $clock = [Diagnostics.Stopwatch]::StartNew(); $lastUpdate = -1000L
            while (($count = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $outputStream.Write($buffer, 0, $count); $downloaded += $count
                if ($clock.ElapsedMilliseconds - $lastUpdate -ge 500) {
                    $lastUpdate = $clock.ElapsedMilliseconds
                    $mb = [math]::Round($downloaded / 1MB, 1)
                    if ($total -gt 0) {
                        $percent = [math]::Min(99, [int]($downloaded * 100 / $total))
                        $done = [int][math]::Floor($percent / 4)
                        $bar = ('#' * $done) + ('-' * (25 - $done))
                        $status = "[$bar] $percent%  $mb / $([math]::Round($total / 1MB,1)) MB"
                        Write-Progress -Id 21 -Activity "Downloading $Label" -Status $status -PercentComplete $percent
                    } else { $status = "[downloading] $mb MB"; Write-Progress -Id 21 -Activity "Downloading $Label" -Status $status }
                    Write-Host ("`r$Label $status          ") -NoNewline
                }
            }
            $outputStream.Dispose(); $outputStream = $null
            if ($total -gt 0 -and $downloaded -ne $total) { throw 'Download was truncated.' }
            Write-Host "`r$Label [#########################] 100%  Verifying checksum...          "
            if ((Get-BackendFileHash $partial $Algorithm) -ne $Checksum) { throw 'Downloaded archive checksum does not match the official checksum.' }
            Move-Item -LiteralPath $partial -Destination $Destination -Force
            return
        } catch {
            if ($attempt -eq 3) { throw "$Label download failed. No environment was installed. Retry the BAT after checking the network. $($_.Exception.Message)" }
            Write-Host "`n$Label download interrupted: $($_.Exception.Message)"
            Write-Host "Restarting attempt $($attempt + 1)/3..."
        } finally {
            if ($outputStream) { $outputStream.Dispose() }
            if ($inputStream) { $inputStream.Dispose() }
            if ($response) { $response.Dispose() }
            Write-Progress -Id 21 -Activity "Downloading $Label" -Completed
            if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force }
        }
    }
}

function Expand-BackendEnvironment([string]$Archive, [string]$ToolsRoot, [string]$Kind, $Requirements) {
    $staging = Join-Path $ToolsRoot ('staging\' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    Write-Host "Installing $Kind into the project .tools folder..."
    try {
        Add-Type -AssemblyName System.IO.Compression
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
        try {
            $boundary = [IO.Path]::GetFullPath($staging) + [IO.Path]::DirectorySeparatorChar
            foreach ($entry in $zip.Entries) {
                $target = [IO.Path]::GetFullPath((Join-Path $staging $entry.FullName))
                if (-not $target.StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive contains a path outside its installation directory.' }
            }
        } finally { $zip.Dispose() }
        [IO.Compression.ZipFile]::ExtractToDirectory($Archive, $staging)
        $roots = @(Get-ChildItem -LiteralPath $staging -Directory)
        if ($roots.Count -ne 1) { throw 'Unexpected environment archive layout.' }
        $candidate = $roots[0].FullName
        if ($Kind -eq 'jdk') {
            if (-not (Test-BackendJdk $candidate $Requirements)) { throw 'Downloaded JDK failed version, architecture or executable validation.' }
        } elseif (-not (Test-Path -LiteralPath (Join-Path $candidate "lib\maven-core-$($Requirements.MavenVersion).jar"))) { throw 'Downloaded Maven version does not match this project.' }
        $installRoot = Join-Path $ToolsRoot $Kind
        New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
        $destination = Join-Path $installRoot $roots[0].Name
        if (Test-Path -LiteralPath $destination) {
            # Preserve an incomplete old installation for diagnosis instead of deleting it.
            Move-Item -LiteralPath $destination -Destination ($destination + '.invalid-' + [guid]::NewGuid().ToString('N'))
        }
        Move-Item -LiteralPath $candidate -Destination $destination
        return $destination
    } finally {
        $resolvedStage = [IO.Path]::GetFullPath($staging)
        $boundary = [IO.Path]::GetFullPath((Join-Path $ToolsRoot 'staging')) + [IO.Path]::DirectorySeparatorChar
        if ($resolvedStage.StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedStage)) { Remove-Item -LiteralPath $resolvedStage -Recurse -Force }
    }
}

function Initialize-BackendEnvironment([string]$Repository, [bool]$AllowInstall = $true, [bool]$NeedsMaven = $true, [bool]$LocalEnvironment = $false) {
    $requirements = Get-BackendRequirements $Repository
    Write-Host "[1/4] Checking JDK $($requirements.JavaMajor) ($($requirements.Architecture))..."
    $jdk = Find-BackendJdk $Repository $requirements $LocalEnvironment
    if (-not $jdk -and -not $AllowInstall) { throw "JDK $($requirements.JavaMajor) is missing or incompatible. Run the BAT without -CheckOnly to install it automatically." }
    $tools = Join-Path $Repository '.tools'
    $lock = $null
    try {
        if ($AllowInstall) {
            New-Item -ItemType Directory -Path $tools -Force | Out-Null
            $timer = [Diagnostics.Stopwatch]::StartNew()
            while (-not $lock) {
                try { $lock = [IO.File]::Open((Join-Path $tools 'environment.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
                catch [IO.IOException] {
                    if ($timer.Elapsed.TotalMinutes -gt 10) { throw 'Timed out waiting for another environment installation.' }
                    Write-Progress -Id 22 -Activity 'Waiting for another launcher to finish environment preparation'
                    Start-Sleep -Milliseconds 500
                }
            }
            Write-Progress -Id 22 -Activity 'Environment preparation' -Completed
            # Another launcher might have finished while this process waited.
            if (-not $jdk) { $jdk = Find-BackendJdk $Repository $requirements $LocalEnvironment }
        }
        if (-not $jdk) {
            Write-Host 'No matching JDK found. Downloading a private project environment.'
            $uri = "https://api.adoptium.net/v3/assets/latest/$($requirements.JavaMajor)/hotspot?architecture=$($requirements.Architecture)&image_type=jdk&os=windows&vendor=eclipse"
            $assets = @(Get-BackendRemoteData $uri -Json)
            if ($assets.Count -eq 0 -or -not $assets[0].binary.package.link) { throw 'No official JDK archive is available for this Windows architecture.' }
            $package = $assets[0].binary.package
            $archive = Join-Path $tools ('downloads\jdk-' + $requirements.JavaMajor + '-' + $requirements.Architecture + '.zip')
            Receive-BackendArchive $package.link $archive $package.checksum 'SHA256' 'JDK'
            $jdk = Expand-BackendEnvironment $archive $tools 'jdk' $requirements
        } else { Write-Host "Matching JDK found: $jdk (download skipped)" }
        $env:JAVA_HOME = $jdk
        $env:Path = (Join-Path $jdk 'bin') + ';' + $env:Path
        $maven = $null
        if ($NeedsMaven) {
            Write-Host "[2/4] Checking Maven $($requirements.MavenVersion)..."
            $maven = Find-BackendMaven $Repository $requirements $LocalEnvironment
            if (-not $maven -and -not $AllowInstall) { throw 'Matching Maven is missing. Run without -CheckOnly to download it automatically.' }
            if (-not $maven) {
                $checksumText = [string](Get-BackendRemoteData ($requirements.MavenUrl + '.sha512'))
                $checksum = ($checksumText.Trim() -split '\s+')[0]
                $archive = Join-Path $tools "downloads\maven-$($requirements.MavenVersion).zip"
                Receive-BackendArchive $requirements.MavenUrl $archive $checksum 'SHA512' 'Maven'
                $null = Expand-BackendEnvironment $archive $tools 'maven' $requirements
                $maven = Find-BackendMaven $Repository $requirements $true
                if (-not $maven) { throw 'Installed Maven could not run. Retry environment preparation.' }
            } else { Write-Host "Matching Maven found: $maven (download skipped)" }
        } else { Write-Host '[2/4] Using a packaged JAR; Maven is not required.' }
        return @{ JdkHome = $jdk; MavenCommand = $maven; JavaMajor = $requirements.JavaMajor; MavenVersion = $requirements.MavenVersion }
    } finally { if ($lock) { $lock.Dispose() } }
}
