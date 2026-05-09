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

## v1.0 results

(pending Phase 2.5/2.6/3/4 implementation)
