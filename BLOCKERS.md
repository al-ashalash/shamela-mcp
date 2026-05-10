# v1.0 Blockers

## Active

(none)

## Resolved during the build

### Java helper coverage aggregation was empty
**Symptom**: `search_pages` and `search_titles` returned `coverage.by_book_key = {}` even when there were hits.
**Cause**: Both used `doc.get("book_key")` to extract the book key from each hit, but `book_key` is *indexed* (for scope filtering via TermInSetQuery) and **not stored**. Stored fields can only be retrieved if added with `Field.Store.YES`.
**Fix**: Derive the book key from the stored `id` field (`<book_id>-<page_id>` for pages, `<book_id>-<title_id>` for titles). Committed as part of Phase 3.

### Catalog rewrite type compatibility
**Symptom**: After extending `Catalog` with full records, the v0.0.1 smoke regression broke because the v0.0.1 tools called `Catalog.book(id)` expecting a thin `BookInfo` shape.
**Fix**: Kept `book()` and `author()` returning the legacy `BookInfo` / `AuthorInfo` shapes; added `bookRecord()` / `authorRecord()` for the new rich shapes. Both v0.0.1 and v1.0 tools work side by side.

### `structuredContent: object` type error in registerTool
**Symptom**: `npx tsc --noEmit` flagged `Type 'object' is not assignable to 'Record<string, unknown>'`.
**Cause**: MCP SDK 1.27 narrowed the type.
**Fix**: Changed `ToolResult.structuredContent: object` → `Record<string, unknown>` in `src/server/index.ts`.

## Carried forward to v1.1

These were intentionally deferred per the plan, not blocked:

- `preserve_diacritics` / `preserve_hamza` / `preserve_digits` — currently return `OPTION_NOT_SUPPORTED`. Two-pass RAM-Lucene strategy documented in `docs/roadmap-v1.1.md`.
- OR / NOT / proximity panels between phrase slots.
- Hadith narrator search (`esnad/` index is ciphered).
- Cover image fetch.
- `service/trajim.db` tools.

## Pending (user-side)

- Self-install test in Claude Desktop — see `PROGRESS.md` "How to verify". The artifact `shamela-mcp-1.0.0.mcpb` is built and packed; the install GUI cannot be driven from the CLI.
