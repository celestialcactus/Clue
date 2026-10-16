$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$version = (Get-Content (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$outputDir = Join-Path $projectRoot 'dist'
$installer = Join-Path $outputDir "Clue Setup $version.exe"
if (!(Test-Path -LiteralPath $installer)) { throw 'Build the installer with npm run build first.' }
$instructions = Join-Path $outputDir 'START-HERE.txt'
@"
CLUE $version - Windows x64 test release

1. Extract this ZIP to a folder on your computer.
2. Double-click Clue Setup $version.exe and follow the installation prompts.
3. Open Clue from the desktop shortcut. Wait for the local model to say Ready.
4. Use the + in the message box to add a document, then ask a question.

The model and document index run on your computer. No model account or separate
download is needed. Internet access is needed for web searches; search queries
and requests to public websites leave your computer. Local answers work offline.

This is an unsigned test installer, so Windows may display an unknown-publisher
warning. Only run the installer received directly from your trusted sender.

The bundled small model can make mistakes. Check cited passages and public sources,
especially for legal or compliance decisions. CPU answers may take a while.

Your chats and uploaded files are stored locally. Uninstalling retains that data.
This package does not contain the developer's chats or documents.
"@ | Set-Content -LiteralPath $instructions -Encoding utf8
$archivePath = Join-Path $outputDir "Clue-$version-Windows-x64.zip"
Add-Type -AssemblyName System.IO.Compression
$zip = [System.IO.Compression.ZipFile]::Open($archivePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in @($installer, $instructions)) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file, (Split-Path $file -Leaf), [System.IO.Compression.CompressionLevel]::NoCompression) | Out-Null
    }
} finally { $zip.Dispose() }
$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
"$hash  $(Split-Path $archivePath -Leaf)" | Set-Content -LiteralPath "$archivePath.sha256" -Encoding ascii
Get-Item -LiteralPath $archivePath | Select-Object FullName, Length
