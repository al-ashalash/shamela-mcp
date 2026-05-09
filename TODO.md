# v1.0 TODO

## Phase 0 — Investigation ✅

- [x] 0.1 Toggle + wildcard implementation → `docs/toggles-implementation.md`
- [x] 0.2 Scope filter composition → `docs/scope-implementation.md`
- [x] 0.3 Catalog + citation reality check → `docs/catalog-survey.md`
- [x] 0.4 Citation format → `docs/citation-format.md`

## Phase 1 — Architecture ✅

- [x] 1.1 Lock tool inventory + decisions → `docs/v1-architecture.md`
- [x] 1.2 Lock IPC additions → `docs/ipc-protocol.md`

## Phase 2 — Build

### 2.1 Foundation modules ✅

- [x] `src/server/constants.ts`
- [x] `src/server/errors.ts`
- [x] `src/server/schemas.ts`
- [x] `src/server/format.ts`

### 2.3 Catalog services ✅

- [x] `src/server/catalog.ts` (rewrite for v1.0; CatalogScope, full records)
- [x] `src/server/citation.ts`
- [x] `src/server/quran.ts`
- [x] `src/server/services.ts`

### 2.4 Pages extensions ✅

- [x] `src/server/pages.ts` (getPageRow, getToc, getPagesRange, getSection, etc.)

### 2.2 registerTool migration

- [ ] Migrate `src/server/index.ts` to `registerTool` (no behavior change)
- [ ] Verify v0.0.1 smoke test still passes (regression floor)

### 2.5 Java helper extensions

- [ ] Extend `Main.java` dispatch switch with 8 new commands
- [ ] Extend `IndexCache.java` (already supports adding indexes; ensure `aya`, `title`, `s_book`, `s_author` open lazily)
- [ ] Implement `Resolve.java` (simplest new command — combined `s_book/` + `s_author/` autocomplete)
- [ ] Implement `GetAya.java` (lookup by aya_id from `aya/` index)
- [ ] Implement `SearchQuran.java` (`aya/` index search)
- [ ] Implement `GetPagesBatch.java` (TermInSetQuery on `id` over `page/` index)
- [ ] Implement `GetTitlesBatch.java` (subtree expansion on `title/` index)
- [ ] Extend `SearchPages.java` with scope_book_ids + options + coverage
- [ ] Implement `SearchTitles.java`
- [ ] Extend `SearchBooks.java` with scope + options + coverage
- [ ] Extend `SearchAuthors.java` with options
- [ ] Add `Coverage.java` aggregator class

### 2.6 Node tool handlers

Catalog-only (no Java needed):
- [ ] `tools/listCategories.ts`
- [ ] `tools/listDownloadedBooks.ts`
- [ ] `tools/getBook.ts`
- [ ] `tools/getAuthor.ts`
- [ ] `tools/getCitation.ts`
- [ ] `tools/getBookParts.ts`
- [ ] `tools/getPageServices.ts`

Java-dependent:
- [ ] `tools/resolve.ts`
- [ ] `tools/searchTitles.ts`
- [ ] `tools/searchPages.ts` (rewrite with scope/options/coverage)
- [ ] `tools/searchBooks.ts` (rewrite with scope)
- [ ] `tools/searchAuthors.ts` (rewrite with options)
- [ ] `tools/getPage.ts`
- [ ] `tools/getToc.ts`
- [ ] `tools/getPagesRange.ts`
- [ ] `tools/getBookSection.ts`
- [ ] `tools/searchQuran.ts`
- [ ] `tools/getAya.ts`
- [ ] `tools/getTafseerOfAya.ts`
- [ ] `tools/getBooksForHadith.ts`

Wire-up:
- [ ] Rewrite `src/server/index.ts` to register all 20 tools via `registerTool`
- [ ] Each registration: title (Arabic) + description (English LLM-facing) + inputSchema (Zod) + outputSchema (Zod) + annotations (4 fields)

## Phase 3 — Smoke tests

- [ ] `tests/smoke.ts` extended with ~25 assertions (full list locked in plan §"Phase 3")
- [ ] All assertions pass against Shamela's bundled JRE 21.0.10

## Phase 4 — Evaluation

- [ ] `tests/evaluation.xml` — 10 read-only complex questions in mcp-builder XML format
- [ ] Each question's answer verified by solving with the actual MCP before commit
- [ ] `tests/benchmark.ts` — Mode 1 (≤5 calls) + Mode 2 (≤50 calls) narrative benchmarks

## Phase 5 — Polish + ship

- [ ] Rewrite `README.md` (Arabic-first, 11 sections)
- [ ] Write `docs/roadmap-v1.1.md`
- [ ] Update `manifest.json`: version → 1.0.0, 20 tools, fresh display_name/description/long_description
- [ ] Run `scripts/pack.ps1` → `shamela-mcp-1.0.0.mcpb`
- [ ] Self-install test in Claude Desktop; all 20 tools visible; Mode 1 query works end-to-end
- [ ] Final commit + `git tag 1.0.0` (only after every box above is checked)
