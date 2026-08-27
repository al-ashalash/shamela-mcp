/**
 * The measurements a quotation check is made of, without a library attached.
 *
 * Each of these is a claim the tool makes to a reader who is deciding whether
 * to publish a sentence: how much of it is on the page, which axis it differs
 * on, and which words were actually asked of the engine. They are unit-tested
 * because each is a pure function over two strings, and because a wrong answer
 * here reads as a finding rather than as a bug.
 */

import { describe, it, expect } from "vitest";

import {
    candidateTokens,
    differencesBetween,
    longestSharedRun,
    partialThreshold,
    quoteWords,
    windowStarts,
} from "../../src/server/tools/verifyQuote.js";
import { MAX_QUERY_TOKENS } from "../../src/server/constants.js";
import { tokenizeArabic } from "../../src/server/arabic.js";

describe("naming the difference, not merely reporting one", () => {
    const page = "القياس لغةً: التقديرُ والمساواةُ، واصطلاحاً: تسويةُ فرعٍ بأصلٍ في حكمٍ.";

    it("finds nothing to name when the quotation is the page's own text", () => {
        expect(differencesBetween(page, "تسويةُ فرعٍ بأصلٍ في حكمٍ")).toEqual([]);
    });

    it("names the diacritics when only the diacritics differ", () => {
        expect(differencesBetween(page, "تسوية فرع بأصل في حكم")).toEqual(["diacritics"]);
    });

    it("names the hamza when only the hamza spelling differs", () => {
        // «بأصل» written «باصل» — one alef, and the whole citation hangs on it
        // being reported rather than silently folded.
        const bare = "تسوية فرع باصل في حكم";
        expect(differencesBetween(page, bare)).toEqual(expect.arrayContaining(["hamza"]));
    });

    it("names the digits when the digit systems differ", () => {
        const withDigits = "الصفحة ٢٥٥ من الكتاب";
        expect(differencesBetween(withDigits, "الصفحة 255 من الكتاب")).toEqual(["digits"]);
        expect(differencesBetween(withDigits, "الصفحة ٢٥٥ من الكتاب")).toEqual([]);
    });
});

describe("how much of the quotation the page carries", () => {
    const page = tokenizeArabic("القياس لغة التقدير والمساواة واصطلاحا تسوية فرع بأصل في حكم لعلة جامعة");

    it("measures a run that runs to the end of the quotation", () => {
        const quote = tokenizeArabic("تسوية فرع بأصل في حكم");
        expect(longestSharedRun(quote, page)).toEqual({ at: 0, len: 5 });
    });

    it("measures the longest run when the quotation drifts in the middle", () => {
        // The reader has the opening right and the rest from memory.
        const quote = tokenizeArabic("والمساواة واصطلاحا تسوية فرع بين الأصل والفرع عند الأصوليين");
        const run = longestSharedRun(quote, page);
        expect(run.len).toBe(4);
        expect(run.at).toBe(0);
    });

    it("returns nothing shared when nothing is shared", () => {
        expect(longestSharedRun(tokenizeArabic("زقنطورية مباركة"), page)).toEqual({ at: 0, len: 0 });
    });

    it("prefers the longer run when a word repeats earlier in the page", () => {
        // «القياس» occurs twice; the run must be measured from the occurrence
        // that continues, not from the first one found.
        const twice = tokenizeArabic("القياس باب القياس لغة التقدير");
        const quote = tokenizeArabic("القياس لغة التقدير");
        expect(longestSharedRun(quote, twice).len).toBe(3);
    });
});

describe("the bar a partial match has to clear", () => {
    it("never accepts fewer than four consecutive words", () => {
        for (const n of [1, 4, 6, 10]) expect(partialThreshold(n)).toBeGreaterThanOrEqual(4);
    });

    it("scales with the quotation, so four words cannot answer thirty", () => {
        expect(partialThreshold(30)).toBeGreaterThan(partialThreshold(6));
        expect(partialThreshold(30)).toBe(11);
    });
});

describe("the words actually asked of the engine", () => {
    it("passes a short quotation through whole", () => {
        const tokens = ["تسويه", "فرع", "باصل"];
        expect(candidateTokens(tokens)).toEqual(tokens);
    });

    it("never asks for more words than the engine accepts", () => {
        // Six words come back as five, the sixth glued to the fifth, and the
        // search returns zero with no error. Measured on the fixture page:
        // five words of its own sentence find it, six find nothing.
        const tokens = ["والمساواه", "واصطلاحا", "تسويه", "فرع", "باصل", "في"];
        const asked = candidateTokens(tokens);
        expect(asked.length).toBe(MAX_QUERY_TOKENS);
        expect(asked.length).toBeLessThan(tokens.length);
    });

    it("keeps the longest words and drops the particles", () => {
        const tokens = ["في", "من", "الاستصناع", "علي", "المذاهب", "الاربعه", "عند"];
        const asked = candidateTokens(tokens);
        expect(asked).toContain("الاستصناع");
        expect(asked).toContain("المذاهب");
        expect(asked).not.toContain("في");
    });

    it("keeps them in the order they were written", () => {
        const tokens = ["الاستصناع", "في", "المذاهب", "من", "الاربعه", "عند", "الفقهاء"];
        const asked = candidateTokens(tokens);
        expect(asked).toEqual([...asked].sort((a, b) => tokens.indexOf(a) - tokens.indexOf(b)));
    });
});

describe("the windows tried when the whole quotation finds nothing", () => {
    it("always starts at the beginning", () => {
        expect(windowStarts(20, 5, 4)[0]).toBe(0);
    });

    it("reaches the end of the quotation", () => {
        const starts = windowStarts(20, 5, 4);
        expect(starts[starts.length - 1]).toBe(15);
    });

    it("asks for one window when there is only one", () => {
        expect(windowStarts(5, 5, 4)).toEqual([0]);
        expect(windowStarts(3, 5, 4)).toEqual([0]);
    });

    it("never asks for more windows than it was allowed", () => {
        expect(windowStarts(100, 5, 4).length).toBeLessThanOrEqual(4);
    });
});

describe("the quotation's own words, with their places", () => {
    it("keeps the offset of each word so a partial finding can quote the page", () => {
        const words = quoteWords("تسوية فرع بأصل");
        expect(words.map((w) => w.raw)).toEqual(["تسوية", "فرع", "بأصل"]);
        expect(words[1]!.at).toBe("تسوية ".length);
    });

    it("splits on punctuation the way Arabic prose actually runs it together", () => {
        // «والمساواة.واصطلاحاً» is ONE whitespace-token on the fixture page.
        const words = quoteWords("والمساواة.واصطلاحاً: تسوية");
        expect(words.map((w) => w.raw)).toEqual(["والمساواة", "واصطلاحاً", "تسوية"]);
    });

    it("tokenises exactly as the index does", () => {
        const s = "قال ابن قدامة في المغني";
        expect(quoteWords(s).map((w) => w.token)).toEqual(tokenizeArabic(s));
    });
});
