/**
 * The sentence a reader gets when paging runs out before the matches do.
 *
 * The helper fetches at most five thousand rows per search, so a query with
 * more matches than that has an end to its paging that is not the end of its
 * results. `has_more: false` there is true about paging and false about the
 * library, and the difference is the whole reason this note exists.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { resetLangForTesting } from "../../src/server/i18n/index.js";
import { depthLimited, depthNote } from "../../src/server/i18n/tools/paging.js";

function withLang(lang: string, fn: () => void): void {
    process.env.SHAMELA_LANG = lang;
    resetLangForTesting();
    fn();
}

describe("depthLimited", () => {
    beforeEach(() => {
        delete process.env.SHAMELA_LANG;
        resetLangForTesting();
    });
    afterEach(() => {
        delete process.env.SHAMELA_LANG;
        resetLangForTesting();
    });

    it("is true only where paging stopped short of the matches", () => {
        // The ceiling: 5,000 rows reachable out of 40,000 matched.
        expect(depthLimited({ has_more: false, offset: 4_900, returned: 100, total_hits: 40_000 })).toBe(true);
    });

    it("is false while there are still pages to ask for", () => {
        expect(depthLimited({ has_more: true, offset: 0, returned: 100, total_hits: 40_000 })).toBe(false);
    });

    it("is false when paging really did reach the end", () => {
        expect(depthLimited({ has_more: false, offset: 100, returned: 40, total_hits: 140 })).toBe(false);
    });

    it("is false for a search that matched nothing", () => {
        expect(depthLimited({ has_more: false, offset: 0, returned: 0, total_hits: 0 })).toBe(false);
    });
});

describe("depthNote", () => {
    afterEach(() => {
        delete process.env.SHAMELA_LANG;
        resetLangForTesting();
    });

    it("names both numbers, in the reader's own digits", () => {
        withLang("ar", () => {
            const note = depthNote({ has_more: false, offset: 4_900, returned: 100, total_hits: 40_000 });
            // ٥٠٠٠ reachable of ٤٠٠٠٠ matched — Arabic prose, Arabic-Indic digits.
            expect(note).toContain("٥٠٠٠");
            expect(note).toContain("٤٠٠٠٠");
            expect(note).not.toMatch(/[0-9]/);
        });
    });

    it("counts in English for an English reader", () => {
        withLang("en", () => {
            const note = depthNote({ has_more: false, offset: 4_900, returned: 100, total_hits: 40_000 });
            expect(note).toContain("5000");
            expect(note).toContain("40000");
            expect(note).toContain("matches");
            // An Arabic numeral in an English sentence is a translation that
            // stopped halfway.
            expect(note).not.toMatch(/[٠-٩]/);
        });
    });

    it("agrees with a single match", () => {
        withLang("en", () => {
            const note = depthNote({ has_more: false, offset: 0, returned: 0, total_hits: 1 });
            expect(note).toContain(" match ");
            expect(note).not.toContain("matches");
        });
    });
});
