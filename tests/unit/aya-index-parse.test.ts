/**
 * The grammar that locates a verse in a tafsir, tested on titles that actually
 * appear in a real library rather than on invented examples.
 *
 * The alternative to this grammar — searching each book for the verse's text —
 * was measured and rejected: a quarter of verses were attributed to the wrong
 * page, and confidently, because a repeated phrase resolves to its first
 * occurrence. These tests exist to keep the replacement honest, especially at
 * the two places where it could go quietly wrong: a title that looks like a
 * verse number but is not, and a surah heading whose text lies.
 */

import { describe, it, expect } from "vitest";

import {
    assignSurahRoots,
    gradeConfidence,
    longestIncreasing,
    matchSurahHead,
    parseF1,
    parseNumericTitle,
    validate,
    type IndexEntry,
} from "../../src/server/ayaIndex/parse.js";

describe("parseF1 — the self-contained marker", () => {
    it.each([
        ["[سورة البقرة (٢): آية ٢٥٥]", 2, 255, 255],
        ["[سورة البقرة (٢) : الآيات ٢٥٤ الى ٢٥٥]", 2, 254, 255],
        ["[سورة الفاتحة (١) : الآيات ١ إلى ٧]", 1, 1, 7],
        ["القول في تأويل قوله تعالى: [سورة الفاتحة (١) : آية ١]", 1, 1, 1],
    ])("reads %s", (text, surah, from, to) => {
        // Spacing, the hamza on «إلى», and the surrounding sentence all vary
        // between books; the numbers do not.
        expect(parseF1(text)).toEqual({ surah, from, to });
    });

    it.each(["تفسير سورة البقرة", "[فصل]", "سورة البقرة (٢)", "باب ما جاء في الصبر", ""])(
        "refuses %j, which is not a marker",
        (text) => {
            expect(parseF1(text)).toBeNull();
        },
    );

    it("clamps a range that overruns its surah instead of inventing verses", () => {
        expect(parseF1("[سورة الكوثر (١٠٨) : الآيات ١ إلى ٩]")).toEqual({ surah: 108, from: 1, to: 3 });
    });

    it("rejects a verse number the surah does not have", () => {
        expect(parseF1("[سورة الكوثر (١٠٨) : آية ٩]")).toBeNull();
    });
});

describe("parseNumericTitle — a number that means a verse", () => {
    it.each([
        ["الآية: ٢٥٥", 255],
        ["٢٥٥", 255],
        ["٢٥٥ - قوله تعالى", 255],
        ["١", 1],
    ])("reads %j as %i", (text, expected) => {
        expect(parseNumericTitle(text)).toBe(expected);
    });

    it.each(["الفصل الأول", "١٤٠٠هـ", "باب", "مقدمة المؤلف", ""])(
        "refuses %j, where the number is not the subject",
        (text) => {
            expect(parseNumericTitle(text)).toBeNull();
        },
    );
});

describe("matchSurahHead", () => {
    it.each([
        ["سورة البقرة", 2],
        ["تفسير سورة البقرة", 2],
        ["٢ - سورة البقرة", 2],
        ["سورة الملائكة", 35], // Fatir, as some books file it
        ["سورة براءة", 9], // al-Tawbah
        ["سورة (ن)", 68], // al-Qalam
        ["سورة تبت", 111], // al-Masad
        ["القول في تفسير السورة التي يذكر فيها البقرة", 2],
    ])("reads %j as surah %i", (text, surah) => {
        expect(matchSurahHead(text)?.surah).toBe(surah);
    });

    it("still recognises a heading whose name it does not know", () => {
        // It must be counted for the ordinal assignment even when unnamed;
        // dropping it would shift every surah after it.
        const head = matchSurahHead("سورة الفلانية");
        expect(head).not.toBeNull();
        expect(head!.surah).toBe(0);
        expect(head!.byName).toBe(false);
    });

    it("does not mistake a verse marker for a heading", () => {
        expect(matchSurahHead("[سورة البقرة (٢): آية ٢٥٥]")).toBeNull();
    });
});

