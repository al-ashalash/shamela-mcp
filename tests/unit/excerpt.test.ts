/**
 * Reading a phrase in its sentence instead of paging a whole body.
 *
 * Borrowed from turath-mcp's locate_in_page. The discipline is ours: offsets
 * stay in the ORIGINAL string even though matching is normalised, and a phrase
 * that is not there returns null rather than an approximate position — an
 * approximate excerpt is a misquotation waiting to happen.
 */

import { describe, it, expect } from "vitest";

import { excerptAround, findPhraseOffset } from "../../src/server/excerpt.js";

const PAGE = [
    "وقد اختلف أهل العلم في هذه المسألة على قولين مشهورين عند الفقهاء.",
    "القول الأول: أن الوضوء لا ينتقض بمس المرأة، وهو مذهب الحنفية.",
    "القول الثاني: أنه ينتقض مطلقًا، وبه قال الشافعي رحمه الله تعالى.",
].join("\n");

describe("findPhraseOffset", () => {
    it("finds a phrase and returns its offset in the ORIGINAL text", () => {
        const at = findPhraseOffset(PAGE, "الوضوء لا ينتقض");
        expect(at).not.toBeNull();
        expect(PAGE.slice(at as number)).toMatch(/^الوضوء لا ينتقض/);
    });

    it("matches across diacritics the reader did not type", () => {
        const vocalised = "أنَّ الوُضوءَ لا يَنتَقِضُ بِمَسِّ المرأة";
        expect(findPhraseOffset(vocalised, "الوضوء لا ينتقض")).not.toBeNull();
    });

    it("returns null rather than guessing when the phrase is absent", () => {
        expect(findPhraseOffset(PAGE, "زقنطورية مباركة")).toBeNull();
    });

    it("refuses a needle too short to identify anything", () => {
        expect(findPhraseOffset(PAGE, "و")).toBeNull();
    });
});

describe("excerptAround", () => {
    it("returns a window around the phrase, not the whole page", () => {
        const ex = excerptAround(PAGE, "الوضوء لا ينتقض", 30)!;
        expect(ex).not.toBeNull();
        expect(ex.text).toContain("الوضوء لا ينتقض");
        expect(ex.text.length).toBeLessThan(PAGE.length);
        expect(ex.truncated_before).toBe(true);
    });

    it("never opens or closes mid-word", () => {
        // A window beginning «...لصلاة» reads as a different word than the one
        // actually on the page.
        for (const radius of [5, 12, 25, 60]) {
            const ex = excerptAround(PAGE, "الشافعي", radius)!;
            const at = PAGE.indexOf(ex.text.split(/\s/)[0]!);
            expect(at, `radius ${radius}`).toBeGreaterThanOrEqual(0);
            // the first word of the excerpt is a whole word of the page
            expect(at === 0 || /\s/.test(PAGE[at - 1]!), `radius ${radius}`).toBe(true);
        }
    });

    it("says when nothing was dropped at an edge", () => {
        const ex = excerptAround(PAGE, "وقد اختلف", 10_000)!;
        expect(ex.truncated_before).toBe(false);
        expect(ex.truncated_after).toBe(false);
    });

    it("returns null for a phrase that is not on the page", () => {
        expect(excerptAround(PAGE, "لا وجود لهذا", 40)).toBeNull();
    });
});
