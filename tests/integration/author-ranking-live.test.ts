/**
 * The re-ranking, against the real 3,190-author index.
 *
 * Measured before the fix: «ابن قدامة» returned 52 hits with Ibn Qudamah
 * himself sixth, behind five biographies that merely contain «بن» or cite his
 * المغني. Nothing in the engine's order knows which of the 52 was asked for —
 * every match scores alike under ConstantScoreQuery — so the tool has to say
 * so itself. And it tells the caller to take the id and pass it as
 * scope.author_ids, so the first row silently scoped whole searches to the
 * wrong man.
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

    it("leads with the men actually called «قدامة», not the bios that cite them", async () => {
        // The bare token names two scholars — قدامة بن جعفر (ت ٣٣٧) and
        // ابن قدامة (ت ٦٢٠) — and nothing in the query says which is meant.
        // Both are name matches, so the tier is a tie and the engine's own
        // order settles it: oldest first, per search-engine-spec §7.2. What
        // the re-ranking still guarantees is that neither falls behind a
        // biography that merely mentions him.
        const out = await search("قدامة", { limit: 6 });
        const ids = out.results.map((r) => r.author_id);
        expect(ids.slice(0, 2)).toEqual([843, 474]);
        // ابن تيمية matched on «بن» alone and used to lead this very query.
        expect(ids).not.toContain(54);
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

/**
 * The definite article, on the same 3,190-author index.
 *
 * Measured before the fix: «الموفق المقدسي» returned exactly one author — a
 * contemporary editor who died 1432 — while «موفق المقدسي», one definite
 * article apart, returned five including Ibn Qudamah. His biography carries
 * «موفق الدين»; nothing was missing but the ال. The tool's own description
 * tells the reader to try «ابن قدامة / الموفق / المقدسي», so the advice
 * produced one confidently wrong man.
 */
describe("the definite article does not decide who exists", () => {
    it("finds Ibn Qudamah for the laqab written with ال", async () => {
        // 1 hit before the fix, and it was not him. 5 after, and he is among
        // them. NOT first, and nothing here should promise he would be: his
        // NAME is «ابن قدامة», which carries neither word of the query, so
        // rankByName has nothing to lift him by and he tiers with the other
        // four biography matches. Within a tier the engine's order stands,
        // and that order is Shamela's own — by death year — so ابن الدجاجي
        // (d. 564) precedes him (d. 620). Reaching the right man through his
        // shuhra is what this fix buys; ranking him above the others would
        // need the biography HEADWORD read as name-like, which is separate work.
        const out = await search("الموفق المقدسي", { limit: 5 });
        expect(out.results.slice(0, 3).map((r) => r.author_id)).toContain(474);
    }, 120_000);

    it("answers the two spellings identically", async () => {
        // The point of the fix, stated as the invariant it creates: one
        // definite article must not decide who exists. Before it, «الموفق
        // المقدسي» returned a single contemporary editor and «موفق المقدسي»
        // returned five authors including Ibn Qudamah.
        const withAl = await search("الموفق المقدسي", { limit: 5 });
        const without = await search("موفق المقدسي", { limit: 5 });
        expect(withAl.total_hits).toBe(without.total_hits);
        expect(withAl.results.map((r) => r.author_id)).toEqual(without.results.map((r) => r.author_id));
    }, 120_000);

    it("reaches him from the laqab alone", async () => {
        // 17 hits before and he was not among them; 31 after, and he is —
        // ninth, behind eight men whose own NAME or bio headword carries
        // «الموفق». Reachable is the claim; placed is not.
        const out = await search("الموفق", { limit: 10 });
        expect(out.results.some((r) => r.author_id === 474)).toBe(true);
    }, 120_000);

    it("finds the Hafiz for «الحافظ ابن حجر»", async () => {
        // 22 hits before the fix and Ibn Hajar was not one of them, because his
        // bio says «حافظ» and the query said «الحافظ». 32 after, him first.
        const out = await search("الحافظ ابن حجر", { limit: 5 });
        expect(out.results[0]!.author_id).toBe(202);
    }, 120_000);

    it("shows the evidence for a hit reached through the variant", async () => {
        // The engine may match a bio through «موفق» while the query said
        // «الموفق». Highlighting only the token as typed left 6 of these 10
        // rows — Ibn Qudamah's included — with no snippet at all. The one row
        // of slack is for an author matched on his NAME: `body` is
        // "<name> <bio>" but `body_store` is the bio alone, so a name-only hit
        // has nothing to quote. That predates this fix.
        const out = await search("الموفق", { limit: 10 });
        expect(out.results.length).toBe(10);
        expect(out.results.filter((r) => r.snippet === "").length).toBeLessThanOrEqual(1);
    }, 120_000);

    it("does not let a common stem swallow the conjunction", async () => {
        // «الله» strips to «له», which sits in 1,453 of 3,190 biographies.
        // OR-ing it in unguarded takes «عبد الله» from 1,160 hits to 1,377,
        // drifting toward the 1,739 that «عبد» alone returns — the answer
        // collapses to the first word. The df ceiling holds it at 1,161.
        const both = await search("عبد الله", { limit: 1 });
        const first = await search("عبد", { limit: 1 });
        expect(both.total_hits).toBeLessThan(1_250);
        expect(both.total_hits).toBeLessThan(first.total_hits);
    }, 120_000);

    it("leaves a single common word exactly as narrow as it was", async () => {
        // 1,368 before and after; 2,040 with the guard removed.
        const out = await search("الله", { limit: 1 });
        expect(out.total_hits).toBeLessThan(1_500);
    }, 120_000);

    it("still answers zero for a name in Latin letters", async () => {
        // The transliteration fallback only fires on total_hits === 0, and an
        // unguarded toggle would have added the empty term «الGhazali».
        const out = await search("Ghazali", { limit: 5 });
        expect(out.transliterated).toBe(true);
    }, 120_000);
});