describe("longestIncreasing", () => {
    it("discards the back-of-book index, which repeats the headings", () => {
        // Pages climb through the book, then a contents list restarts low.
        const values = [10, 20, 30, 40, 5, 6, 7];
        expect(longestIncreasing(values).map((i) => values[i])).toEqual([10, 20, 30, 40]);
    });

    it("handles an empty list", () => {
        expect(longestIncreasing([])).toEqual([]);
    });
});

describe("assignSurahRoots — position decides, not the name", () => {
    it("numbers a complete set of headings by their order", () => {
        const candidates = Array.from({ length: 114 }, (_, i) => ({
            title_id: i + 1,
            page_id: (i + 1) * 10,
            named: 0, // no name recognised anywhere
        }));
        const roots = assignSurahRoots(candidates);
        expect(roots.get(1)).toBe(1);
        expect(roots.get(114)).toBe(114);
    });

    it("survives a heading whose text names the wrong surah", () => {
        // Observed in a real library: al-Kawthar (108) titled «سورة التكوير»,
        // which is surah 81. Trusting the name would move it 27 surahs and
        // corrupt everything after it.
        const candidates = Array.from({ length: 114 }, (_, i) => ({
            title_id: i + 1,
            page_id: (i + 1) * 10,
            named: i + 1 === 108 ? 81 : i + 1,
        }));
        expect(assignSurahRoots(candidates).get(108)).toBe(108);
    });

    it("falls back to names for a partial tafsir, requiring them to ascend", () => {
        const roots = assignSurahRoots([
            { title_id: 1, page_id: 10, named: 2 },
            { title_id: 2, page_id: 20, named: 5 },
            { title_id: 3, page_id: 30, named: 3 }, // out of order — dropped, not corrected
            { title_id: 4, page_id: 40, named: 9 },
        ]);
        expect([...roots.values()]).toEqual([2, 5, 9]);
    });
});

const entry = (surah: number, aya: number, page_id: number, title_id = page_id): IndexEntry => ({
    surah,
    aya,
    page_id,
    title_id,
});

describe("validate", () => {
    it("drops a verse number its surah does not reach", () => {
        const { kept, diagnostics } = validate([entry(108, 1, 10), entry(108, 99, 11)]);
        expect(kept).toHaveLength(1);
        expect(diagnostics.dropped_v3).toBe(1);
    });

    it("drops both when one verse is claimed by two distant pages", () => {
        // There is no way to tell which is right, and picking one would be a
        // guess presented as a location.
        const { kept, diagnostics } = validate([entry(2, 255, 100), entry(2, 255, 900)]);
        expect(kept).toHaveLength(0);
        expect(diagnostics.dropped_v4).toBe(2);
    });

    it("keeps a near-duplicate, which is the same commentary split over pages", () => {
        const { kept } = validate([entry(2, 255, 100), entry(2, 255, 101)]);
        expect(kept).toHaveLength(1);
    });

    it("counts verses whose pages run backwards", () => {
        const { diagnostics } = validate([entry(2, 1, 50), entry(2, 2, 40), entry(2, 3, 60)]);
        expect(diagnostics.v1_out_of_order).toBe(1);
    });

    it("counts surahs that overlap on the page", () => {
        const { diagnostics } = validate([entry(2, 1, 100), entry(2, 2, 200), entry(3, 1, 150)]);
        expect(diagnostics.v2_outside_surah).toBe(1);
    });
});

describe("gradeConfidence", () => {
    it("grades a clean, complete index high", () => {
        expect(gradeConfidence({ v1_out_of_order: 0, v2_outside_surah: 0 }, 6236, 100)).toBe("high");
    });

    it("refuses high when the checks found violations", () => {
        // Anything below high never returns a page — the index is kept only so
        // the trouble can be reported.
        expect(gradeConfidence({ v1_out_of_order: 32, v2_outside_surah: 0 }, 6236, 100)).not.toBe("high");
    });

    it("grades thin coverage low, however clean", () => {
        expect(gradeConfidence({ v1_out_of_order: 0, v2_outside_surah: 0 }, 100, 2)).toBe("low");
    });

    it("allows medium for a mostly-clean, partial index", () => {
        expect(gradeConfidence({ v1_out_of_order: 1, v2_outside_surah: 0 }, 3000, 50)).toBe("medium");
    });
});
