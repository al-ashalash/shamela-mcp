/**
 * Rank 1 of a scored list has to be the best match.
 *
 * The engine's n-gram scores are constant within a query — every one of 20
 * hits for «صحيح البخاري» measured exactly 6.3099747 — so resolve's order
 * collapsed to ascending book_id. At the default limit of 5 the answer was
 * five shurūḥ and selections, and صحيح البخاري itself sat unseen at ranks 7
 * and 14. Whoever takes rank 1 on trust then scopes a whole search to the
 * wrong book.
 */

import { describe, it, expect } from "vitest";

import { nameRankTier } from "../../src/server/tools/resolve.js";

const Q = "صحيح البخاري";

describe("nameRankTier", () => {
    it("calls the bare title an exact match", () => {
        expect(nameRankTier(Q, "صحيح البخاري")).toBe(0);
    });

    it("calls an edition-suffixed title an exact match too", () => {
        // « - ط السلطانية» is Shamela's edition suffix, not part of the name.
        expect(nameRankTier(Q, "صحيح البخاري - ط السلطانية")).toBe(0);
        expect(nameRankTier(Q, "صحيح البخاري - ت البغا")).toBe(0);
    });

    it("ranks a title that merely contains the phrase below both", () => {
        const containing = nameRankTier(Q, "نجاح القاري شرح صحيح البخاري - كتاب الجنائز");
        expect(containing).toBe(2);
        expect(containing).toBeGreaterThan(nameRankTier(Q, "صحيح البخاري - ت البغا"));
    });

    it("ranks a prefix between exact and containing", () => {
        const prefix = nameRankTier(Q, "صحيح البخاري مع شرحه");
        expect(prefix).toBe(1);
        expect(prefix).toBeGreaterThan(0);
        expect(prefix).toBeLessThan(2);
    });

    it("puts co-occurring tokens last", () => {
        // «البخاري» and «صحيح» both present, the phrase absent.
        expect(nameRankTier(Q, "البخاري وجهوده في الصحيح")).toBe(3);
    });

    it("survives diacritic and hamza drift through normalization", () => {
        expect(nameRankTier("صحيح البخاري", "صَحِيح البُخَارِي - ط السلطانية")).toBe(0);
    });

    it("never crashes on empties", () => {
        expect(nameRankTier("", "صحيح البخاري")).toBe(3);
        expect(nameRankTier(Q, "")).toBe(3);
    });
});
