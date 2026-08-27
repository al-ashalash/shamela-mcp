/**
 * Telling a verse placed on its own from a verse placed inside a range.
 *
 * The distinction matters because the two are quoted differently: a page a
 * book heads «[سورة الكوثر (١٠٨): الآيات ١ إلى ٣]» comments on three verses
 * together, and a reader told it is the commentary on verse 2 alone will
 * attribute to that verse what the author said about all three.
 *
 * `group` used to be decided by one rule — a per-surah marker density below
 * 0.2 — and that rule is unreachable for a short surah: with `total <= 5`,
 * `distinct >= 1` forces `distinct / total >= 0.2`. So every verse of سور
 * ١٠٣، ١٠٥، ١٠٦، ١٠٨، ١١٠، ١١١، ١١٢، ١١٣ was reported as an exact placement
 * at confidence "high", and the warning was withheld where it was true. The
 * builder had recorded the spans in `ranges` from the beginning; nothing read
 * them.
 */

import { describe, it, expect } from "vitest";

import { locateAya, type BookAyaIndex } from "../../src/server/ayaIndex/build.js";

/** Slot of 108:1 in the 6236-verse array — al-Kawthar's first verse. */
const KAWTHAR_1 = 6204;

function index(over: Partial<BookAyaIndex> = {}): BookAyaIndex {
    const pages = new Array(6236).fill(0);
    const titles = new Array(6236).fill(0);
    // One marker, «[سورة الكوثر (١٠٨): الآيات ١ إلى ٣]», placing all three.
    for (let i = 0; i < 3; i++) {
        pages[KAWTHAR_1 + i] = 3918;
        titles[KAWTHAR_1 + i] = 2133;
    }
    return {
        confidence: "high",
        coverage: { ayat: 3, pct: 0.05 },
        pages,
        titles,
        ranges: {},
        granularity: {},
        surah_pages: new Array(114).fill(null),
        ...over,
    } as unknown as BookAyaIndex;
}

describe("a verse placed by a range marker is a group placement", () => {
    it("reports group for every verse the marker spanned", () => {
        const idx = index({ ranges: { "108:1": [1, 3] } });
        for (const aya of [1, 2, 3]) {
            const hit = locateAya(idx, 108, aya);
            expect(hit, `aya ${aya}`).not.toBeNull();
            expect(hit!.group, `aya ${aya} should be a group placement`).toBe(true);
        }
    });

    it("was silent before, because the density rule cannot fire on a short surah", () => {
        // The old behaviour, reproduced: no ranges consulted, no granularity
        // entry — and al-Kawthar has 3 verses, so 1/3 is never below 0.2.
        const idx = index({ ranges: {} });
        expect(locateAya(idx, 108, 2)!.group).toBe(false);
    });

    it("keeps the sparse-surah rule as a second trigger", () => {
        const idx = index({ ranges: {}, granularity: { "108": "group" } });
        expect(locateAya(idx, 108, 2)!.group).toBe(true);
    });

    it("does not spill a range onto a verse outside it", () => {
        // A marker over 1–2 says nothing about verse 3.
        const idx = index({ ranges: { "108:1": [1, 2] } });
        expect(locateAya(idx, 108, 1)!.group).toBe(true);
        expect(locateAya(idx, 108, 2)!.group).toBe(true);
        expect(locateAya(idx, 108, 3)!.group).toBe(false);
    });

    it("does not read another surah's ranges", () => {
        // Same verse numbers, different surah: 107:1–3 must not mark 108:2.
        const idx = index({ ranges: { "107:1": [1, 3] } });
        expect(locateAya(idx, 108, 2)!.group).toBe(false);
    });

    it("still refuses to answer from a low-confidence index", () => {
        const idx = index({ ranges: { "108:1": [1, 3] }, confidence: "low" });
        expect(locateAya(idx, 108, 2)).toBeNull();
    });
});
