/**
 * Canonical search queries with expected hit counts on the smoke fixture.
 * Counts are anchored to book 9942 (الأصول من علم الأصول، ابن عثيمين) — the
 * single test book the smoke suite assumes is downloaded.
 *
 * Cross-test reuse: imported by tests/integration/helper.test.ts and any
 * future suite that needs a known-good ground truth.
 */

export const PAGE_QUERIES_BOOK_9942 = [
    { query: "المنطق", expectedHits: 0, note: "no occurrences in book 9942" },
    { query: "الكلام", expectedHits: 9, note: "8 in body + 1 in foot" },
    { query: "الكلام لغة", expectedHits: 3, note: "3 hits after ta-marbuta normalization" },
] as const;

export const CATALOG_QUERIES_MIN = [
    { tool: "search_books", query: "علم", minHits: 1 },
    { tool: "search_authors", query: "ابن", minHits: 1 },
] as const;
