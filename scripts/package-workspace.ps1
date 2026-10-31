[CmdletBinding()]
param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $repoRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $workspaceRoot 'packages' }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$outputRoot = (Resolve-Path -LiteralPath $OutputDirectory).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archivePath = Join-Path $outputRoot "xingzhi-local-$stamp.zip"
$entries = New-Object 'System.Collections.Generic.Dictionary[string,string]'

function Add-PackageFile([string]$File, [string]$Entry) {
    if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { return }
    $normalized = $Entry.Replace('\', '/')
    if ($normalized -match '(^|/)(\.git|node_modules|\.next|target|\.runtime|\.runtime-config|__pycache__|\.playwright-cli)(/|$)') { return }
    if ($normalized -match '(^|/)\.env($|\.)' -and $normalized -notmatch '(^|/)\.env\.example$') { return }
    if ($normalized -match '\.(key|pem|p12|pfx|jks|mv\.db|trace\.db|h2\.db|log|zip|tar\.gz)$') { return }
    $entries['xingzhi-local/' + $normalized] = (Resolve-Path -LiteralPath $File).Path
}

function Add-Repository([string]$Root, [string]$Prefix) {
    if (-not (Test-Path -LiteralPath (Join-Path $Root '.git'))) { return }
    $paths = & git -c core.quotepath=false -C $Root ls-files --cached
    if ($LASTEXITCODE -ne 0) { throw "Cannot list tracked files in $Root" }
    foreach ($relative in $paths) { Add-PackageFile (Join-Path $Root $relative) ($Prefix + '/' + $relative) }
}

$oldEncoding = [Console]::OutputEncoding
try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    Add-Repository $repoRoot 'amap-jsapi'
    Add-Repository (Join-Path $workspaceRoot 'xingzhi-ai-planner-qa') 'xingzhi-ai-planner-qa'
    foreach ($folder in @('deliverables', 'ecs-deploy', 'tools/documents')) {
        $root = Join-Path $workspaceRoot $folder
        if (-not (Test-Path -LiteralPath $root)) { continue }
        Get-ChildItem -LiteralPath $root -Recurse -File | ForEach-Object {
            $relative = $_.FullName.Substring($workspaceRoot.Length + 1)
            Add-PackageFile $_.FullName $relative
        }
    }
    Add-PackageFile (Join-Path $workspaceRoot 'README.md') 'README.md'
    Add-PackageFile (Join-Path $workspaceRoot 'start-backend.bat') 'start-backend.bat'
    if ($entries.Count -eq 0) { throw 'No files found. Commit or stage the project files before packaging.' }
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::Open($archivePath, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($entry in ($entries.Keys | Sort-Object)) {
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $entries[$entry], $entry, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
        $metadata = $zip.CreateEntry('xingzhi-local/PACKAGE-INFO.txt')
        $writer = New-Object System.IO.StreamWriter($metadata.Open(), (New-Object System.Text.UTF8Encoding($false)))
        try {
            $writer.WriteLine('Xingzhi local source package')
            $writer.WriteLine('Created: ' + (Get-Date -Format o))
            $writer.WriteLine('Application commit: ' + (& git -C $repoRoot rev-parse HEAD))
            $writer.WriteLine('Source entry: amap-jsapi/start-backend.bat')
            $writer.WriteLine('Requires JDK 21 and internet for the first Maven dependency download.')
            $writer.WriteLine('Excluded: actual .env files, credentials, databases, caches, installed dependencies and historical archives.')
        } finally { $writer.Dispose() }
    } finally { $zip.Dispose() }
    $hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($archivePath + '.sha256', ($hash + '  ' + [IO.Path]::GetFileName($archivePath) + "`n"), (New-Object System.Text.UTF8Encoding($false)))
    Write-Output "Archive: $archivePath"
    Write-Output "Files: $($entries.Count + 1)"
    Write-Output "SHA256: $hash"
} catch {
    if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
    throw
} finally { [Console]::OutputEncoding = $oldEncoding }
