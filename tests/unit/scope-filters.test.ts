/**
 * Two scope filters that keep a period claim and a school comparison honest.
 *
 * A period used to mean "composed in this window OR written by someone who died
 * in it". That union answers neither question cleanly: asking what was written
 * in the seventh century returned books composed in the sixth by an author who
 * died in the seventh. The union stays the default, but a caller who cares can
 * now say which fact they mean.
 *
 * The school filter exists so a comparison does not depend on remembering four
 * category numbers — and so it is visible in the request that four schools were
 * searched rather than one.
 */

import { describe, it, expect } from "vitest";

import {
    Catalog,
    CatalogScope,
    MADHHAB_CATEGORY,
    type AuthorRecord,
    type BookRecord,
    type CategoryRecord,
} from "../../src/server/catalog.js";

/**
 * A catalog stub with just enough shape for scope resolution. Books:
 *   1 composed 650, author died 700   (in range either way)
 *   2 composed 500, author died 690   (only the author's death is in range)
 *   3 composed 660, author died 900   (only the composition is in range)
 */
function makeCatalog(): Catalog {
    const books = new Map<number, BookRecord>();
    const authors = new Map<number, AuthorRecord>();
    const byAuthor = new Map<number, Set<number>>([
        [10, new Set([1])],
        [20, new Set([2])],
        [30, new Set([3])],
    ]);
    const byCategory = new Map<number, number[]>([
        [MADHHAB_CATEGORY.hanafi, [101]],
        [MADHHAB_CATEGORY.maliki, [102]],
        [MADHHAB_CATEGORY.shafii, [103]],
        [MADHHAB_CATEGORY.hanbali, [104]],
        [18, [105]], // general fiqh — deliberately outside the school map
    ]);

    const mk = (id: number, date: number | null, author: number): BookRecord =>
        ({ book_id: id, book_name: `كتاب ${id}`, book_date: date, main_author: author } as BookRecord);
    books.set(1, mk(1, 650, 10));
    books.set(2, mk(2, 500, 20));
    books.set(3, mk(3, 660, 30));
    for (const [id, death] of [
        [10, 700],
        [20, 690],
        [30, 900],
    ] as const) {
        authors.set(id, { author_id: id, author_name: `مؤلف ${id}`, death_year: death, death_text: null });
    }

    return {
        allBooks: () => books.values(),
        bookRecord: (id: number) => books.get(id),
        booksInCategory: (cid: number) => byCategory.get(cid) ?? [],
        booksByAuthors: (ids: number[]) => {
            const out = new Set<number>();
            for (const a of ids) for (const b of byAuthor.get(a) ?? []) out.add(b);
            return out;
        },
        downloadedBookIds: () => new Set<number>(),
        listCategories: (): CategoryRecord[] => [],
        authors,
    } as unknown as Catalog;
}

function resolve(scope: Record<string, unknown>): number[] {
    return new CatalogScope(makeCatalog()).resolveBookIds(scope as never).book_ids.sort((a, b) => a - b);
}

describe("period_basis", () => {
    it("defaults to the union, as before", () => {
        expect(resolve({ period_from: 600, period_to: 700 })).toEqual([1, 2, 3]);
    });

    it("'composed' takes the book's own year only", () => {
        // Book 2 was written in 500; its author merely died inside the window.
        expect(resolve({ period_from: 600, period_to: 700, period_basis: "composed" })).toEqual([1, 3]);
    });

    it("'died' takes the author's death year only", () => {
        // Book 3's author died in 900, well outside, though it was composed inside.
        expect(resolve({ period_from: 600, period_to: 700, period_basis: "died" })).toEqual([1, 2]);
    });

    it("reports which basis it used", () => {
        const r = new CatalogScope(makeCatalog()).resolveBookIds({
            period_from: 600,
            period_to: 700,
            period_basis: "composed",
        } as never);
        expect(r.diagnostics.some((d) => d.source.includes("by composed"))).toBe(true);
    });
});

describe("madhhab scope", () => {
    it("resolves one school to its own category", () => {
        expect(resolve({ madhhab: ["hanbali"] })).toEqual([104]);
    });

    it("unions the four schools for a comparison", () => {
        expect(resolve({ madhhab: ["hanafi", "maliki", "shafii", "hanbali"] })).toEqual([
            101, 102, 103, 104,
        ]);
    });

    it("does not quietly absorb general fiqh", () => {
        // Book 105 sits in the general-fiqh category; including it would let a
        // comparison attribute a general work to a specific school.
        expect(resolve({ madhhab: ["hanafi", "maliki", "shafii", "hanbali"] })).not.toContain(105);
    });

    it("names the schools in its diagnostics", () => {
        const r = new CatalogScope(makeCatalog()).resolveBookIds({ madhhab: ["maliki", "shafii"] } as never);
        expect(r.diagnostics.some((d) => d.source.includes("maliki,shafii"))).toBe(true);
    });
});
