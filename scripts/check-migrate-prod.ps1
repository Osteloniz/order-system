param(
  [string]$EnvFile = ".env.prod"
)

if (-not (Test-Path $EnvFile)) {
  Write-Error "Arquivo de ambiente '$EnvFile' nao encontrado. Crie um .env.prod com DATABASE_URL e DIRECT_URL de producao."
  exit 1
}

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*#') { return }
  if ($_ -match '^\s*$') { return }
  $parts = $_.Split('=', 2)
  if ($parts.Length -ne 2) { return }
  $name = $parts[0].Trim()
  $value = $parts[1].Trim().Trim('"')
  if ($name.Length -gt 0) {
    [System.Environment]::SetEnvironmentVariable($name, $value)
  }
}

$runtimeDatabaseUrl = [System.Environment]::GetEnvironmentVariable("DATABASE_URL")
$directDatabaseUrl = [System.Environment]::GetEnvironmentVariable("DIRECT_URL")
if ($directDatabaseUrl) {
  [System.Environment]::SetEnvironmentVariable("DATABASE_URL", $directDatabaseUrl)
}

Write-Host "Running prisma migrate status using '$EnvFile'..."
& npx prisma migrate status
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($runtimeDatabaseUrl) {
  [System.Environment]::SetEnvironmentVariable("DATABASE_URL", $runtimeDatabaseUrl)
}

Write-Host "Done."
