# Oakcloud Production Setup Script
# Run this on your PRODUCTION machine after copying files

$ErrorActionPreference = "Stop"

Write-Host "=== Oakcloud Production Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "[Prerequisites Check]" -ForegroundColor Yellow

# Check Docker
try {
    docker --version | Out-Null
    Write-Host "  [OK] Docker installed" -ForegroundColor Green
} catch {
    Write-Host "  [X] Docker not found! Install Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Check Git
try {
    git --version | Out-Null
    Write-Host "  [OK] Git installed" -ForegroundColor Green
} catch {
    Write-Host "  [X] Git not found! Install Git first." -ForegroundColor Red
    exit 1
}

Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path ".\migration-backup")) {
    Write-Host "Error: migration-backup folder not found!" -ForegroundColor Red
    Write-Host "Make sure you copied the migration-backup folder to this directory." -ForegroundColor Yellow
    exit 1
}

# Check for .env file
if (-not (Test-Path ".\.env")) {
    Write-Host "Error: .env file not found!" -ForegroundColor Red
    Write-Host "Copy your .env file from the dev machine and update for production." -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/5] Starting Docker services (first run will pull images)..." -ForegroundColor Yellow
docker compose up -d
Write-Host "      Waiting for services to be healthy..." -ForegroundColor Gray

# Wait for postgres to be ready
$attempts = 0
$maxAttempts = 30
while ($attempts -lt $maxAttempts) {
    $health = docker inspect --format='{{.State.Health.Status}}' oakcloud-postgres 2>$null
    if ($health -eq "healthy") {
        break
    }
    Start-Sleep -Seconds 2
    $attempts++
    Write-Host "      Waiting for PostgreSQL... ($attempts/$maxAttempts)" -ForegroundColor Gray
}

if ($attempts -eq $maxAttempts) {
    Write-Host "Error: PostgreSQL failed to start!" -ForegroundColor Red
    docker compose logs postgres
    exit 1
}
Write-Host "      Services are healthy" -ForegroundColor Green

Write-Host "[2/5] Restoring PostgreSQL database..." -ForegroundColor Yellow
# First, drop existing data and restore
Get-Content ".\migration-backup\database.sql" | docker exec -i oakcloud-postgres psql -U oakcloud oakcloud
Write-Host "      Database restored" -ForegroundColor Green

Write-Host "[3/5] Restoring MinIO data (documents/files)..." -ForegroundColor Yellow
# Stop minio temporarily to restore data
docker compose stop minio
docker run --rm `
    -v oakcloud_minio_data:/data `
    -v "${PWD}\migration-backup:/backup" `
    alpine sh -c "rm -rf /data/* && tar xvf /backup/minio_data.tar -C /data" 2>$null
docker compose start minio
Write-Host "      MinIO data restored" -ForegroundColor Green

Write-Host "[4/5] Restoring Redis data..." -ForegroundColor Yellow
if (Test-Path ".\migration-backup\redis_data.tar") {
    docker compose stop redis
    docker run --rm `
        -v oakcloud_redis_data:/data `
        -v "${PWD}\migration-backup:/backup" `
        alpine sh -c "rm -rf /data/* && tar xvf /backup/redis_data.tar -C /data" 2>$null
    docker compose start redis
    Write-Host "      Redis data restored" -ForegroundColor Green
} else {
    Write-Host "      Redis backup not found, skipping (Redis will start fresh)" -ForegroundColor Yellow
}

Write-Host "[5/5] Running database migrations..." -ForegroundColor Yellow
docker compose exec app npx prisma migrate deploy
Write-Host "      Migrations complete" -ForegroundColor Green

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Your Oakcloud instance is now running!" -ForegroundColor Green
Write-Host ""
Write-Host "Access points:" -ForegroundColor White
Write-Host "  App:          http://localhost:3000" -ForegroundColor Gray
Write-Host "  MinIO Console: http://localhost:9001" -ForegroundColor Gray
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor White
Write-Host "  docker compose logs -f        # View logs" -ForegroundColor Gray
Write-Host "  docker compose restart        # Restart services" -ForegroundColor Gray
Write-Host "  docker compose down           # Stop services" -ForegroundColor Gray
Write-Host "  docker compose up -d          # Start services" -ForegroundColor Gray
Write-Host ""
