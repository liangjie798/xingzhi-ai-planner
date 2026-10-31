# Run with Windows PowerShell 5.1. These checks do not install or download a JDK.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $repo 'scripts\backend-environment.ps1')
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('xingzhi-env-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$passed = 0
function Assert-Environment([bool]$Condition, [string]$Name) {
    if (-not $Condition) { throw "FAIL: $Name" }
    Write-Host "PASS: $Name"
    $script:passed++
}
try {
    $requirements = Get-BackendRequirements $repo
    Assert-Environment ($requirements.JavaMajor -eq 21 -and $requirements.MavenVersion -eq '3.10.0') 'Project requirements are read from source configuration'
    $fixture = Join-Path $testRoot 'fake-jdk'
    New-Item -ItemType Directory -Path (Join-Path $fixture 'bin') -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $fixture 'bin\java.exe'), '')
    [IO.File]::WriteAllText((Join-Path $fixture 'bin\javac.exe'), '')
    [IO.File]::WriteAllText((Join-Path $fixture 'release'), "JAVA_VERSION=`"25.0.1`"`nOS_ARCH=`"x86_64`"`n")
    Assert-Environment (-not (Test-BackendJdk $fixture $requirements)) 'A different Java major version is rejected'
    $wrongArch = if ($requirements.Architecture -eq 'x64') { 'aarch64' } else { 'x86_64' }
    [IO.File]::WriteAllText((Join-Path $fixture 'release'), "JAVA_VERSION=`"21.0.1`"`nOS_ARCH=`"$wrongArch`"`n")
    Assert-Environment (-not (Test-BackendJdk $fixture $requirements)) 'A JDK for a different CPU architecture is rejected'
    Assert-Environment (-not (Test-BackendJdk (Join-Path $testRoot 'missing') $requirements)) 'Missing JDK is rejected'
    $cache = Join-Path $testRoot 'cached.zip'
    [IO.File]::WriteAllText($cache, 'verified test cache')
    $hash = Get-BackendFileHash $cache 'SHA256'
    Receive-BackendArchive 'https://example.invalid/no-network' $cache $hash 'SHA256' 'Test cache'
    Assert-Environment ((Get-BackendFileHash $cache 'SHA256') -eq $hash) 'Verified cached archives are reused without a network request'
    $rejected = $false
    try { Receive-BackendArchive 'https://example.invalid/no-network' $cache 'bad-checksum' 'SHA256' 'Test' } catch { $rejected = $true }
    Assert-Environment $rejected 'Invalid download checksum metadata is rejected before downloading'
    $rejected = $false
    try { Receive-BackendArchive 'http://example.invalid/no-network' $cache $hash 'SHA256' 'Test' } catch { $rejected = $true }
    Assert-Environment $rejected 'Plain HTTP download sources are rejected'
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $badZip = Join-Path $testRoot 'bad.zip'
    $zip = [IO.Compression.ZipFile]::Open($badZip, [IO.Compression.ZipArchiveMode]::Create)
    try { $null = $zip.CreateEntry('../outside.txt') } finally { $zip.Dispose() }
    $rejected = $false
    try { $null = Expand-BackendEnvironment $badZip (Join-Path $testRoot 'tools') 'jdk' $requirements } catch { $rejected = $_.Exception.Message -like '*outside*' }
    Assert-Environment ($rejected -and -not (Test-Path -LiteralPath (Join-Path $testRoot 'outside.txt'))) 'Archive paths cannot escape the installation directory'
    Write-Host "Environment checks passed: $passed"
} finally {
    $resolved = [IO.Path]::GetFullPath($testRoot)
    $boundary = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if ($resolved.StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolved)) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
