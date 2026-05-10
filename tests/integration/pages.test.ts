import { describe, it, expect, beforeAll } from "vitest";

import type { PageStore } from "../../src/server/pages.js";
import { FIXTURE_BOOK_ID, getPageStore } from "../fixtures/shared.js";

describe("PageStore (real per-book SQLite)", () => {
    let pages: PageStore;

    beforeAll(async () => {
        pages = await getPageStore();
    });

    it("hasBook returns true for the fixture book", async () => {
        expect(await pages.hasBook(FIXTURE_BOOK_ID)).toBe(true);
    });

    it("hasBook returns false for a non-downloaded book id", async () => {
        expect(await pages.hasBook(999_999_999)).toBe(false);
    });

    it("getPageRow(9942, 17) returns the page row with the printed page label", async () => {
        const row = await pages.getPageRow(FIXTURE_BOOK_ID, 17);
        expect(row).not.toBeNull();
        expect(row!.page_id).toBe(17);
        // Book 9942 is single-volume (part is null throughout per smoke test).
        expect(row!.part).toBeNull();
    });

    it("getPageRow returns null for a missing page", async () => {
        const row = await pages.getPageRow(FIXTURE_BOOK_ID, 999_999);
        expect(row).toBeNull();
    });

    it("printedPage returns a non-null string for the fixture page", async () => {
        const printed = await pages.printedPage(FIXTURE_BOOK_ID, 17);
        expect(printed).not.toBeNull();
        expect(typeof printed).toBe("string");
    });

    it("getToc(depth=1) returns the documented 23 top-level chapters of the fixture book", async () => {
        const toc = await pages.getToc(FIXTURE_BOOK_ID, 0, 1);
        expect(toc.length).toBe(23);
        for (const entry of toc) {
            expect(entry.title_id).toBeGreaterThan(0);
            expect(entry.parent_id).toBe(0);
        }
    });

    it("getToc clamps depth to [1..5]", async () => {
        // depth=10 should be clamped to 5 — calling with a too-high value shouldn't throw.
        const toc = await pages.getToc(FIXTURE_BOOK_ID, 0, 10);
        expect(toc.length).toBeGreaterThan(0);
    });

    it("pageCount returns a positive number for the fixture book", async () => {
        const count = await pages.pageCount(FIXTURE_BOOK_ID);
        expect(count).toBeGreaterThan(0);
    });

    it("getPagesRange returns the requested number of consecutive pages", async () => {
        const range = await pages.getPagesRange(FIXTURE_BOOK_ID, 1, 5);
        expect(range.length).toBe(5);
        // page_ids should be strictly increasing.
        for (let i = 1; i < range.length; i++) {
            expect(range[i]!.page_id).toBeGreaterThan(range[i - 1]!.page_id);
        }
    });

    it("getAncestorChain returns at least one ancestor for an interior page", async () => {
        const chain = await pages.getAncestorChain(FIXTURE_BOOK_ID, 17);
        expect(chain.length).toBeGreaterThanOrEqual(1);
    });

    it("getBookParts returns an empty parts list for the single-volume fixture book", async () => {
        const parts = await pages.getBookParts(FIXTURE_BOOK_ID);
        expect(parts).toEqual([]);
    });

    it("getPageServices returns null/has-no-services for the fixture page (no services in book 9942)", async () => {
        const svc = await pages.getPageServices(FIXTURE_BOOK_ID, 17);
        // Per smoke test: book 9942 has 0 services on every page; call may return null
        // or an "empty" object. Both are acceptable.
        if (svc !== null) {
            expect(svc.ayat?.length ?? 0).toBe(0);
            expect(svc.hadeeth?.length ?? 0).toBe(0);
        }
    });

    it("returns gracefully (null/empty) for a non-downloaded book", async () => {
        expect(await pages.getPageRow(999_999_999, 1)).toBeNull();
        expect(await pages.printedPage(999_999_999, 1)).toBeNull();
        expect(await pages.getToc(999_999_999, 0, 1)).toEqual([]);
        expect(await pages.getPagesRange(999_999_999, 1, 5)).toEqual([]);
    });
});
