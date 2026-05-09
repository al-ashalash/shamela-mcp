# Compile the Java helper and build helper/shamela-helper.jar.
# Bundles sqlite-jdbc into the output jar; Lucene + AlKhalil + shamela-misc
# come from the user's Shamela install at runtime.
#
# Requires: JDK 21+ on PATH (javac + jar), an existing Shamela 4 install on
# this machine (for Lucene jars at compile time).

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

function Add-JdkToPath {
    # If javac is already on PATH, nothing to do.
    if (Get-Command javac -ErrorAction SilentlyContinue) { return }
    $candidates = @(
        "C:\Program Files\Eclipse Adoptium",
        "C:\Program Files\Microsoft\jdk-21*",
        "C:\Program Files\Java"
    )
    foreach ($base in $candidates) {
        $hits = Get-ChildItem -Path $base -ErrorAction SilentlyContinue -Filter "*jdk*21*" |
            Where-Object { Test-Path (Join-Path $_.FullName "bin\javac.exe") }
        if ($hits) {
            $jdk = $hits[0].FullName
            $env:Path = (Join-Path $jdk "bin") + ";" + $env:Path
            Write-Host "Using JDK at $jdk"
            return
        }
    }
}

function Find-ShamelaInstall {
    if ($env:SHAMELA_INSTALL_ROOT -and (Test-Path $env:SHAMELA_INSTALL_ROOT)) {
        if ((Test-Path (Join-Path $env:SHAMELA_INSTALL_ROOT "database")) -and `
            (Test-Path (Join-Path $env:SHAMELA_INSTALL_ROOT "app"))) {
            return $env:SHAMELA_INSTALL_ROOT
        }
    }
    $candidates = @(
        "C:\shamela4",
        "C:\Program Files\shamela4",
        "C:\Program Files (x86)\shamela4",
        (Join-Path $env:LOCALAPPDATA "shamela4"),
        (Join-Path $env:USERPROFILE "shamela4"),
        (Join-Path $env:USERPROFILE "Desktop\shamela4"),
        "D:\shamela4", "E:\shamela4", "F:\shamela4"
    )
    foreach ($c in $candidates) {
        if ($c -and (Test-Path (Join-Path $c "app\lucene\2"))) { return $c }
    }
    throw "Could not locate Shamela install. Set SHAMELA_INSTALL_ROOT."
}

# Verify JDK
Add-JdkToPath
try {
    $javacVersion = & javac -version 2>&1
    Write-Host "javac: $javacVersion"
} catch {
    throw "javac not found on PATH. Install JDK 21+ (winget install EclipseAdoptium.Temurin.21.JDK) and reopen the shell."
}

$shamela = Find-ShamelaInstall
$luceneDir = Join-Path $shamela "app\lucene\2"
Write-Host "Shamela: $shamela"

# sqlite-jdbc cache
$sqliteVersion = "3.47.0.0"
$libsCache = Join-Path $repoRoot "libs-cache"
$sqliteJar = Join-Path $libsCache "sqlite-jdbc-$sqliteVersion.jar"
if (-not (Test-Path $sqliteJar)) {
    New-Item -ItemType Directory -Force -Path $libsCache | Out-Null
    $url = "https://repo1.maven.org/maven2/org/xerial/sqlite-jdbc/$sqliteVersion/sqlite-jdbc-$sqliteVersion.jar"
    Write-Host "Downloading sqlite-jdbc $sqliteVersion ..."
    Invoke-WebRequest -Uri $url -OutFile $sqliteJar -UseBasicParsing
}

# Build classpath: Shamela's Lucene jars + sqlite-jdbc.
$cpJars = @()
$cpJars += Get-ChildItem -Path $luceneDir -Filter "*.jar" | ForEach-Object { $_.FullName }
$cpJars += $sqliteJar
$classpath = $cpJars -join ";"

# Source files
$srcRoot = Join-Path $repoRoot "src\java\src\main\java"
$javaFiles = Get-ChildItem -Path $srcRoot -Recurse -Filter "*.java" | ForEach-Object { $_.FullName }
if ($javaFiles.Count -eq 0) { throw "No .java files found under $srcRoot" }

# Output dirs
$buildDir = Join-Path $repoRoot "src\java\build"
$classesDir = Join-Path $buildDir "classes"
$mergedDir = Join-Path $buildDir "merged"
$helperOut = Join-Path $repoRoot "helper"
Remove-Item -Recurse -Force $buildDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $classesDir, $mergedDir, $helperOut | Out-Null

Write-Host "Compiling $($javaFiles.Count) Java sources..."
& javac -encoding UTF-8 -source 21 -target 21 -d $classesDir -cp $classpath $javaFiles
if ($LASTEXITCODE -ne 0) { throw "javac failed (exit $LASTEXITCODE)" }

# Build a fat jar: extract sqlite-jdbc into mergedDir, then copy our classes on top.
Write-Host "Bundling sqlite-jdbc into helper jar..."
Push-Location $mergedDir
try {
    & jar -xf $sqliteJar
    if ($LASTEXITCODE -ne 0) { throw "jar -xf sqlite-jdbc failed" }
} finally { Pop-Location }

# Drop sqlite-jdbc's META-INF (signed-jar headers; harmless to remove for our merged jar).
Remove-Item -Recurse -Force (Join-Path $mergedDir "META-INF") -ErrorAction SilentlyContinue

# Copy our compiled classes on top.
Copy-Item -Recurse -Force (Join-Path $classesDir "*") $mergedDir

# Write a manifest naming Main as the entry point.
$manifestPath = Join-Path $buildDir "MANIFEST.MF"
@"
Manifest-Version: 1.0
Main-Class: ws.shamela.mcp.Main
Implementation-Title: shamela-mcp helper
Implementation-Version: 0.0.1

"@ | Out-File -FilePath $manifestPath -Encoding ascii

$outJar = Join-Path $helperOut "shamela-helper.jar"
Push-Location $mergedDir
try {
    & jar cfm $outJar $manifestPath .
    if ($LASTEXITCODE -ne 0) { throw "jar cfm failed" }
} finally { Pop-Location }

$size = (Get-Item $outJar).Length
Write-Host ("Built {0} ({1:N0} bytes, {2:N1} MB)" -f $outJar, $size, ($size / 1MB))
