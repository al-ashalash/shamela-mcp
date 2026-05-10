# v1.0 Build Progress

Started: 2026-05-10
Last update: 2026-05-10 — **build complete; pending user-side install verification**.

## Final state

All build phases complete and committed. The `.mcpb` artifact is built and packed. The only remaining step is the manual install test in Claude Desktop (Settings → Extensions → Install Extension), which requires user action. After that succeeds, run `git tag 1.0.0`.

## Phase status

| Phase | Status | Artifact |
|---|---|---|
| 0.1 Toggles investigation | ✅ | `docs/toggles-implementation.md` |
| 0.2 Scope investigation | ✅ | `docs/scope-implementation.md` |
| 0.3 Catalog survey | ✅ | `docs/catalog-survey.md` |
| 0.4 Citation format | ✅ | `docs/citation-format.md` |
| 1 Architecture lockdown | ✅ | `docs/v1-architecture.md` + `docs/ipc-protocol.md` |
| 2.1 Foundation modules | ✅ | constants.ts, errors.ts, schemas.ts, format.ts |
| 2.3 Node services | ✅ | catalog.ts, citation.ts, quran.ts, services.ts |
| 2.4 Pages extensions | ✅ | pages.ts |
| 2.5 Java helper extensions | ✅ | 8 new commands; helper jar = 52 KB |
| 2.6 Node tool handlers + registerTool | ✅ | 20 tools in `src/server/tools/` |
| 3 Smoke tests | ✅ | `tests/smoke-v1.ts` — 40/40 assertions pass |
| 4A Evaluation XML | ✅ | `tests/evaluation.xml` — 10 verified Q&A |
| 4B Workflow benchmarks | ✅ | `tests/benchmark.ts` — Mode 1: 3/5, Mode 2: 21/50 with 9 citations |
| 5.1 Manifest bump | ✅ | `manifest.json` v1.0.0, 20 tools listed |
| 5.2 README rewrite | ✅ | `README.md` Arabic-first, 11 sections |
| 5.3 Roadmap | ✅ | `docs/roadmap-v1.1.md` |
| 5.4 Pack | ✅ | `shamela-mcp-1.0.0.mcpb` (694 KB) |
| 5.5 Self-install test | ⏳ user action | run in Claude Desktop, append result to TEST-RESULTS.md |
| 5.6 Tag 1.0.0 | ⏳ blocked on 5.5 | `git tag 1.0.0` after install verifies |

## How to verify (5.5)

1. Open Claude Desktop.
2. Settings → Extensions → Install Extension → select `shamela-mcp-1.0.0.mcpb` at the repo root.
3. **Quit** Claude Desktop fully (right-click tray icon → Quit) and reopen.
4. In a fresh chat, ask: "ابحث في المكتبة الشاملة عن «الكلام» وأخبرني في أي الكتب وردت."
5. Expected: results from book 9942 with snippet, book name, author, printed page.
6. Append the result to `TEST-RESULTS.md`.
7. `git add TEST-RESULTS.md && git commit -m "verify: install + Mode 1 query passes"`.
8. `git tag 1.0.0`.

## Test results summary

- v0.0.1 regression: 5/5 hits unchanged (0 / 9 / 3 / 152 / 2587).
- v1.0 smoke: 40/40 assertions pass (`npm run smoke:v1`).
- v1.0 benchmark: Mode 1 in 3/5 calls; Mode 2 in 21/50 calls with 9 unique pages and 9 valid Shamela-format citations (`npm run benchmark`).

## What changed from v0.0.1

- 3 tools → 20 tools.
- `server.tool` → `server.registerTool` (mcp-builder rubric).
- All annotations explicit per tool (readOnly/destructive/idempotent/openWorld).
- Dual response format (markdown + JSON) on every tool.
- CHARACTER_LIMIT truncation.
- Pagination on every search/list tool.
- Scope filters (book_ids, author_ids, category_ids, period_*, downloaded_only).
- Search options (morphology, wildcards) — preserve_* deferred to v1.1.
- Service joins (tafseer.db, hadeeth.db).
- Catalog tools (list_categories, list_downloaded_books, get_book, get_author).
- Citation formatter (Shamela / short / full styles).
- Quran search + verse fetch with Amiri rendering.
