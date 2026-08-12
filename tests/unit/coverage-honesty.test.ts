/**
 * Issue #16 — a coverage rollup that says how much of the search it covers.
 *
 * The distribution was once counted from the page of results being returned
 * while presenting itself as the shape of the whole search. The engine now
 * counts every match and reports on what basis; the integration suite holds
 * that half. This is the half that lives in TypeScript, and the half that was
 * left half-done: the two numbers that make the basis actionable — how many
 * hits were counted, and whether counting stopped at a ceiling — arrived on the
 * wire, were read into the raw shape, and were then dropped on the floor.
 *
 * A basis of "window" says the numbers are a sample. It does not say a sample
 * of what, out of how much. These two do.
 */
import { describe, it, expect } from "vitest";

import type { Catalog } from "../../src/server/catalog.js";
import { enrichCoverage } from "../../src/server/tools/searchPages.js";

/**
 * Just enough catalogue to place a book in a category and a century.
 *
 * Book 1 is a third-century work, book 2 a seventh-century one, and book 9 is
 * deliberately absent so the rollup has something it cannot place.
 */
function makeCatalog(): Catalog {
    const books: Record<number, { book_id: number; book_name: string; book_category: number; book_date: number; authors: string }> = {
        1: { book_id: 1, book_name: "كتاب الأول", book_category: 1, book_date: 250, authors: "11" },
        2: { book_id: 2, book_name: "كتاب الثاني", book_category: 2, book_date: 650, authors: "22" },
    };
    return {
        bookRecord: (id: number) => books[id],
        categoryPath: (cat: number) => [cat === 1 ? "العقيدة" : "الفقه"],
        mainAuthorName: (rec: { authors: string }) => (rec.authors === "11" ? "المؤلف الأول" : "المؤلف الثاني"),
    } as unknown as Catalog;
}

describe("coverage says how much of the search it speaks for", () => {
    it("carries the counted total and the cap flag through, not only the basis", () => {
        const out = enrichCoverage(
            { by_book_key: { "1": 3, "2": 7 }, total_seen: 10, at_cap: false, basis: "all_results" },
            makeCatalog(),
        );
        expect(out.basis).toBe("all_results");
        // The pair the issue asked for. Both used to be parsed and discarded.
        expect(out.total_counted).toBe(10);
        expect(out.capped).toBe(false);
    });

    it("reports a count that stopped at the ceiling as capped", () => {
        // What the engine sends when the full pass could not finish: the basis
        // drops to "window" and the flag says the buckets are floors.
        const out = enrichCoverage(
            { by_book_key: { "1": 5000 }, total_seen: 5000, at_cap: true, basis: "window" },
            makeCatalog(),
        );
        expect(out.basis).toBe("window");
        expect(out.total_counted).toBe(5000);
        expect(out.capped).toBe(true);
    });

    it("keeps the counted total distinct from what the buckets could place", () => {
        // Book 9 is not in the catalogue, so its hits cannot be filed under a
        // category or a century. total_counted still reports every hit the
        // engine folded in — which is the whole point of reporting it: the gap
        // between it and the buckets is visible instead of silently absorbed.
        const out = enrichCoverage(
            { by_book_key: { "1": 4, "9": 6 }, total_seen: 10, at_cap: false, basis: "all_results" },
            makeCatalog(),
        );
        expect(out.total_counted).toBe(10);
        const placedInCategories = Object.values(out.by_category).reduce((a, b) => a + b, 0);
        expect(placedInCategories).toBe(4);
        expect(out.by_book["9"]).toBeUndefined();
    });

    it("treats a missing basis as a full count, the way the engine's older envelopes read", () => {
        const out = enrichCoverage(
            { by_book_key: { "2": 2 }, total_seen: 2, at_cap: false },
            makeCatalog(),
        );
        expect(out.basis).toBe("all_results");
        expect(out.total_counted).toBe(2);
    });
});
