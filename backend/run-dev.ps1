$ErrorActionPreference = 'Stop'
$bundledJava = 'G:\JavaVersions\jdk21.0.12'
if (Test-Path (Join-Path $bundledJava 'bin\java.exe')) {
    $env:JAVA_HOME = $bundledJava
    $env:Path = (Join-Path $bundledJava 'bin') + ';' + $env:Path
}

if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    throw 'Java 21 is required. Set JAVA_HOME to a JDK 21 installation.'
}

& (Join-Path $PSScriptRoot 'mvnw.cmd') spring-boot:run
exit $LASTEXITCODE

