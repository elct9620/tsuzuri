#!/usr/bin/env bash
#
# Stop hook: before a turn ends, run CI's gates for the parts of the project
# that changed, so a broken state is handed back for correction instead of
# being carried into the next turn or discovered on CI.
#
# Every stop is re-checked rather than skipped on stop_hook_active, so a fix is
# verified instead of assumed; Claude Code overrides a Stop hook after eight
# consecutive blocks, so this cannot trap the session.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MANIFEST="$ROOT/src-tauri/Cargo.toml"

cd "$ROOT" || exit 0

# Uncommitted and untracked paths; a working tree matching HEAD has nothing to verify
changed="$(git status --porcelain --untracked-files=all | cut -c4-)"
[ -n "$changed" ] || exit 0

touches() {
	printf '%s\n' "$changed" | grep -qE "$1"
}

report=""

record() {
	report="${report}## ${1}"$'\n'"${2}"$'\n\n'
}

if touches '^src-tauri/' && command -v cargo >/dev/null 2>&1; then
	if ! out="$(cargo fmt --manifest-path "$MANIFEST" --check 2>&1)"; then
		record "Rust format (cargo fmt --check)" "$out"
	fi
	if ! out="$(cargo clippy --manifest-path "$MANIFEST" --all-targets -- -D warnings 2>&1)"; then
		record "Rust lint (cargo clippy -D warnings)" "$out"
	fi
	if ! out="$(cargo test --manifest-path "$MANIFEST" 2>&1)"; then
		record "Rust tests (cargo test)" "$out"
	fi
fi

if touches '^(src/|index\.html$|package\.json$|pnpm-lock\.yaml$|tsconfig\.json$|vite\.config\.ts$)' &&
	command -v pnpm >/dev/null 2>&1; then
	if ! out="$(pnpm test 2>&1)"; then
		record "Frontend tests (pnpm test)" "$out"
	fi
	if ! out="$(pnpm exec tsc --noEmit 2>&1)"; then
		record "Type check (tsc --noEmit)" "$out"
	fi
fi

# A difference may be settled on either side, so any change can open one
if command -v sumi >/dev/null 2>&1; then
	if ! out="$(sumi verify 2>&1)"; then
		record "Specification (sumi verify)" "$out"
	fi
	if touches '^\.spec/' && ! out="$(sumi fmt --check 2>&1)"; then
		record "Specification format (sumi fmt --check)" "$out"
	fi
fi

if [ -n "$report" ]; then
	jq -n --arg r "Quality gate failed before the turn ends; fix these first:"$'\n\n'"$report" \
		'{decision: "block", reason: $r}'
fi

exit 0
