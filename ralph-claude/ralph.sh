#!/bin/bash
# Ralph - Long-running AI agent loop for Claude Code
# Usage: ./ralph.sh [max_iterations]

set -e

MAX_ITERATIONS=${1:-10}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PRD_FILE="$SCRIPT_DIR/prd.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
PROMPT_FILE="$SCRIPT_DIR/prompt.md"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
LAST_BRANCH_FILE="$SCRIPT_DIR/.last-branch"

cd "$PROJECT_ROOT"

# Check prd.json exists
if [ ! -f "$PRD_FILE" ]; then
  echo "ERROR: prd.json not found!"
  echo ""
  echo "Create a PRD first:"
  echo "  1. Run: claude"
  echo "  2. Say: Use the PRD skill in ralph-claude/skills/prd/SKILL.md to create a PRD for [your feature]"
  echo "  3. Then: Use the ralph skill in ralph-claude/skills/ralph/SKILL.md to convert it to prd.json"
  exit 1
fi

# Archive previous run if branch changed
if [ -f "$LAST_BRANCH_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  LAST_BRANCH=$(cat "$LAST_BRANCH_FILE" 2>/dev/null || echo "")

  if [ -n "$CURRENT_BRANCH" ] && [ -n "$LAST_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LAST_BRANCH" ]; then
    DATE=$(date +%Y-%m-%d)
    FOLDER_NAME=$(echo "$LAST_BRANCH" | sed 's|^ralph/||')
    ARCHIVE_FOLDER="$ARCHIVE_DIR/$DATE-$FOLDER_NAME"

    echo "Archiving previous run: $LAST_BRANCH → $ARCHIVE_FOLDER"
    mkdir -p "$ARCHIVE_FOLDER"
    [ -f "$PRD_FILE" ] && cp "$PRD_FILE" "$ARCHIVE_FOLDER/"
    [ -f "$PROGRESS_FILE" ] && cp "$PROGRESS_FILE" "$ARCHIVE_FOLDER/"

    # Reset progress for new branch
    echo "# Ralph Progress Log" > "$PROGRESS_FILE"
    echo "Started: $(date)" >> "$PROGRESS_FILE"
    echo "Branch: $CURRENT_BRANCH" >> "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"
    echo "## Codebase Patterns" >> "$PROGRESS_FILE"
    echo "(Consolidated reusable patterns - updated during iterations)" >> "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"
  fi
fi

# Track current branch
CURRENT_BRANCH=$(jq -r '.branchName // "ralph/sprint"' "$PRD_FILE" 2>/dev/null)
echo "$CURRENT_BRANCH" > "$LAST_BRANCH_FILE"

# Initialize progress file if doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "Branch: $CURRENT_BRANCH" >> "$PROGRESS_FILE"
  echo "" >> "$PROGRESS_FILE"
  echo "## Codebase Patterns" >> "$PROGRESS_FILE"
  echo "(Consolidated reusable patterns - updated during iterations)" >> "$PROGRESS_FILE"
  echo "" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
  echo "" >> "$PROGRESS_FILE"
fi

# Checkout branch
echo "Checking out branch: $CURRENT_BRANCH"
git checkout -B "$CURRENT_BRANCH" 2>/dev/null || git checkout "$CURRENT_BRANCH"

echo ""
echo "Starting Ralph - Max iterations: $MAX_ITERATIONS"
echo ""

# Main loop
for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo " Ralph Iteration $i of $MAX_ITERATIONS"
  echo "═══════════════════════════════════════════════════════"
  echo ""

  # Run Claude Code with prompt
  OUTPUT=$(cat "$PROMPT_FILE" | claude -p \
    --allowedTools "Bash,Read,Edit,Write,Glob,Grep,mcp__browsermcp__browser_navigate,mcp__browsermcp__browser_snapshot,mcp__browsermcp__browser_click,mcp__browsermcp__browser_type,mcp__browsermcp__browser_screenshot" \
    --append-system-prompt "PRD: $(cat $PRD_FILE)" \
    --append-system-prompt "PROGRESS: $(cat $PROGRESS_FILE)" \
    --append-system-prompt "AGENTS: $(cat $SCRIPT_DIR/AGENTS.md 2>/dev/null || echo 'No AGENTS.md yet')" \
    --output-format text 2>&1 | tee /dev/stderr) || true

  # Check for completion signal
  if echo "$OUTPUT" | grep -q "<complete>ALL_STORIES_DONE</complete>"; then
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo " ALL STORIES COMPLETED!"
    echo " Completed at iteration $i of $MAX_ITERATIONS"
    echo "═══════════════════════════════════════════════════════"
    exit 0
  fi

  # Run quality gates
  echo ""
  echo "Running quality gates..."

  if ! npm run lint; then
    echo "❌ Lint failed - will retry next iteration"
    echo "" >> "$PROGRESS_FILE"
    echo "## Iteration $i - $(date) - LINT FAILED" >> "$PROGRESS_FILE"
    sleep 2
    continue
  fi

  if ! npm run build; then
    echo "❌ Build failed - will retry next iteration"
    echo "" >> "$PROGRESS_FILE"
    echo "## Iteration $i - $(date) - BUILD FAILED" >> "$PROGRESS_FILE"
    sleep 2
    continue
  fi

  echo "✅ Quality gates passed"

  # Update PRD - mark completed story as passes: true
  COMPLETED_STORY_ID=$(echo "$OUTPUT" | grep -oP '"storyId"\s*:\s*"\K[^"]+' | head -1 || echo "")
  IS_DONE=$(echo "$OUTPUT" | grep -q '"status"\s*:\s*"done"' && echo "yes" || echo "no")

  if [ -n "$COMPLETED_STORY_ID" ] && [ "$IS_DONE" = "yes" ]; then
    echo "Marking story $COMPLETED_STORY_ID as complete..."
    # Update prd.json using jq
    jq --arg id "$COMPLETED_STORY_ID" '(.userStories[] | select(.id == $id) | .passes) = true' "$PRD_FILE" > "$PRD_FILE.tmp" && mv "$PRD_FILE.tmp" "$PRD_FILE"
    echo "✅ Updated $COMPLETED_STORY_ID passes = true"
  fi

  # Commit on success (if there are changes)
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    # Extract story ID from output
    STORY_ID=$(echo "$OUTPUT" | grep -oP '"storyId"\s*:\s*"\K[^"]+' | head -1 || echo "")
    STORY_TITLE=$(echo "$OUTPUT" | grep -oP '"title":\s*"\K[^"]+' | head -1 || echo "iteration $i")

    if [ -n "$STORY_ID" ]; then
      git commit -m "feat: [$STORY_ID] - $STORY_TITLE"
    else
      git commit -m "feat: Ralph iteration $i"
    fi
    echo "✅ Committed changes"
  fi

  # Update progress
  echo "" >> "$PROGRESS_FILE"
  echo "## Iteration $i - $(date)" >> "$PROGRESS_FILE"
  echo "" >> "$PROGRESS_FILE"
  echo "$OUTPUT" | tail -100 >> "$PROGRESS_FILE"

  echo ""
  echo "Iteration $i complete. Continuing..."
  sleep 2
done

echo ""
echo "═══════════════════════════════════════════════════════"
echo " Ralph reached max iterations ($MAX_ITERATIONS)"
echo " Check progress.txt for status"
echo "═══════════════════════════════════════════════════════"
exit 1
