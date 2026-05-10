# v1.0 TODO

## Phase 0 — Investigation ✅

- [x] 0.1 Toggle + wildcard implementation → `docs/toggles-implementation.md`
- [x] 0.2 Scope filter composition → `docs/scope-implementation.md`
- [x] 0.3 Catalog + citation reality check → `docs/catalog-survey.md`
- [x] 0.4 Citation format → `docs/citation-format.md`

## Phase 1 — Architecture ✅

- [x] 1.1 Lock tool inventory + decisions → `docs/v1-architecture.md`
- [x] 1.2 Lock IPC additions → `docs/ipc-protocol.md`

## Phase 2 — Build ✅

- [x] 2.1 Foundation modules (constants, errors, schemas, format)
- [x] 2.3 Catalog services (catalog rewrite, citation, quran, services)
- [x] 2.4 Pages extensions
- [x] 2.5 Java helper extensions (8 new commands; helper jar 52 KB)
- [x] 2.6 Node tool handlers + registerTool migration (20 tools registered)

## Phase 3 — Smoke tests ✅

- [x] `tests/smoke-v1.ts` — 40 assertions, all pass
- [x] v0.0.1 regression: `tests/smoke.ts` still 5/5

## Phase 4 — Evaluation ✅

- [x] `tests/evaluation.xml` — 10 questions, all answers verified live
- [x] `tests/benchmark.ts` — Mode 1: 3/5 calls, Mode 2: 21/50 calls with 9 citations

## Phase 5 — Polish + ship

- [x] 5.1 Bump `manifest.json` to 1.0.0; 20 tools listed
- [x] 5.2 Rewrite `README.md` (Arabic-first, 11 sections)
- [x] 5.3 Write `docs/roadmap-v1.1.md`
- [x] 5.4 Pack via `scripts/pack.ps1` → `shamela-mcp-1.0.0.mcpb` (694 KB)
- [ ] **5.5 Self-install test in Claude Desktop** — user-action; see PROGRESS.md "How to verify"
- [ ] **5.6 `git tag 1.0.0`** — blocked on 5.5 passing
