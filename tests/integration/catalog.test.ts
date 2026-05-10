import { describe, it, expect, beforeAll } from "vitest";

import type { Catalog } from "../../src/server/catalog.js";
import { CatalogScope } from "../../src/server/catalog.js";
import {
    FIXTURE_BOOK_ID,
    FIXTURE_BOOK_NAME,
    getCatalog,
} from "../fixtures/shared.js";

describe("Catalog (real master.db)", () => {
    let catalog: Catalog;

    beforeAll(async () => {
        catalog = await getCatalog();
    });

    it("loads non-zero counts of books, authors, and categories", () => {
        expect(catalog.bookCount()).toBeGreaterThan(0);
        expect(catalog.authorCount()).toBeGreaterThan(0);
        expect(catalog.categoryCount()).toBeGreaterThan(0);
    });

    it("returns the canonical fixture book by id", () => {
        const book = catalog.bookRecord(FIXTURE_BOOK_ID);
        expect(book).toBeDefined();
        expect(book!.book_name).toBe(FIXTURE_BOOK_NAME);
    });

    it("returns undefined for a non-existent book", () => {
        expect(catalog.bookRecord(999_999_999)).toBeUndefined();
    });

    it("reports the fixture book as downloaded", () => {
        expect(catalog.isDownloaded(FIXTURE_BOOK_ID)).toBe(true);
    });

    it("downloadedBookIds() includes the fixture book", () => {
        const downloaded = catalog.downloadedBookIds();
        expect(downloaded.has(FIXTURE_BOOK_ID)).toBe(true);
    });

    it("mainAuthorName resolves the fixture book to its author", () => {
        const book = catalog.bookRecord(FIXTURE_BOOK_ID)!;
        const name = catalog.mainAuthorName(book);
        expect(name).toBeTruthy();
        // The fixture book's author is Ibn Uthaymeen — name contains صالح or عثيمين.
        expect(name!).toMatch(/عثيمين|صالح/);
    });

    it("listCategories returns at least one category", () => {
        const cats = catalog.listCategories();
        expect(cats.length).toBeGreaterThan(0);
    });
});

describe("CatalogScope.resolveBookIds", () => {
    let catalog: Catalog;
    let scope: CatalogScope;

    beforeAll(async () => {
        catalog = await getCatalog();
        scope = new CatalogScope(catalog);
    });

    it("returns ALL books when scope is undefined", () => {
        const result = scope.resolveBookIds(undefined);
        expect(result.book_ids.length).toBe(catalog.bookCount());
        expect(result.diagnostics).toEqual([]);
    });

    it("returns ALL books when scope is empty", () => {
        const result = scope.resolveBookIds({});
        expect(result.book_ids.length).toBe(catalog.bookCount());
    });

    it("respects book_ids filter", () => {
        const result = scope.resolveBookIds({ book_ids: [FIXTURE_BOOK_ID] });
        expect(result.book_ids).toEqual([FIXTURE_BOOK_ID]);
        expect(result.diagnostics.some((d) => d.source === "book_ids")).toBe(true);
    });

    it("respects author_ids filter and includes the fixture book", () => {
        const book = catalog.bookRecord(FIXTURE_BOOK_ID)!;
        const result = scope.resolveBookIds({ author_ids: [book.main_author!] });
        expect(result.book_ids).toContain(FIXTURE_BOOK_ID);
    });

    it("respects downloaded_only filter", () => {
        const result = scope.resolveBookIds({ downloaded_only: true });
        expect(result.book_ids).toContain(FIXTURE_BOOK_ID);
        // Should be at least as small as the full catalog.
        expect(result.book_ids.length).toBeLessThanOrEqual(catalog.bookCount());
    });

    it("intersects book_ids ∩ author_ids correctly", () => {
        const book = catalog.bookRecord(FIXTURE_BOOK_ID)!;
        const result = scope.resolveBookIds({
            book_ids: [FIXTURE_BOOK_ID],
            author_ids: [book.main_author!],
        });
        expect(result.book_ids).toEqual([FIXTURE_BOOK_ID]);
    });

    it("returns empty when book_ids ∩ author_ids has no overlap", () => {
        // Pick an author who definitely doesn't have FIXTURE_BOOK_ID.
        const result = scope.resolveBookIds({
            book_ids: [FIXTURE_BOOK_ID],
            author_ids: [99_999_999],
        });
        expect(result.book_ids).toEqual([]);
    });

    it("returns empty when period range matches no books", () => {
        const result = scope.resolveBookIds({
            book_ids: [FIXTURE_BOOK_ID],
            period_from: 9000,
            period_to: 9999,
        });
        expect(result.book_ids).toEqual([]);
    });
});
