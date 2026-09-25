# AGENTS.md

Where each kind of project knowledge lives, and what must move together when it changes.

## 1 Index

Read the source for how things work; read these for what they are meant to be.

| Need | Where |
|---|---|
| Project words, and the ones turned down | `.spec/glossary.md` |
| Expected behavior | `.spec/behavior/*.md`; tests claim an ID with `@behavior` |
| Interfaces that must stay fixed | `.spec/contract/*.md` |
| Design and progress | `docs/design.md`; progress in § 0.3 |
| Runtime structure and layer rules | `docs/architecture.md` |
| Screen layout | `docs/ui.md` |
| Code conventions, naming first | `docs/convention.md` |
| Document conventions | `docs/convention.md` § 2 |
| Component source pins and Variants | `components.json` |
| Build, run and test | `README.md` § Development |
| Quality gates | `.github/workflows/ci.yml`, `.claude/hooks/` |

## 2 Upkeep

A change is finished when the places it touches agree.

| When this changes | Also update |
|---|---|
| A behavior or an interface | `.spec/` first; `sumi verify` reports no difference |
| A feature lands | `docs/design.md` § 0.3 |
| A screen's layout | `docs/ui.md` first |
| A module, layer or dependency between them | `docs/architecture.md` |
| `README.md` | `README.zh-TW.md`, and the other way round |
| The first Variant `components.json` lists for a platform | `README.md` § Installation, in both languages |
