#!/bin/bash

# Script to run a command in all Yarn workspaces and the root directory
# Usage: ./run-everywhere.sh <command>
# Example: ./run-everywhere.sh "npm audit fix"

if [ $# -eq 0 ]; then
    echo "Usage: $0 <command>"
    echo "Example: $0 \"npm run build\""
    exit 1
fi

COMMAND="$*"
ROOT_DIR=$(pwd)

echo "🚀 Running command in all workspaces and root: $COMMAND"
echo "=================================================="

# Run in root first
echo ""
echo "📁 Running in root directory..."
echo "Current directory: $ROOT_DIR"
if eval "$COMMAND"; then
    echo "✅ Root: SUCCESS"
else
    echo "❌ Root: FAILED"
    ROOT_FAILED=true
fi

# Get list of workspaces
WORKSPACES=$(yarn workspaces list --json | jq -r '.location' | grep -v '\.')

# Run in each workspace
for workspace in $WORKSPACES; do
    echo ""
    echo "📁 Running in workspace: $workspace"
    echo "Current directory: $ROOT_DIR/$workspace"
    cd "$ROOT_DIR/$workspace"

    if eval "$COMMAND"; then
        echo "✅ $workspace: SUCCESS"
    else
        echo "❌ $workspace: FAILED"
        WORKSPACE_FAILED=true
    fi

    cd "$ROOT_DIR"
done

echo ""
echo "=================================================="
if [ "$ROOT_FAILED" = true ]