/**
 * The last two stage-A minors, on the real index.
 *
 * search_quran's first zero-result suggestion used to tell the reader to
 * retry a form the same call had already searched (the engine expands prefix
 * variants), which provably returns the identical zero. And
 * get_tafseer_of_aya's counts contradicted each other: `returned` counted
 * index rows while `total` counted distinct books, so 13 sat above 5 in one
 * response, with duplicate rows repeated verbatim.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { runSearchQuran, searchQuranInput } from "../../src/server/tools/searchQuran.js";
import { runGetTafseerOfAya, getTafseerOfAyaInput } from "../../src/server/tools/getTafseerOfAya.js";
import { normalizeArabicAya } from "../../src/server/arabic.js";
import { getBackend } from "../fixtures/shared.js";

let backend: Awaited<ReturnType<typeof getBackend>>;

beforeAll(async () => {
    backend = await getBackend();
}, 120_000);

describe("quran zero-result advice is followable", () => {
    it("never suggests retrying a form this call already searched", async () => {
        const r = await runSearchQuran(
            backend.helper,
            searchQuranInput.parse({ query: "الحاسوب", response_format: "json" }),
        );
        const out = r.structuredContent;
        expect(out.total_hits).toBe(0);
        const searched = new Set(out.normalized_tokens.map((t) => normalizeArabicAya(t)));
        for (const s of out.suggestions ?? []) {
            // Any quoted «form» offered as a retry must not be one of the
            // forms the engine already searched in this very call.
            for (const m of s.matchAll(/«([^»]+)»/g)) {
                expect(searched.has(normalizeArabicAya(m[1]!)), `${s}`).toBe(false);
            }
        }
    }, 120_000);

    it("lists the normalized forms without silent truncation", async () => {
        const r = await runSearchQuran(
            backend.helper,
            searchQuranInput.parse({ query: "الحاسوب", response_format: "json" }),
        );
        const out = r.structuredContent;
        const listing = (out.suggestions ?? []).find((s) => /التطبيع|normali[sz]/i.test(s));
        if (listing && out.normalized_tokens.length) {
            for (const tok of out.normalized_tokens) expect(listing).toContain(tok);
        }
    }, 120_000);
});

describe("tafseer coverage counts agree with themselves", () => {
    it("groups by book: returned <= total, no duplicate books, pages gathered", async () => {
        const r = await runGetTafseerOfAya(
            backend.catalog,
            backend.services,
            getTafseerOfAyaInput.parse({ surah: 2, aya: 255, response_format: "json" }),
        );
        const out = r.structuredContent;
        expect(out.returned).toBeLessThanOrEqual(out.total);
        const ids = out.results.map((b) => b.book_id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const b of out.results) {
            expect(b.page_ids.length).toBeGreaterThan(0);
            expect(new Set(b.page_ids).size).toBe(b.page_ids.length);
        }
        // the rows are still visible for whoever wants them
        expect(out.index_rows).toBeGreaterThanOrEqual(out.total);
    }, 120_000);
});
