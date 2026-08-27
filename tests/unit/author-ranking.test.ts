/**
 * The scholar you named, above the scholars who mention him.
 *
 * The fixture is the real answer the live index gave for «ابن قدامة» on
 * 15 Aug 2026 — 52 hits, in strictly ascending author_id order, with the man
 * himself sixth behind five bios that merely contain «بن» or cite his
 * المغني. The tool's own description tells the caller to take the id and pass
 * it as scope.author_ids, so trusting the first row scoped an entire search
 * to Ibn Taymiyyah while believing it was scoped to Ibn Qudamah.
 */

import { describe, it, expect } from "vitest";

import { nameTier, rankByName } from "../../src/server/tools/authorRanking.js";

/** Exactly what the engine returned, in the order it returned it. */
const IBN_QUDAMAH_HITS = [
    { author_id: 54, author_name: "ابن تيمية" },
    { author_id: 79, author_name: "ابن عبد الهادي" },
    { author_id: 159, author_name: "محمد خليل هراس" },
    { author_id: 160, author_name: "شهاب الدين العسكري" },
    { author_id: 164, author_name: "عبد الله بن عبد المحسن التركي" },
    { author_id: 474, author_name: "ابن قدامة" },
];
/** The engine's own folding of the query, as it came back on the wire. */
const TOKENS = ["بن", "قدامه"];

describe("rankByName", () => {
    it("puts Ibn Qudamah first for «ابن قدامة»", () => {
        const ranked = rankByName(IBN_QUDAMAH_HITS, "ابن قدامة", TOKENS);
        expect(ranked[0]!.author_id).toBe(474);
    });

    it("keeps the engine's order among the biography hits", () => {
        // Relevance inside the bios is not thrown away — only outranked.
        const ranked = rankByName(IBN_QUDAMAH_HITS, "ابن قدامة", TOKENS);
        expect(ranked.slice(1).map((h) => h.author_id)).toEqual([54, 79, 159, 160, 164]);
    });

    it("ranks an exact name above a longer name that contains it", () => {
        const ranked = rankByName(
            [
                { author_id: 1, author_name: "ابن قدامة المقدسي" },
                { author_id: 2, author_name: "ابن قدامة" },
            ],
            "ابن قدامة",
            TOKENS,
        );
        expect(ranked.map((h) => h.author_id)).toEqual([2, 1]);
    });

    it("matches across the ة / ه spelling the index folds", () => {
        // The engine hands back «قدامه»; the catalogue name is «قدامة».
        expect(nameTier("ابن قدامة", "ابن قدامة", TOKENS)).toBe(0);
        expect(nameTier("قدامة بن جعفر", "ابن قدامة", TOKENS)).toBeLessThan(9);
    });

    it("ranks a name carrying every token above one carrying some", () => {
        const all = nameTier("عبد الله بن قدامة", "ابن قدامة", TOKENS);
        const some = nameTier("ابن تيمية", "ابن قدامة", TOKENS);
        expect(all).toBeLessThan(some);
    });

    it("sends a name matching nothing to the bottom", () => {
        expect(nameTier("محمد خليل هراس", "ابن قدامة", TOKENS)).toBe(9);
    });

    it("is stable when no name matches at all", () => {
        // A pure biography search must come back exactly as the engine ranked
        // it — reordering equal things is noise, not relevance.
        const bios = [
            { author_id: 3, author_name: "فلان" },
            { author_id: 1, author_name: "علان" },
            { author_id: 2, author_name: "ترتان" },
        ];
        expect(rankByName(bios, "الاستصناع", ["الاستصناع"]).map((h) => h.author_id)).toEqual([3, 1, 2]);
    });

    it("survives an author whose name the catalogue does not have", () => {
        const ranked = rankByName(
            [
                { author_id: 1, author_name: "" },
                { author_id: 474, author_name: "ابن قدامة" },
            ],
            "ابن قدامة",
            TOKENS,
        );
        expect(ranked[0]!.author_id).toBe(474);
    });

    it("does nothing rash on an empty query or no tokens", () => {
        const ranked = rankByName(IBN_QUDAMAH_HITS, "", []);
        expect(ranked.map((h) => h.author_id)).toEqual([54, 79, 159, 160, 164, 474]);
    });
});
