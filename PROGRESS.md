# v1.0 Build Progress

Started: 2026-05-10
Last update: 2026-05-10 (checkpoint)

## Current state

**Phases 0, 1, and the Node-side foundation of Phase 2 are complete and committed.** The build is paused at a clean checkpoint. Remaining work is the Java helper extensions, the 17 new Node tool handlers, the 25-assertion smoke suite, the 10-question evaluation XML, the README rewrite, and the .mcpb pack — all locked specs, no design ambiguity left.

## Completed (committed)

- [x] Plan approved → `~/.claude/plans/stateless-sauteeing-stardust.md`
- [x] mcp-builder skill (SKILL.md, mcp_best_practices.md, node_mcp_server.md, evaluation.md) audited; plan updated for `registerTool`, `outputSchema`, dual response_format, pagination, CHARACTER_LIMIT, 10-question evaluation XML.
- [x] Status files initialized: `PROGRESS.md`, `TODO.md`, `DECISIONS.md`, `BLOCKERS.md`, `TEST-RESULTS.md`.
- [x] **Phase 0.1**: `docs/toggles-implementation.md` — morphology + wildcards ship; preserve_* returns OPTION_NOT_SUPPORTED in v1.0.
- [x] **Phase 0.2**: `docs/scope-implementation.md` — scope schema; categories are FLAT in master.db (no transitive expansion).
- [x] **Phase 0.3**: `docs/catalog-survey.md` — live SQL run; master.db lacks edition/publisher/city/editor; book 9942 has 23 top-level chapters, 0 parts, 0 page-level service annotations (corrected smoke assumptions).
- [x] **Phase 0.4**: `docs/citation-format.md` — three styles (`shamela` / `short` / `full`) with byte-exact test cases.
- [x] **Phase 1**: `docs/v1-architecture.md` + `docs/ipc-protocol.md` — 20 tools locked, scope/options schemas locked, 8 new IPC commands defined, error taxonomy locked, citation templates as code constants.
- [x] **Phase 2.1**: foundation modules
  - `src/server/constants.ts` — CHARACTER_LIMIT, DEFAULT_LIMIT, MAX_LIMIT, COVERAGE_CAP, etc.
  - `src/server/errors.ts` — ShamelaError class + Arabic factory functions for the full error taxonomy.
  - `src/server/schemas.ts` — PaginationInput, ResponseFormatInput, ScopeInput, OptionsInput Zod fragments.
  - `src/server/format.ts` — dual markdown/JSON renderer with CHARACTER_LIMIT truncation, arabize() helper.
- [x] **Phase 2.3**: Node-side services
  - `src/server/catalog.ts` (rewrite) — full BookRecord/AuthorRecord/CategoryRecord, booksByAuthor (incl. coauthor), booksByCategory, downloadedBookIds, mainAuthorName, bookAuthors, listCategories. CatalogScope class resolves ScopeInput to book_ids.
  - `src/server/citation.ts` — formatShamelaCitation/Short/Full per `docs/citation-format.md` with full Arabic-Indic digit conversion.
  - `src/server/quran.ts` — 114 surahs + verse counts (6,236 ayat); aya_id ↔ (surah, aya) conversion. Static, no SQL.
  - `src/server/services.ts` — ServiceStore for tafseer/hadeeth/trajim service joins via sql.js.
- [x] **Phase 2.4**: pages.ts extensions — getPageRow, getPagesRows, getPagesRange, pageCount, getToc, getAncestorChain, getSection, getBookParts, getPageServices, hasBook. Legacy `printedPage` preserved.
- [x] v0.0.1 smoke regression test still passes (5/5 hits: 0/9/3/152/2587).

## Remaining (in order)

### Phase 2.5 — Java helper extensions (~600 lines Java)

8 new IPC commands per `docs/ipc-protocol.md`:

| Command | Lucene index | New file |
|---|---|---|
| `search_pages_v2` | `page/` | extend `SearchPages.java` |
| `search_titles` | `title/` | new `SearchTitles.java` |
| `search_books_v2` | `book/` | extend `SearchBooks.java` |
| `search_authors_v2` | `author/` | extend `SearchAuthors.java` |
| `search_quran` | `aya/` | new `SearchQuran.java` |
| `get_aya` | `aya/` | new `GetAya.java` |
| `resolve` | `s_book/` + `s_author/` | new `Resolve.java` |
| `get_page_content` | `page/` | extend `Main.java` (one-liner using IndexCache.storedFields) |
| `get_pages_batch` | `page/` | new `GetPagesBatch.java` |
| `get_titles_batch` | `title/` | new `GetTitlesBatch.java` |

