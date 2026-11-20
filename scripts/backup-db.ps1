param(
  [string]$ContainerName = "core-api-postgres",
  [string]$DbUser = "postgres",
  [string]$DbName = "core_api",
  [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$BackupDir = Join-Path $RootDir "backups"

if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$RunningContainer = docker ps --filter "name=^/$ContainerName$" --filter "status=running" --format "{{.Names}}"
if (-not $RunningContainer) {
  Write-Error "Container PostgreSQL '$ContainerName' chua chay. Hay chay 'npm run start:docker' truoc khi sao luu."
  exit 1
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$OutputFile = Join-Path $BackupDir "${DbName}_${Timestamp}.sql"
$ErrorLogFile = Join-Path $BackupDir "${DbName}_${Timestamp}.err.log"

Write-Host "Dang sao luu co so du lieu '$DbName' tu container '$ContainerName'..."
$proc = Start-Process -FilePath "docker" `
  -ArgumentList @("exec", $ContainerName, "pg_dump", "-U", $DbUser, "-d", $DbName, "--clean", "--if-exists") `
  -RedirectStandardOutput $OutputFile `
  -RedirectStandardError $ErrorLogFile `
  -NoNewWindow `
  -Wait `
  -PassThru

if ($proc.ExitCode -ne 0) {
  $errText = if (Test-Path $ErrorLogFile) { Get-Content $ErrorLogFile -Raw } else { "Unknown error" }
  if (Test-Path $OutputFile) { Remove-Item $OutputFile -Force }
  if (Test-Path $ErrorLogFile) { Remove-Item $ErrorLogFile -Force }
  Write-Error "Loi khi chay pg_dump (Exit $($proc.ExitCode)): $errText"
  exit 1
}

if (Test-Path $ErrorLogFile) {
  Remove-Item $ErrorLogFile -Force
}

$FileInfo = Get-Item $OutputFile
if (-not $FileInfo -or $FileInfo.Length -eq 0) {
  if (Test-Path $OutputFile) { Remove-Item $OutputFile -Force }
  Write-Error "File sao luu bi rong. Vui long kiem tra lai co so du lieu."
  exit 1
}

$Cutoff = (Get-Date).AddDays(-$RetentionDays)
$ExpiredFiles = Get-ChildItem -Path $BackupDir -Filter "*.sql" | Where-Object { $_.LastWriteTime -lt $Cutoff }
foreach ($oldFile in $ExpiredFiles) {
  Remove-Item $oldFile.FullName -Force
}

$SizeKb = [math]::Round($FileInfo.Length / 1KB, 2)
Write-Host "Sao luu thanh cong: $($FileInfo.FullName) ($SizeKb KB)"
