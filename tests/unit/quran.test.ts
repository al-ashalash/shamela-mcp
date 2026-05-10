import { describe, it, expect } from "vitest";

import { QURAN_AYA_COUNT } from "../../src/server/constants.js";
import {
    ayaIdFromSurahAya,
    listSurahs,
    surahAyaFromId,
    surahName,
} from "../../src/server/quran.js";

describe("Quran static metadata", () => {
    it("has 114 surahs", () => {
        expect(listSurahs()).toHaveLength(114);
    });

    it("has 6,236 ayat in total (Hafs from `Asim, Egyptian standard)", () => {
        expect(QURAN_AYA_COUNT).toBe(6236);
        const sum = listSurahs().reduce((acc, s) => acc + s.ayat, 0);
        expect(sum).toBe(6236);
    });

    it("the last surah's end_aya_id equals 6236", () => {
        const surahs = listSurahs();
        expect(surahs[113]!.end_aya_id).toBe(6236);
    });
});

describe("surahName", () => {
    it("returns الفاتحة for surah 1", () => {
        expect(surahName(1)).toBe("الفاتحة");
    });

    it("returns البقرة for surah 2", () => {
        expect(surahName(2)).toBe("البقرة");
    });

    it("returns الناس for surah 114", () => {
        expect(surahName(114)).toBe("الناس");
    });

    it("returns null for out-of-range surahs", () => {
        expect(surahName(0)).toBeNull();
        expect(surahName(115)).toBeNull();
        expect(surahName(-1)).toBeNull();
    });

    it("returns null for non-integer input", () => {
        expect(surahName(1.5)).toBeNull();
        expect(surahName(NaN)).toBeNull();
    });
});

describe("ayaIdFromSurahAya", () => {
    it("aya 1 of surah 1 is aya_id 1 (Al-Fatiha opening)", () => {
        expect(ayaIdFromSurahAya(1, 1)).toBe(1);
    });

    it("last aya of Al-Fatiha is aya_id 7", () => {
        expect(ayaIdFromSurahAya(1, 7)).toBe(7);
    });

    it("aya 1 of Al-Baqarah is aya_id 8 (Al-Fatiha has 7 ayat)", () => {
        expect(ayaIdFromSurahAya(2, 1)).toBe(8);
    });

    it("last aya of Al-Nas (114:6) is aya_id 6236", () => {
        expect(ayaIdFromSurahAya(114, 6)).toBe(6236);
    });

    it("returns null for invalid surah", () => {
        expect(ayaIdFromSurahAya(0, 1)).toBeNull();
        expect(ayaIdFromSurahAya(115, 1)).toBeNull();
    });

    it("returns null for aya past the end of a surah", () => {
        expect(ayaIdFromSurahAya(1, 8)).toBeNull(); // Al-Fatiha has only 7 ayat
        expect(ayaIdFromSurahAya(114, 7)).toBeNull(); // Al-Nas has only 6 ayat
    });

    it("returns null for non-integer input", () => {
        expect(ayaIdFromSurahAya(1.5, 1)).toBeNull();
        expect(ayaIdFromSurahAya(1, 1.5)).toBeNull();
    });
});

describe("surahAyaFromId", () => {
    it("aya_id 1 maps to (1, 1, 'الفاتحة')", () => {
        expect(surahAyaFromId(1)).toEqual({ surah: 1, aya: 1, surah_name: "الفاتحة" });
    });

    it("aya_id 7 maps to (1, 7, 'الفاتحة')", () => {
        expect(surahAyaFromId(7)).toEqual({ surah: 1, aya: 7, surah_name: "الفاتحة" });
    });

    it("aya_id 8 maps to (2, 1, 'البقرة')", () => {
        expect(surahAyaFromId(8)).toEqual({ surah: 2, aya: 1, surah_name: "البقرة" });
    });

    it("aya_id 6236 maps to (114, 6, 'الناس')", () => {
        expect(surahAyaFromId(6236)).toEqual({
            surah: 114,
            aya: 6,
            surah_name: "الناس",
        });
    });

    it("returns null for out-of-range ids", () => {
        expect(surahAyaFromId(0)).toBeNull();
        expect(surahAyaFromId(6237)).toBeNull();
        expect(surahAyaFromId(-1)).toBeNull();
    });

    it("returns null for non-integer input", () => {
        expect(surahAyaFromId(1.5)).toBeNull();
    });
});

describe("aya_id ↔ (surah, aya) round trip", () => {
    it.each([1, 7, 8, 100, 1000, 5000, 6236])("round-trips for aya_id %i", (id) => {
        const sa = surahAyaFromId(id);
        expect(sa).not.toBeNull();
        const back = ayaIdFromSurahAya(sa!.surah, sa!.aya);
        expect(back).toBe(id);
    });
});

describe("listSurahs", () => {
    it("returns a fresh copy each call (mutation-safe)", () => {
        const a = listSurahs();
        const b = listSurahs();
        expect(a).not.toBe(b);
        expect(a).toEqual(b);
    });

    it("each entry has the documented shape", () => {
        const surahs = listSurahs();
        for (const s of surahs) {
            expect(s.surah).toBeGreaterThanOrEqual(1);
            expect(s.surah).toBeLessThanOrEqual(114);
            expect(s.surah_name).toMatch(/.+/);
            expect(s.ayat).toBeGreaterThan(0);
            expect(s.end_aya_id).toBeGreaterThan(0);
        }
    });
});
