Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = $PSScriptRoot
$manifest = Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json
$version = $manifest.version
$outDir = "D:\文档\VSCODE\上传文件\firefox"
$outFile = "commute-helper-firefox-v$version.zip"
$out = Join-Path $outDir $outFile

if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
Remove-Item $out -Force -ErrorAction SilentlyContinue

$zip = [System.IO.Compression.ZipFile]::Open($out, [System.IO.Compression.ZipArchiveMode]::Create)
$entries = @(
    "manifest.json",
    "background/background.js",
    "popup/popup.html",
    "popup/popup.css",
    "popup/popup.js",
    "lib/amap.js",
    "lib/storage.js",
    "lib/calendar.js",
    "lib/leaflet.css",
    "lib/leaflet.js",
    "icons/icon-16.svg", "icons/icon-32.svg", "icons/icon-48.svg", "icons/icon-96.svg",
    "icons/rain-16.svg", "icons/rain-32.svg", "icons/rain-48.svg", "icons/rain-96.svg",
    "icons/snow-16.svg", "icons/snow-32.svg", "icons/snow-48.svg", "icons/snow-96.svg",
    "icons/late-16.svg", "icons/late-32.svg", "icons/late-48.svg", "icons/late-96.svg",
    "LICENSE",
    "README.md"
)

foreach ($e in $entries) {
    $src = Join-Path $root $e
    if (Test-Path $src) {
        Write-Host "OK  $e"
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $src, $e)
    } else {
        Write-Host "MISS $e"
    }
}

$zip.Dispose()
Write-Host "DONE -> $out"
