#!/usr/bin/env bash
#
# PostToolUse hook: bring a file just written in line with the project's
# formatting and lint rules, so every later step builds on a consistent file
# rather than discovering the problem at the end of the turn.
#
# Formatting is applied silently because it is not a decision; what a checker
# still reports is, so exit 2 hands stderr back to the model for correction.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TSC="$ROOT/node_modules/.bin/tsc"
PRETTIER="$ROOT/node_modules/.bin/prettier"

file="$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')"
[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0

# A file outside the project does not answer to the project's rules
case "$file" in
"$ROOT"/*) ;;
*) exit 0 ;;
esac

# .prettierignore limits Prettier to the frontend; --ignore-unknown skips the
# extensions it has no parser for
[ -x "$PRETTIER" ] && (cd "$ROOT" && "$PRETTIER" --ignore-unknown --write "$file" >/dev/null 2>&1)

case "$file" in
*.rs)
	# rustfmt reads the crate's edition from Cargo.toml only through cargo;
	# a failure here is a file that no longer parses
	command -v cargo >/dev/null 2>&1 || exit 0
	if ! out="$(cargo fmt --manifest-path "$ROOT/src-tauri/Cargo.toml" 2>&1)"; then
		printf 'rustfmt could not format the crate:\n%s\n' "$out" >&2
		exit 2
	fi
	;;
*.ts)
	# Types span the whole frontend, so one file is checked through the project
	[ -x "$TSC" ] || exit 0
	if ! out="$(cd "$ROOT" && "$TSC" --noEmit 2>&1)"; then
		printf 'Type check failed:\n%s\n' "$out" >&2
		exit 2
	fi
	;;
*.sh)
	command -v shellcheck >/dev/null 2>&1 || exit 0
	if ! out="$(shellcheck "$file" 2>&1)"; then
		printf 'shellcheck still reports problems in %s:\n%s\n' "${file#"$ROOT"/}" "$out" >&2
		exit 2
	fi
	;;
"$ROOT"/.spec/*.md)
	# sumi fmt rewrites the whole specification, so the edited file decides
	# whether it runs rather than what it runs on
	command -v sumi >/dev/null 2>&1 || exit 0
	if ! out="$(cd "$ROOT" && sumi fmt 2>&1)"; then
		printf 'sumi fmt could not write the specification:\n%s\n' "$out" >&2
		exit 2
	fi
	;;
esac

exit 0
