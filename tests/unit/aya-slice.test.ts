/**
 * Cutting a tafsir page down to the verse it was fetched for.
 *
 * The index says which PAGE comments on a verse and never said where on it,
 * so the tool returned the page whole. When a verse's section began near the
 * foot, the reader was handed the previous passage's commentary under this
 * verse's heading — with confidence "high" and no warning at all. Both
 * fixtures below are the real pages the 15 Aug 2026 sweep returned.
 */

import { describe, it, expect } from "vitest";

import { findVerseMarker, offsetOfTitle, type PageTitle } from "../../src/server/ayaIndex/slice.js";

/**
 * ابن كثير, page 3918 (printed 8/471). Every word is سورة الماعون; the page
 * ends at the heading of سورة الكوثر and its three verses. Asking for 108:2
 * used to return all of this as the tafsir of al-Kawthar.
 */
const IBN_KATHIR_3918 = [
    "جبير وأبو مالك وغير واحد إنها العارية للأمتعة",
    "﴿وَيَمْنَعُونَ الْماعُونَ﴾ أي لا يحسنون ولا يعيرون",
    "آخر تفسير سورة الماعون ولله الحمد والمنة.",
    "",
    "تفسير سورة الكوثر",
    "وهي مكية",
    "[سورة الكوثر (١٠٨): الآيات ١ إلى ٣]",
    "﴿إِنّا أَعْطَيْناكَ الْكَوْثَرَ (١) فَصَلِّ لِرَبِّكَ وَاِنْحَرْ (٢) إِنَّ شانِئَكَ هُوَ الْأَبْتَرُ (٣)﴾",
].join("\n");

/**
 * الطبري, page 2936 (printed 4/526): the tafsir of 2:254, ending at the bare
 * heading that opens آية الكرسي. This one came from Shamela's own curated
 * table, which carries no title id — so the marker has to be parsed.
 */
const TABARI_2936 = [
    "حدثنا ابن أبي حاتم، قال: حدثنا عطاء بن دينار",
    "﴿وَالْكَافِرُونَ هُمُ الظَّالِمُونَ﴾ يعني بذلك جل ثناؤه",
    "القولُ في تأويل قولِ اللهِ جلّ ثناؤه: [سورة البقرة (٢): آية ٢٥٥] ﴿اللَّهُ لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ﴾.",
].join("\n");

describe("offsetOfTitle", () => {
    it("returns the start of the line carrying the title, not the match inside it", () => {
        const offset = offsetOfTitle(IBN_KATHIR_3918, "[سورة الكوثر (١٠٨): الآيات ١ إلى ٣]");
        expect(offset).not.toBeNull();
        // Slicing there must open ON the heading — beheading it would strip the
        // one line that proves the text belongs to this verse.
        expect(IBN_KATHIR_3918.slice(offset as number)).toMatch(/^\[سورة الكوثر/);
    });

    it("matches across diacritic and spacing drift between title and body", () => {
        // The title index and the page index are both Shamela's, and they do
        // not always spell a heading identically.
        const offset = offsetOfTitle(IBN_KATHIR_3918, "[سُورَةُ الكَوْثَر  (١٠٨) : الآيات ١ إلى ٣]");
        expect(offset).not.toBeNull();
        expect(IBN_KATHIR_3918.slice(offset as number)).toMatch(/^\[سورة الكوثر/);
    });

    it("finds nothing when the title is not on the page", () => {
        expect(offsetOfTitle(IBN_KATHIR_3918, "[سورة الفيل (١٠٥): الآيات ١ إلى ٥]")).toBeNull();
    });

    it("refuses to identify anything from a title too short to be distinctive", () => {
        expect(offsetOfTitle(IBN_KATHIR_3918, "١")).toBeNull();
    });
});

describe("findVerseMarker", () => {
    const kawthar: PageTitle[] = [
        { title_id: 900, text: "تفسير سورة الكوثر" },
        { title_id: 901, text: "[سورة الكوثر (١٠٨): الآيات ١ إلى ٣]" },
    ];

    it("uses the title the index itself placed the verse by", () => {
        const hit = findVerseMarker(IBN_KATHIR_3918, kawthar, 108, 2, 901);
        expect(hit).not.toBeNull();
        expect(hit!.via).toBe("title_id");
        expect(hit!.title_id).toBe(901);
        // and what it cuts away is the whole of the previous sura's tafsir
        const kept = IBN_KATHIR_3918.slice(hit!.offset);
        expect(kept).not.toContain("الماعون");
        expect(kept).toContain("الْكَوْثَرَ");
    });

    it("parses the markers when no title id came with the locus", () => {
        // Shamela's curated table gives a page and nothing else.
        const hit = findVerseMarker(IBN_KATHIR_3918, kawthar, 108, 2, null);
        expect(hit).not.toBeNull();
        expect(hit!.via).toBe("parsed_marker");
        expect(hit!.title_id).toBe(901);
    });

    it("places a verse inside a range marker, not only at its start", () => {
        // «الآيات ١ إلى ٣» must answer for verse 2 as well as verse 1.
        for (const aya of [1, 2, 3]) {
            expect(findVerseMarker(IBN_KATHIR_3918, kawthar, 108, aya, null), `aya ${aya}`).not.toBeNull();
        }
        expect(findVerseMarker(IBN_KATHIR_3918, kawthar, 108, 4, null)).toBeNull();
    });

    it("does not match a marker from another surah", () => {
        expect(findVerseMarker(IBN_KATHIR_3918, kawthar, 107, 2, null)).toBeNull();
    });

    it("cuts al-Tabari's page at آية الكرسي, dropping the tafsir of 2:254", () => {
        const titles: PageTitle[] = [
            {
                title_id: 4400,
                text: "القول في تأويل قول الله جل ثناؤه: [سورة البقرة (٢): آية ٢٥٥] ﴿اللَّهُ لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ﴾.",
            },
        ];
        const hit = findVerseMarker(TABARI_2936, titles, 2, 255, null);
        expect(hit).not.toBeNull();
        const kept = TABARI_2936.slice(hit!.offset);
        expect(kept).not.toContain("عطاء بن دينار");
        expect(kept).toContain("الْحَيُّ الْقَيُّومُ");
    });

    it("returns nothing rather than guessing when the page carries no marker", () => {
        // A page of running commentary with no heading must be returned whole,
        // not cut at some plausible-looking line.
        expect(findVerseMarker(TABARI_2936, [], 2, 255, null)).toBeNull();
        expect(findVerseMarker("", [{ title_id: 1, text: "أي شيء" }], 2, 255, null)).toBeNull();
    });

    it("takes the later marker when a page carries two that both cover the verse", () => {
        // A group marker opens the page and a per-verse marker follows it, both
        // covering verse 2. The verse's own section starts at the LATER one —
        // taking the earlier would hand back the commentary on verse 1 too.
        const doubled: PageTitle[] = [
            { title_id: 1, text: "[سورة الكوثر (١٠٨): الآيات ١ إلى ٣]" },
            { title_id: 2, text: "[سورة الكوثر (١٠٨): آية ٢]" },
        ];
        const body = [
            "[سورة الكوثر (١٠٨): الآيات ١ إلى ٣]",
            "تفسير الآية الأولى",
            "[سورة الكوثر (١٠٨): آية ٢]",
            "تفسير الآية الثانية",
        ].join("\n");
        const hit = findVerseMarker(body, doubled, 108, 2, null);
        expect(hit).not.toBeNull();
        expect(hit!.title_id).toBe(2);
        expect(body.slice(hit!.offset)).not.toContain("تفسير الآية الأولى");
    });
});
