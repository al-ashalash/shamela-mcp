/**
 * The order Shamela returns hits in, ported at last.
 *
 * Shamela wraps every query in a ConstantScoreQuery and ranks nothing by
 * relevance; the order the reader sees comes entirely from a sort over
 * numeric doc-values the index already ships (search-engine-spec §7.2:
 * `date, author, book_up, group, group_order, book, page` for pages and
 * titles). We never passed that sort, so Lucene broke every tie on ascending
 * document id — the order Shamela's importer happened to write the segments
 * in, which is no order at all.
 *
 * Measured before the fix: «الخيار المجلس» matches 2,703 pages distributed
 * 1,034 Shafiʿi / 678 Hanbali / 561 Hanafi / 227 Maliki / 75 usul, and all
 * thirty rows of the first page came from usul — 2.8% of the matches,
 * returned as if it were the answer. After: the same thirty span all five.
 *
 * These assertions are structural on purpose. A library other than this one
 * holds other books, but «earliest first, and never a later book before an
 * earlier one» is true of every library the engine can be pointed at.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { runSearchBooks, searchBooksInput } from "../../src/server/tools/searchBooks.js";
import { runSearchPages, searchPagesInput } from "../../src/server/tools/searchPages.js";
import { runSearchPhrase, searchPhraseInput } from "../../src/server/tools/searchPhrase.js";
import { runSearchQuran, searchQuranInput } from "../../src/server/tools/searchQuran.js";
import { runSearchTitles, searchTitlesInput } from "../../src/server/tools/searchTitles.js";
import { getBackend } from "../fixtures/shared.js";

let backend: Awaited<ReturnType<typeof getBackend>>;

beforeAll(async () => {
    backend = await getBackend();
}, 120_000);

/**
 * Composition years, oldest first — with the undated last.
 *
 * The catalogue scrubs Shamela's 99999 sentinel to null before anyone sees
 * it, but the index still sorts on the sentinel, so an undated book lands at
 * the end and must be read as "later than everything", not as year zero.
 */
const nonDecreasing = (years: Array<number | null>): boolean =>
    years.every((y, i) => i === 0 || (years[i - 1] ?? Number.MAX_SAFE_INTEGER) <= (y ?? Number.MAX_SAFE_INTEGER));

const pageSearch = (query: string, extra: Record<string, unknown> = {}) =>
    runSearchPages(
        backend.helper,
        backend.catalog,
        backend.pages,
        searchPagesInput.parse({ query, response_format: "json", ...extra }),
    ).then((r) => r.structuredContent);

describe("search results come back in Shamela's order", () => {
    it("answers a cross-school question from more than one school", async () => {
        const out = await pageSearch("الخيار المجلس", { limit: 30 });
        expect(out.total_hits).toBeGreaterThan(1000);
        const schools = new Set(out.results.map((r) => r.category));
        expect(schools.size).toBeGreaterThan(1);
    }, 120_000);

    it("orders pages by composition year, oldest first", async () => {
        const out = await pageSearch("الخيار المجلس", { limit: 30 });
        expect(out.returned).toBe(30);
        expect(nonDecreasing(out.results.map((r) => r.book_date))).toBe(true);
    }, 120_000);

    it("pages through without repeating a row", async () => {
        const first = await pageSearch("الخيار المجلس", { limit: 30 });
        const second = await pageSearch("الخيار المجلس", { limit: 30, offset: 30 });
        const seen = new Set(first.results.map((r) => `${r.book_id}-${r.page_id}`));
        for (const r of second.results) {
            expect(seen.has(`${r.book_id}-${r.page_id}`), `${r.book_id}-${r.page_id}`).toBe(false);
        }
        // The last key of the page sort is the page number inside its book, and
        // (book, page) is the document's primary key — so the order is total
        // and an offset window is a stable slice of it, not a resample.
        expect(nonDecreasing(second.results.map((r) => r.book_date))).toBe(true);
        expect(first.results[0]!.book_date ?? 0).toBeLessThanOrEqual(second.results[0]!.book_date ?? 0);
    }, 120_000);

    it("reads one book's hits in page order", async () => {
        const out = await pageSearch("الكلام", { limit: 20, scope: { book_ids: [9942] } });
        const ids = out.results.map((r) => r.page_id);
        expect(ids.length).toBeGreaterThan(1);
        expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    }, 120_000);

    it("gives the phrase search the same order — it shares the page path", async () => {
        const out = (
            await runSearchPhrase(
                backend.helper,
                backend.catalog,
                backend.pages,
                searchPhraseInput.parse({ query: "خيار المجلس", limit: 20, response_format: "json" }),
            )
        ).structuredContent;
        expect(out.returned).toBeGreaterThan(1);
        expect(nonDecreasing(out.results.map((r) => r.book_date))).toBe(true);
    }, 120_000);

    it("orders titles by composition year too", async () => {
        const out = (
            await runSearchTitles(
                backend.helper,
                backend.catalog,
                searchTitlesInput.parse({ query: "الطهارة", limit: 12, response_format: "json" }),
            )
        ).structuredContent;
        expect(out.returned).toBe(12);
        const years = out.results.map((r) => backend.catalog.bookRecord(r.book_id)?.book_date ?? null);
        expect(nonDecreasing(years)).toBe(true);
    }, 120_000);

    it("orders the catalogue search by composition year, undated last", async () => {
        const out = (
            await runSearchBooks(
                backend.helper,
                backend.catalog,
                searchBooksInput.parse({ query: "المغني", limit: 24, response_format: "json" }),
            )
        ).structuredContent;
        expect(out.returned).toBeGreaterThan(1);
        expect(nonDecreasing(out.results.map((r) => r.book_date))).toBe(true);
    }, 120_000);

    it("orders verses by verse number", async () => {
        const out = (
            await runSearchQuran(
                backend.helper,
                searchQuranInput.parse({ query: "الصبر", limit: 10, response_format: "json" }),
            )
        ).structuredContent;
        const ids = out.results.map((r) => r.aya_id);
        expect(ids.length).toBeGreaterThan(1);
        expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    }, 120_000);
});