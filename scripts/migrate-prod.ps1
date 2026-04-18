param(
  [string]$EnvFile = ".env"
)

# Carrega variaveis do arquivo .env local para o processo atual.
if (Test-Path $EnvFile) {
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
}

Write-Host "Running prisma migrate deploy..."
$runtimeDatabaseUrl = [System.Environment]::GetEnvironmentVariable("DATABASE_URL")
$directDatabaseUrl = [System.Environment]::GetEnvironmentVariable("DIRECT_URL")
if ($directDatabaseUrl) {
  [System.Environment]::SetEnvironmentVariable("DATABASE_URL", $directDatabaseUrl)
}

& npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($runtimeDatabaseUrl) {
  [System.Environment]::SetEnvironmentVariable("DATABASE_URL", $runtimeDatabaseUrl)
}

Write-Host "Generating Prisma Client..."
& npx prisma generate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done."

