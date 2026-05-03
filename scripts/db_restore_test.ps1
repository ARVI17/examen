param(
  [string]$Service = "db",
  [string]$DbUser = "saber11",
  [string]$BackupFile = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($BackupFile)) {
  $latest = Get-ChildItem -Path "storage/backups/postgres" -Filter "*.sql.gz" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) {
    throw "No se encontro backup para restore test."
  }
  $BackupFile = $latest.FullName
}

$resolvedBackup = Resolve-Path $BackupFile
$bytes = [System.IO.File]::ReadAllBytes($resolvedBackup)
$memoryStream = New-Object System.IO.MemoryStream(,$bytes)
$gzip = New-Object System.IO.Compression.GZipStream($memoryStream, [System.IO.Compression.CompressionMode]::Decompress)
$reader = New-Object System.IO.StreamReader($gzip)
$sql = $reader.ReadToEnd()
$reader.Dispose()
$gzip.Dispose()
$memoryStream.Dispose()

$tempDb = "restore_test_$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$tmpSql = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmpSql, $sql, (New-Object System.Text.UTF8Encoding($false)))

try {
  docker compose exec -T $Service createdb -U $DbUser $tempDb | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "createdb fallo con codigo $LASTEXITCODE"
  }

  $restoreCommand = "docker compose exec -T $Service psql -U $DbUser -d $tempDb < `"$tmpSql`""
  cmd /c $restoreCommand | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "psql restore fallo con codigo $LASTEXITCODE"
  }

  $count = docker compose exec -T $Service psql -U $DbUser -d $tempDb -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"
  if ($LASTEXITCODE -ne 0) {
    throw "consulta post-restore fallo con codigo $LASTEXITCODE"
  }

  $countInt = [int]($count.Trim())
  if ($countInt -le 0) {
    throw "Restore test sin tablas en schema public."
  }

  [ordered]@{
    success = $true
    backupFile = $resolvedBackup.Path
    testDb = $tempDb
    restoredTables = $countInt
  } | ConvertTo-Json -Depth 4 | Write-Output
} finally {
  docker compose exec -T $Service dropdb -U $DbUser --if-exists $tempDb | Out-Null
  if (Test-Path $tmpSql) {
    Remove-Item -LiteralPath $tmpSql -Force
  }
}