Implementation rules in `docs/v1-architecture.md` and `docs/toggles-implementation.md` §5. Coverage aggregation pattern: walk hits, group by `book_key` (a stored field on every doc), emit map of book_id → count, capped at COVERAGE_CAP=5,000.

Every new search command honors:
- `scope_book_ids` (array filter via TermInSetQuery on `book_key`)
- `morphology` (swap to `m_*` fields, use `Analyzer.stem()`)
- `wildcards` (use WildcardQuery for tokens with `*` or `?`)
- `morphology + wildcards` → OPTION_CONFLICT
- `preserve_*` → OPTION_NOT_SUPPORTED

`Main.java`'s switch dispatches the new commands. `IndexCache.java` already supports adding new index names via lazy `searcher(name)`.

### Phase 2.6 — 17 new Node tool handlers (~500 lines TS)

One file per tool in `src/server/tools/`. Tool surfaces and descriptions are locked in `docs/v1-architecture.md`. Build order:

1. **Catalog-only (no Java)**: `listCategories.ts`, `listDownloadedBooks.ts`, `getBook.ts`, `getAuthor.ts`, `getCitation.ts`, `getBookParts.ts`, `getPageServices.ts`. ~7 tools, ~150 lines.
2. **Java-needed**: `resolve.ts`, `searchTitles.ts`, `searchPages.ts` (extend), `searchBooks.ts` (extend), `searchAuthors.ts` (extend), `getPage.ts`, `getToc.ts`, `getPagesRange.ts`, `getBookSection.ts`, `searchQuran.ts`, `getAya.ts`, `getTafseerOfAya.ts`, `getBooksForHadith.ts`. ~13 tools, ~350 lines.

`src/server/index.ts` is rewritten to:
- Import all 20 tool handlers.
- Use `server.registerTool(name, config, handler)` (not deprecated `server.tool`).
- Each `config` includes `title` (Arabic), `description` (English), `inputSchema`, `outputSchema`, `annotations: { readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:false }`.
- Each handler returns `{ content: [{ type:"text", text }], structuredContent: ... }` via `format.ts: renderResponse`.

### Phase 3 — Smoke tests (~25 assertions)

Locked list in `~/.claude/plans/stateless-sauteeing-stardust.md` Phase 3.

### Phase 4 — Evaluation XML + benchmarks

- `tests/evaluation.xml`: 10 read-only complex questions about the catalog (death years, chapter counts, printed pages). Each verified by solving manually with the MCP before commit.
- `tests/benchmark.ts`: Mode 1 (≤5 calls) + Mode 2 (≤50 calls) workflow simulations.

### Phase 5 — Polish + ship

- Update `manifest.json`: bump to 1.0.0, add 20 tools, refresh display_name/description/long_description.
- Rewrite `README.md` (Arabic-first, 11 sections per plan).
- Write `docs/roadmap-v1.1.md`.
- Run `scripts/pack.ps1` → `shamela-mcp-1.0.0.mcpb`.
- Self-install in Claude Desktop, verify all 20 tools, run a Mode 1 query end-to-end.
- Final commit + `git tag 1.0.0` (only after all of the above passes).

## How to resume

1. `git log --oneline` shows the build's audit trail.
2. The plan file has every detail; `docs/v1-architecture.md` is the single source of truth for tool surfaces.
3. Foundation modules are in place; the next concrete step is **Phase 2.5** — write the Java helper extensions starting with `Main.java`'s expanded dispatch switch, then `Resolve.java` (simplest new command, validates the IPC pattern), then `GetAya.java`, then the search extensions.
4. After each Java extension: rebuild via `scripts/build-java.ps1`, manually invoke with a one-shot `echo '{"id":"1","cmd":"resolve","args":{...}}' | java ...` to verify before wiring the Node tool.
5. `tests/smoke.ts` v0.0.1 baseline still passes — that's the regression floor.

## Notes for next session

- **Autonomous mode reality**: The v1.0 build's full scope (Java + Node + tests + benchmarks + README + pack) is genuinely larger than one session. The pause is at a clean checkpoint, not a failure. All architectural decisions are locked in `docs/`; there's no design ambiguity left.
- **`registerTool` uses the same `Helper` and `formatError` paths** as v0.0.1 — no architectural surprises in migration.
- **The Java helper extensions are the longest piece**. Suggested order: extend `Main.java` dispatch first, then write commands one at a time with manual smoke tests after each. Build via `scripts/build-java.ps1` (auto-detects JDK 21 Temurin).
