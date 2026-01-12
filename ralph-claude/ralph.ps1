# ralph.ps1 - Windows PowerShell version of Ralph
# Usage: .\ralph.ps1 [max_iterations]

param(
    [int]$MaxIterations = 10
)

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$PrdFile = Join-Path $ScriptDir "prd.json"
$ProgressFile = Join-Path $ScriptDir "progress.txt"
$PromptFile = Join-Path $ScriptDir "prompt.md"
$ArchiveDir = Join-Path $ScriptDir "archive"
$LastBranchFile = Join-Path $ScriptDir ".last-branch"
$AgentsFile = Join-Path $ScriptDir "AGENTS.md"

Set-Location $ProjectRoot

# Check prd.json exists
if (-not (Test-Path $PrdFile)) {
    Write-Host "ERROR: prd.json not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Create a PRD first:"
    Write-Host "  1. Run: claude"
    Write-Host "  2. Say: Use the PRD skill in ralph-claude/skills/prd/SKILL.md to create a PRD for [your feature]"
    Write-Host "  3. Then: Use the ralph skill in ralph-claude/skills/ralph/SKILL.md to convert it to prd.json"
    exit 1
}

# Read PRD
$prd = Get-Content $PrdFile -Raw | ConvertFrom-Json
$currentBranch = if ($prd.branchName) { $prd.branchName } else { "ralph/sprint" }

# Archive previous run if branch changed
if (Test-Path $LastBranchFile) {
    $lastBranch = Get-Content $LastBranchFile -Raw
    if ($lastBranch -and $lastBranch.Trim() -ne $currentBranch) {
        $date = Get-Date -Format "yyyy-MM-dd"
        $folderName = $lastBranch -replace "^ralph/", ""
        $archiveFolder = Join-Path $ArchiveDir "$date-$folderName"

        Write-Host "Archiving previous run: $lastBranch -> $archiveFolder"
        New-Item -ItemType Directory -Path $archiveFolder -Force | Out-Null
        if (Test-Path $PrdFile) { Copy-Item $PrdFile $archiveFolder }
        if (Test-Path $ProgressFile) { Copy-Item $ProgressFile $archiveFolder }

        # Reset progress
        @"
# Ralph Progress Log
Started: $(Get-Date)
Branch: $currentBranch

## Codebase Patterns
(Consolidated reusable patterns - updated during iterations)

---

"@ | Out-File $ProgressFile -Encoding utf8
    }
}

# Track current branch
$currentBranch | Out-File $LastBranchFile -Encoding utf8 -NoNewline

# Initialize progress file
if (-not (Test-Path $ProgressFile)) {
    @"
# Ralph Progress Log
Started: $(Get-Date)
Branch: $currentBranch

## Codebase Patterns
(Consolidated reusable patterns - updated during iterations)

---

"@ | Out-File $ProgressFile -Encoding utf8
}

# Checkout branch
Write-Host "Checking out branch: $currentBranch"
git checkout -B $currentBranch 2>$null
if ($LASTEXITCODE -ne 0) { git checkout $currentBranch }

Write-Host ""
Write-Host "Starting Ralph - Max iterations: $MaxIterations"
Write-Host ""

# Main loop
for ($i = 1; $i -le $MaxIterations; $i++) {
    Write-Host ""
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host " Ralph Iteration $i of $MaxIterations" -ForegroundColor Cyan
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host ""

    $prdContent = Get-Content $PrdFile -Raw
    $progressContent = Get-Content $ProgressFile -Raw
    $promptContent = Get-Content $PromptFile -Raw
    $agentsContent = if (Test-Path $AgentsFile) { Get-Content $AgentsFile -Raw } else { "No AGENTS.md yet" }

    # Run Claude Code
    $output = $promptContent | claude -p `
        --allowedTools "Bash,Read,Edit,Write,Glob,Grep,mcp__browsermcp__browser_navigate,mcp__browsermcp__browser_snapshot,mcp__browsermcp__browser_click,mcp__browsermcp__browser_type,mcp__browsermcp__browser_screenshot" `
        --append-system-prompt "PRD: $prdContent" `
        --append-system-prompt "PROGRESS: $progressContent" `
        --append-system-prompt "AGENTS: $agentsContent" `
        --output-format text 2>&1

    Write-Host $output

    # Check completion
    if ($output -match "<complete>ALL_STORIES_DONE</complete>") {
        Write-Host ""
        Write-Host "=======================================================" -ForegroundColor Green
        Write-Host " ALL STORIES COMPLETED!" -ForegroundColor Green
        Write-Host " Completed at iteration $i of $MaxIterations" -ForegroundColor Green
        Write-Host "=======================================================" -ForegroundColor Green
        exit 0
    }

    # Quality gates
    Write-Host ""
    Write-Host "Running quality gates..."

    npm run lint
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Lint failed - will retry" -ForegroundColor Yellow
        "`n## Iteration $i - $(Get-Date) - LINT FAILED" | Add-Content $ProgressFile
        Start-Sleep -Seconds 2
        continue
    }

    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed - will retry" -ForegroundColor Yellow
        "`n## Iteration $i - $(Get-Date) - BUILD FAILED" | Add-Content $ProgressFile
        Start-Sleep -Seconds 2
        continue
    }

    Write-Host "Quality gates passed" -ForegroundColor Green

    # Update PRD - mark completed story as passes: true
    if ($output -match '"storyId"\s*:\s*"([^"]+)"' -and $output -match '"status"\s*:\s*"done"') {
        $completedStoryId = $Matches[1]
        Write-Host "Marking story $completedStoryId as complete..." -ForegroundColor Cyan

        # Read and update prd.json
        $prdData = Get-Content $PrdFile -Raw | ConvertFrom-Json
        foreach ($story in $prdData.userStories) {
            if ($story.id -eq $completedStoryId) {
                $story.passes = $true
                Write-Host "Updated $completedStoryId passes = true" -ForegroundColor Green
            }
        }
        $prdData | ConvertTo-Json -Depth 10 | Out-File $PrdFile -Encoding utf8
    }

    # Commit
    $status = git status --porcelain
    if ($status) {
        git add -A

        # Try to extract story ID from output (handle spaces in JSON)
        if ($output -match '"storyId"\s*:\s*"([^"]+)"') {
            $storyId = $Matches[1]
            git commit -m "feat: [$storyId] - Ralph iteration $i"
        } else {
            git commit -m "feat: Ralph iteration $i"
        }
        Write-Host "Committed changes" -ForegroundColor Green
    }

    # Update progress
    "`n## Iteration $i - $(Get-Date)`n`n$output" | Add-Content $ProgressFile

    Write-Host ""
    Write-Host "Iteration $i complete. Continuing..."
    Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Yellow
Write-Host " Ralph reached max iterations ($MaxIterations)" -ForegroundColor Yellow
Write-Host " Check progress.txt for status" -ForegroundColor Yellow
Write-Host "=======================================================" -ForegroundColor Yellow
exit 1
