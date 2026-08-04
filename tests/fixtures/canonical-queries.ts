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

/**
 * Hamza-bearing queries, same fixture book. Until the normalizer matched
 * Shamela's own table, every one of these returned a silent zero on the default
 * search path — the canonical query above («الكلام») has no hamza, which is why
 * the gap survived from 1.0.0. Counts are small and book-scoped, so they are
 * stable regardless of how many books the developer has downloaded.
 */
export const HAMZA_QUERIES_BOOK_9942 = [
    { query: "فائدة", expectedHits: 3, note: "ئ → ي" },
    { query: "جائز", expectedHits: 3, note: "ئ → ي" },
    { query: "الفائدة", expectedHits: 2, note: "ئ → ي with the article" },
    { query: "الفرائض", expectedHits: 1, note: "the reported query in the field report" },
    { query: "مسائل", expectedHits: 1, note: "ئ → ي" },
    { query: "الوسائل", expectedHits: 1, note: "ئ → ي" },
    { query: "العقائد", expectedHits: 1, note: "ئ → ي" },
    { query: "شيء", expectedHits: 16, note: "يء → ئ → ي; zero before the fix" },
    { query: "مائة", expectedHits: 5, note: "ة → ه then مائه → مئه → ميه" },
    { query: "إسحاق", expectedHits: 1, note: "اسحاق → اسحق" },
    { query: "الرحمان", expectedHits: 3, note: "رحمان → رحمن" },
    // Guards: a standalone ء must survive. The index holds terms containing it,
    // so folding it away would zero all of these.
    { query: "الوضوء", expectedHits: 8, note: "guard: standalone ء kept" },
    { query: "العلماء", expectedHits: 7, note: "guard: standalone ء kept" },
    { query: "القضاء", expectedHits: 3, note: "guard: standalone ء kept" },
    { query: "الدعاء", expectedHits: 2, note: "guard: standalone ء kept" },
    { query: "الفقهاء", expectedHits: 1, note: "guard: standalone ء kept" },
    { query: "الأنبياء", expectedHits: 1, note: "guard: standalone ء kept" },
] as const;

/**
 * Raw surface forms whose normalized shape must exist in the live index. Each
 * one exercises a different rewrite rule; a zero here means the rule is wrong
 * and is inventing a term Shamela never indexed. Library-wide, so the assertion
 * is "greater than zero", never an exact count.
 */
export const NORMALIZATION_RULE_PROBES = [
    { query: "قراءات", rule: "ءا → ء" },
    { query: "شيء", rule: "يء → ئ" },
    { query: "مسائل", rule: "ئ → ي" },
    { query: "مسئول", rule: "ئو → وو" },
    { query: "إسماعيل", rule: "سماعيل → سمعيل" },
    { query: "سماوات", rule: "سماوات → سموات" },
    { query: "أولائك", rule: "اولائك → اولئك" },
    { query: "براهام", rule: "براهام → براهيم" },
    { query: "الرحمان", rule: "رحمان → رحمن" },
    { query: "إسحاق", rule: "اسحاق → اسحق" },
    { query: "هاذين", rule: "هاذين → هذين" },
    { query: "هاذا", rule: "هاذا → هذا" },
    { query: "دمائه", rule: "مائه → مئه (mid-word)" },
    { query: "داوود", rule: "داوود → داود" },
    { query: "طاووس", rule: "طاووس → طاوس" },
    { query: "الإسفراييني", rule: "سفرايين → سفراين" },
] as const;

export const CATALOG_QUERIES_MIN = [
    { tool: "search_books", query: "علم", minHits: 1 },
    { tool: "search_authors", query: "ابن", minHits: 1 },
] as const;
