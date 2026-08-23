/**
 * Whose words are these, and how much was looked at.
 *
 * Two peer lessons, on the real library:
 *
 *  - Dalail marks each passage primary or secondary. A scholar's own book and
 *    a later report of him are not the same evidence — a report may be
 *    paraphrase, summary, or a school's later reading — and the difference is
 *    invisible in a snippet. Computed here from the book/author ids the
 *    catalogue already holds: no outside table, no inference.
 *  - Qaf publishes how much was searched, not only what was found. Ours is an
 *    exact local fact (the books this query could reach, out of everything
 *    downloaded), where theirs is an estimate about the world.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { runSearchPages, searchPagesInput } from "../../src/server/tools/searchPages.js";
import { getBackend } from "../fixtures/shared.js";

let backend: Awaited<ReturnType<typeof getBackend>>;

beforeAll(async () => {
    backend = await getBackend();
}, 120_000);

const search = (extra: Record<string, unknown> = {}) =>
    runSearchPages(
        backend.helper,
        backend.catalog,
        backend.pages,
        searchPagesInput.parse({ query: "الكلام", limit: 20, response_format: "json", ...extra }),
    ).then((r) => r.structuredContent);

describe("the answer says how much was searched", () => {
    it("reports the downloaded shelf as the denominator when unscoped", async () => {
        const out = await search();
        expect(out.searched.scoped).toBe(false);
        expect(out.searched.downloaded_total).toBeGreaterThan(0);
        // Unscoped: the search reaches everything downloaded, so the two agree.
        expect(out.searched.books).toBe(out.searched.downloaded_total);
    }, 120_000);

    it("reports the scope's own size when one was given, below the ceiling", async () => {
        const all = await search();
        const one = await search({ scope: { book_ids: [9942] } });
        expect(one.searched.scoped).toBe(true);
        expect(one.searched.books).toBe(1);
        expect(one.searched.books).toBeLessThan(all.searched.downloaded_total);
        // The ceiling is a property of the machine, not of the query.
        expect(one.searched.downloaded_total).toBe(all.searched.downloaded_total);
    }, 120_000);

    it("says it in the rendered text, not only in the payload", async () => {
        const r = await runSearchPages(
            backend.helper,
            backend.catalog,
            backend.pages,
            searchPagesInput.parse({ query: "الكلام", limit: 3 }),
        );
        expect(r.content[0]!.text).toMatch(/بُحث في|Searched/);
    }, 120_000);
});

describe("a hit says whether it is the scholar's own book", () => {
    /** العثيمين — author of the anchor fixture book 9942. */
    const IBN_UTHAYMEEN = 57;

    it("marks nothing when no attribution was asked about", async () => {
        const out = await search({ scope: { book_ids: [9942] } });
        expect(out.results.length).toBeGreaterThan(0);
        for (const r of out.results) expect(r.provenance).toBeUndefined();
    }, 120_000);

    it("marks the scholar's own book primary", async () => {
        const out = await search({ scope: { book_ids: [9942] }, attributed_to: IBN_UTHAYMEEN });
        expect(out.results.length).toBeGreaterThan(0);
        for (const r of out.results) expect(r.provenance, r.book_name).toBe("primary");
    }, 120_000);

    it("marks another author's book a report of him", async () => {
        // Any hit outside his own works is someone else's book.
        const out = await search({ attributed_to: IBN_UTHAYMEEN, limit: 20 });
        const others = out.results.filter((r) => r.provenance === "report");
        expect(others.length).toBeGreaterThan(0);
        for (const r of others) {
            expect(r.author_name, r.book_name).not.toBe("محمد بن صالح العثيمين");
        }
    }, 120_000);

    it("shows the mark in the rendered text", async () => {
        const r = await runSearchPages(
            backend.helper,
            backend.catalog,
            backend.pages,
            searchPagesInput.parse({
                query: "الكلام",
                scope: { book_ids: [9942] },
                attributed_to: IBN_UTHAYMEEN,
                limit: 2,
            }),
        );
        expect(r.content[0]!.text).toContain("من كتب صاحب القول");
    }, 120_000);
});
