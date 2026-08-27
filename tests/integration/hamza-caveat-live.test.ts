/**
 * The contaminated count, named on the real index.
 *
 * «بريء» and «بريّ» are one term in Shamela's index («بري»), so a search for
 * the first returns pages carrying only the second — measured: book 9879
 * page 44, «الهِنْدباء: نبات بري معمّر», a page where «بريء» does not occur.
 * The fold is Shamela's and stays (docs/decisions.md §4); what must not stay
 * is a total presented as exact while it counts two words.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { runSearchPages, searchPagesInput } from "../../src/server/tools/searchPages.js";
import { getBackend } from "../fixtures/shared.js";

let backend: Awaited<ReturnType<typeof getBackend>>;

beforeAll(async () => {
    backend = await getBackend();
}, 120_000);

const search = (query: string, format: "json" | "markdown" = "json") =>
    runSearchPages(
        backend.helper,
        backend.catalog,
        backend.pages,
        searchPagesInput.parse({ query, limit: 3, response_format: format }),
    );

describe("a count that covers two words says so", () => {
    it("qualifies «بريء», naming the word and the way out", async () => {
        const r = await search("بريء");
        const caveats = r.structuredContent.caveats ?? [];
        expect(caveats).toHaveLength(1);
        expect(caveats[0]).toContain("بريء");
        expect(caveats[0]).toContain("shamela_search_exact");
        // The count is still reported — the caveat qualifies it, it does not
        // withhold it.
        expect(r.structuredContent.total_hits).toBeGreaterThan(0);
    }, 120_000);

    it("puts the caveat under the count, not after the results", async () => {
        const r = await search("بريء", "markdown");
        const md = r.content[0]!.text;
        const caveatAt = md.indexOf("يُذيب الهمزة");
        const firstResultAt = md.indexOf("## ");
        expect(caveatAt).toBeGreaterThan(-1);
        if (firstResultAt > -1) expect(caveatAt).toBeLessThan(firstResultAt);
    }, 120_000);

    it("says nothing on a query whose hamza the index keeps", async () => {
        // «العلماء» and «جزء» keep their hamza in the live index — 15,205 terms
        // carry a standalone ء — so nothing is merged and no caveat is due.
        for (const q of ["العلماء", "جزء"]) {
            const r = await search(q);
            expect(r.structuredContent.caveats, q).toBeUndefined();
        }
    }, 120_000);

    it("is a qualification, not a refusal: the search still runs", async () => {
        // The words really do share a term, so the hits are real hits — they
        // are simply not all about the word that was asked for.
        const r = await search("بريء");
        expect(r.structuredContent.results.length).toBeGreaterThan(0);
    }, 120_000);
});
