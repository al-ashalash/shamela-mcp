# v1.0 Test Results

Append after every test run.

## 2026-05-10 — v0.0.1 regression after catalog rewrite

Ran `npx tsx tests/smoke.ts` against Shamela's bundled JRE 21.0.10 immediately after the v1.0 catalog rewrite (which extends the legacy `BookInfo` / `AuthorInfo` shape with full records).

Result: **5/5 PASS** (no regression).

```
Java:          21.0.10
[OK] search_pages query="المنطق" → total_hits=0 expected=0
[OK] search_pages query="الكلام" → total_hits=9 expected=9
[OK] search_pages query="الكلام لغة" → total_hits=3 expected=3
[OK] search_books query="علم" → total_hits=152
[OK] search_authors query="ابن" → total_hits=2587
All smoke checks passed.
```

The legacy `Catalog.book(id)` and `Catalog.author(id)` methods preserve their v0.0.1 return shape (`BookInfo` / `AuthorInfo` with `book_name`, `author_name`, `death_year`). v1.0 callers will use new `bookRecord(id)` / `authorRecord(id)` for the rich `BookRecord` / `AuthorRecord` shapes.

## 2026-05-10 — v1.0 smoke test (40 assertions)

Ran `npm run smoke:v1`. All 20 tool handlers exercised end-to-end through their run-functions against book 9942 (الأصول من علم الأصول، ابن عثيمين, single downloaded book on the test install).

Result: **40/40 PASS**.

Highlights:
- `list_categories` → 41 categories; «أصول الفقه» = 252 books.
- `get_book(9942)` → name «الأصول من علم الأصول»; main author id=57 («ابن عثيمين»).
- `get_author(57)` → 108 books; book_count includes co-authored.
- `resolve("ابن عثيمين")` → 2 author candidates; top is id=57.
- `search_pages("الكلام")` → exactly 9 hits.
- `search_pages("الكلام", scope.book_ids=[9942])` → 9 hits.
- `search_pages("الكلام", scope.author_ids=[57])` → 9 hits.
- `search_pages("كلم", morphology=true)` → 52 hits via m_body (Arabic root expansion).
- `search_pages` morphology + wildcards → throws OPTION_CONFLICT (correctly rejected).
- `search_titles("الكلام", book=9942)` → 2 chapter title hits.
- `get_toc(9942, depth=1)` → 23 top-level chapters; first title «مقدمة المؤلف».
- `get_toc(9942, containing_page_id=17)` → ancestor chain length 2.
- `get_page(9942, 17)` → body length 689; printed_page=22.
- `get_pages_range(9942, 1, 5)` → 5 consecutive pages with body.
- `get_book_section(9942, first_title)` → 1 page (the مقدمة).
- `get_citation(shamela)` → «الأصول من علم الأصول» (ص ٢٢) — Arabic-Indic digits.
- `get_citation(full)` → 4 missing-field notes (edition/publisher/city/editor).
- `get_book_parts(9942)` → single-volume; total_pages=93; parts=[].
- `get_page_services(9942, 17)` → has_services=false.
- `search_quran("الرحمن")` → 45 ayat.
- `get_aya(1)` → بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ.
- `get_aya(surah=1, aya=1)` → aya_id=1.
- `get_tafseer_of_aya(1)` → SERVICE_KEY_NOT_FOUND (clean; tafseer.db keys this aya only when commented; 1 is not).
- `get_books_for_hadith(1)` → SERVICE_KEY_NOT_FOUND (clean).
- Markdown render: «الكتب المنزَّلة» heading present.
- Pagination: search_authors("ابن") returns has_more=true with next_offset=5.

Java helper bug fixed during smoke: SearchPagesV2.java and SearchTitles.java were calling `doc.get("book_key")` for coverage aggregation, but `book_key` is indexed for scope filtering and **not stored**. Switched to deriving the book_key from the stored `id` field (`<book_id>-<page_id>`). Coverage now populates correctly.

## 2026-05-10 — v1.0 workflow benchmark

Ran `npm run benchmark`.

- **Mode 1** (single-fact): 3/5 calls. resolve → search_pages → get_page returned page 12 of book 9942 with 697-char body, printed page 17.
- **Mode 2** (research synthesis): 21/50 calls. list_categories → resolve → search_pages (scope.author_ids=[57]) → for each of 9 unique pages: get_page + get_citation. All 9 citations open with Arabic guillemet («) — valid Shamela format.

Result: **BENCHMARK PASS**.

## 2026-05-10 — Pack

Ran `npm run pack`.

- Output: `shamela-mcp-1.0.0.mcpb` at the repo root.
- Package size: 694.3 kB; unpacked: 1.9 MB; 17 files; sha1 = `61876552b68dc02b9302fdfb343f2190afc40402`.

## ⏳ Pending — Self-install test (5.5)

Awaiting user-side verification: install `shamela-mcp-1.0.0.mcpb` via Settings → Extensions in Claude Desktop, run a Mode 1 query in a fresh chat, append the result here. Tag `1.0.0` only after this passes.
