param(
  [string]$Service = "db",
  [string]$DbUser = "saber11",
  [string]$DbName = "saber11db",
  [string]$OutputDir = "storage/backups/postgres"
)

$ErrorActionPreference = "Stop"

$resolvedOutputDir = Join-Path (Get-Location) $OutputDir
New-Item -ItemType Directory -Path $resolvedOutputDir -Force | Out-Null

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd_HHmmss'Z'")
$fileName = "backup_${DbName}_${timestamp}.sql.gz"
$backupPath = Join-Path $resolvedOutputDir $fileName

$tmpSql = [System.IO.Path]::GetTempFileName()
try {
  $dumpCommand = "docker compose exec -T $Service pg_dump -U $DbUser -d $DbName --format=plain --no-owner --no-privileges > `"$tmpSql`""
  cmd /c $dumpCommand
  if ($LASTEXITCODE -ne 0) {
    throw "pg_dump fallo con codigo $LASTEXITCODE"
  }

  $bytes = [System.IO.File]::ReadAllBytes($tmpSql)
  if ($bytes.Length -eq 0) {
    throw "Backup vacio generado por pg_dump."
  }

  $gzipStream = [System.IO.File]::Create($backupPath)
  try {
    $gzip = New-Object System.IO.Compression.GZipStream($gzipStream, [System.IO.Compression.CompressionLevel]::Optimal)
    try {
      $gzip.Write($bytes, 0, $bytes.Length)
    } finally {
      $gzip.Dispose()
    }
  } finally {
    $gzipStream.Dispose()
  }

  $sha = (Get-FileHash -Algorithm SHA256 -Path $backupPath).Hash.ToLowerInvariant()
  $manifestPath = $backupPath -replace "\.sql\.gz$", ".manifest.json"
  $manifest = [ordered]@{
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    service = $Service
    dbUser = $DbUser
    dbName = $DbName
    backupFile = $backupPath
    sizeBytes = (Get-Item $backupPath).Length
    sha256 = $sha
  } | ConvertTo-Json -Depth 4
  Set-Content -Path $manifestPath -Value $manifest -Encoding utf8

  Write-Output ($manifest | ConvertFrom-Json | ConvertTo-Json -Depth 4)
} finally {
  if (Test-Path $tmpSql) {
    Remove-Item -LiteralPath $tmpSql -Force
  }
}
