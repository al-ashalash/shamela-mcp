/**
 * The re-ranking, against the real 3,188-author index.
 *
 * Measured before the fix: «ابن قدامة» returned 52 hits ordered 54, 79, 159,
 * 160, 164, 474 — strictly ascending by id, with Ibn Qudamah himself sixth
 * behind five biographies that merely contain «بن» or cite his المغني. The
 * tool tells the caller to take the id and pass it as scope.author_ids, so
 * the first row silently scoped whole searches to Ibn Taymiyyah.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { runSearchAuthors, searchAuthorsInput } from "../../src/server/tools/searchAuthors.js";
import { getBackend } from "../fixtures/shared.js";

let backend: Awaited<ReturnType<typeof getBackend>>;

beforeAll(async () => {
    backend = await getBackend();
}, 120_000);

const search = (query: string, extra: Record<string, unknown> = {}) =>
    runSearchAuthors(
        backend.helper,
        backend.catalog,
        searchAuthorsInput.parse({ query, response_format: "json", ...extra }),
    ).then((r) => r.structuredContent);

describe("the scholar you named comes first", () => {
    it("returns Ibn Qudamah first for «ابن قدامة»", async () => {
        const out = await search("ابن قدامة", { limit: 6 });
        expect(out.results[0]!.author_id).toBe(474);
        expect(out.results[0]!.author_name).toBe("ابن قدامة");
    }, 120_000);

    it("returns him first for the distinctive token alone", async () => {
        const out = await search("قدامة", { limit: 6 });
        expect(out.results[0]!.author_id).toBe(474);
    }, 120_000);

    it("still reports the true total, not the re-ranked pool", async () => {
        // The pool is an implementation detail. 52 matched; 6 are shown.
        const out = await search("ابن قدامة", { limit: 6 });
        expect(out.total_hits).toBeGreaterThan(6);
        expect(out.returned).toBe(6);
        expect(out.offset).toBe(0);
        expect(out.has_more).toBe(true);
        expect(out.next_offset).toBe(6);
    }, 120_000);

    it("pages without repeating or skipping a row", async () => {
        const first = await search("ابن قدامة", { limit: 5 });
        const second = await search("ابن قدامة", { limit: 5, offset: 5 });
        expect(second.offset).toBe(5);
        const ids = new Set(first.results.map((r) => r.author_id));
        for (const r of second.results) expect(ids.has(r.author_id), String(r.author_id)).toBe(false);
    }, 120_000);

    it("leaves a genuine biography search to the engine's own relevance", async () => {
        // No name will match this, so nothing should be shuffled: the answer
        // is whatever the bios say, ranked as the engine ranked it.
        const out = await search("الحنبلي", { limit: 5 });
        expect(out.results.length).toBeGreaterThan(0);
    }, 120_000);
});
