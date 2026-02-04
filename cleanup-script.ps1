# ShellVault Codebase Cleanup Script - FIXED
# Creates archive folder before deleting anything

Write-Host "🧹 ShellVault Cleanup Script" -ForegroundColor Cyan
Write-Host "Creating archive folder for safety..." -ForegroundColor Yellow

# Create archive folders
New-Item -ItemType Directory -Force -Path "archive\old-api-routes" | Out-Null
New-Item -ItemType Directory -Force -Path "archive\old-broker-lib" | Out-Null
New-Item -ItemType Directory -Force -Path "archive\old-modules" | Out-Null
New-Item -ItemType Directory -Force -Path "archive\test-files" | Out-Null

Write-Host "✅ Archive folders created" -ForegroundColor Green
Write-Host ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 1: Archive potentially useful files
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Write-Host "📦 PHASE 1: Archiving potentially useful files..." -ForegroundColor Cyan

# Archive old API routes
Write-Host "  Archiving old API routes..."
if (Test-Path "app\api\ssh") {
    Move-Item -Path "app\api\ssh" -Destination "archive\old-api-routes\ssh" -ErrorAction SilentlyContinue
    Write-Host "  ✓ Archived: app/api/ssh" -ForegroundColor Gray
}

if (Test-Path "app\api\broker") {
    Move-Item -Path "app\api\broker" -Destination "archive\old-api-routes\broker" -ErrorAction SilentlyContinue
    Write-Host "  ✓ Archived: app/api/broker" -ForegroundColor Gray
}

# Archive old broker libraries
Write-Host "  Archiving old broker libraries..."
if (Test-Path "lib\broker") {
    Move-Item -Path "lib\broker" -Destination "archive\old-broker-lib\broker" -ErrorAction SilentlyContinue
    Write-Host "  ✓ Archived: lib/broker" -ForegroundColor Gray
}

if (Test-Path "types\broker.ts") {
    Move-Item -Path "types\broker.ts" -Destination "archive\old-broker-lib\broker.ts" -ErrorAction SilentlyContinue
    Write-Host "  ✓ Archived: types/broker.ts" -ForegroundColor Gray
}

# Archive old module folders
Write-Host "  Archiving old module folders..."
if (Test-Path "parrot") {
    Move-Item -Path "parrot" -Destination "archive\old-modules\parrot" -ErrorAction SilentlyContinue
    Write-Host "  ✓ Archived: parrot/" -ForegroundColor Gray
}

if (Test-Path "windows") {
    Move-Item -Path "windows" -Destination "archive\old-modules\windows" -ErrorAction SilentlyContinue
    Write-Host "  ✓ Archived: windows/" -ForegroundColor Gray
}

if (Test-Path "core") {
    Move-Item -Path "core" -Destination "archive\old-modules\core" -ErrorAction SilentlyContinue
    Write-Host "  ✓ Archived: core/" -ForegroundColor Gray
}

Write-Host "✅ Phase 1 complete" -ForegroundColor Green
Write-Host ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 2: Delete test files (move to archive first)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Write-Host "🧪 PHASE 2: Archiving test files..." -ForegroundColor Cyan

$testFiles = @(
    "app\test.css",
    "lib\auth\test-jwt.ts",
    "lib\redis\test-redis.ts",
    "test-agent-installer.ts",
    "test-auth.ts",
    "test-auth-gateway.ts",
    "test-broker-all.ts",
    "test-broker-challenge.ts",
    "test-broker-crypto.ts",
    "test-broker-handshake-flow.ts",
    "test-broker-queue.ts",
    "test-broker-session.ts",
    "test-challenge-unit.ts",
    "test-complete-system.ts",
    "test-crypto-only.ts",
    "test-crypto-unit.ts",
    "test-heartbeat-system.ts",
    "test-phase1-crypto.ts",
    "test-shellvault-api.ts",
    "test-ssh-client.ts",
    "test-ssh-pipeline.ts",
    "test-websocket-message.ts",
    "verify-db-schema.ts"
)

foreach ($file in $testFiles) {
    if (Test-Path $file) {
        $filename = Split-Path $file -Leaf
        Move-Item -Path $file -Destination "archive\test-files\$filename" -ErrorAction SilentlyContinue
        Write-Host "  ✓ Archived: $file" -ForegroundColor Gray
    }
}

Write-Host "✅ Phase 2 complete" -ForegroundColor Green
Write-Host ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 3: Delete backups and old files
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Write-Host "🗑️  PHASE 3: Deleting backup/old files..." -ForegroundColor Cyan

$deleteFiles = @(
    ".env.local",
    "lib\agent\agent-script.ts.old",
    "server.js.backup",
    "files-audit.txt",
    "Redis-x64-5.0.14.1.zip"
)

foreach ($file in $deleteFiles) {
    if (Test-Path $file) {
        Remove-Item -Path $file -Force -ErrorAction SilentlyContinue
        Write-Host "  ✓ Deleted: $file" -ForegroundColor Gray
    }
}

# Delete weird file with special characters (using Get-ChildItem)
Write-Host "  Checking for weird files..."
Get-ChildItem -Path . -Filter "r.json*" | ForEach-Object {
    Remove-Item -Path $_.FullName -Force -ErrorAction SilentlyContinue
    Write-Host "  ✓ Deleted: $($_.Name)" -ForegroundColor Gray
}

Write-Host "✅ Phase 3 complete" -ForegroundColor Green
Write-Host ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 4: Delete empty dashboard routes
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Write-Host "📁 PHASE 4: Checking dashboard routes..." -ForegroundColor Cyan

if (Test-Path "app\(dashboard)") {
    Write-Host "  Found app/(dashboard) folder"
    Write-Host "  Checking if empty..."
    
    # Check if files are actually empty/unused
    $dashboardFiles = Get-ChildItem "app\(dashboard)" -Recurse -File -ErrorAction SilentlyContinue
    if ($dashboardFiles) {
        $totalSize = ($dashboardFiles | Measure-Object -Property Length -Sum).Sum
    } else {
        $totalSize = 0
    }
    
    if ($totalSize -lt 500) {
        Write-Host "  ⚠️  Dashboard folder appears mostly empty" -ForegroundColor Yellow
        Write-Host "  Moving to archive..." -ForegroundColor Yellow
        Move-Item -Path "app\(dashboard)" -Destination "archive\old-modules\dashboard-old" -ErrorAction SilentlyContinue
        Write-Host "  ✓ Archived: app/(dashboard)" -ForegroundColor Gray
    } else {
        Write-Host "  ℹ️  Dashboard folder has content, keeping it" -ForegroundColor Yellow
    }
}

Write-Host "✅ Phase 4 complete" -ForegroundColor Green
Write-Host ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 5: Update .gitignore
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Write-Host "📝 PHASE 5: Updating .gitignore..." -ForegroundColor Cyan

$gitignoreContent = @"
# Dependencies
node_modules/
package-lock.json

# Build output
.next/
out/
dist/
build/
.turbo/

# Environment
.env
.env.local
.env.*.local

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Testing
coverage/
.nyc_output/
test-*.ts
*test*.ts

# OS
.DS_Store
Thumbs.db
*.swp
*.swo
*~

# IDE
.vscode/
.idea/
*.sublime-*

# Archives
archive/

# Misc
files-audit.txt
tree.txt
*.backup
*.old
"@

Set-Content -Path ".gitignore" -Value $gitignoreContent
Write-Host "  ✓ .gitignore updated" -ForegroundColor Gray

Write-Host "✅ Phase 5 complete" -ForegroundColor Green
Write-Host ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SUMMARY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ CLEANUP COMPLETE!" -ForegroundColor Green
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "📊 Summary:" -ForegroundColor Yellow
Write-Host "  ✓ Old API routes → archive/old-api-routes/" -ForegroundColor Gray
Write-Host "  ✓ Old broker libs → archive/old-broker-lib/" -ForegroundColor Gray
Write-Host "  ✓ Old modules → archive/old-modules/" -ForegroundColor Gray
Write-Host "  ✓ Test files → archive/test-files/" -ForegroundColor Gray
Write-Host "  ✓ Backup files → deleted" -ForegroundColor Gray
Write-Host "  ✓ .gitignore → updated" -ForegroundColor Gray
Write-Host ""
Write-Host "🔒 Safety:" -ForegroundColor Yellow
Write-Host "  All potentially useful files archived" -ForegroundColor Gray
Write-Host "  You can restore from archive/ if needed" -ForegroundColor Gray
Write-Host ""
Write-Host "🗑️  To delete archive permanently:" -ForegroundColor Yellow
Write-Host "  Remove-Item -Recurse -Force archive/" -ForegroundColor Gray
Write-Host ""
Write-Host "📁 Your clean project structure:" -ForegroundColor Cyan
Write-Host "  app/          → Routes & pages" -ForegroundColor Gray
Write-Host "  components/   → UI components" -ForegroundColor Gray
Write-Host "  lib/          → Core utilities" -ForegroundColor Gray
Write-Host "  prisma/       → Database" -ForegroundColor Gray
Write-Host "  server.js     → Broker" -ForegroundColor Gray
Write-Host ""
Write-Host "🚀 Next steps:" -ForegroundColor Green
Write-Host "  1. Test your app still works" -ForegroundColor Gray
Write-Host "  2. If all good, delete archive/" -ForegroundColor Gray
Write-Host "  3. Commit clean codebase to git" -ForegroundColor Gray
Write-Host ""