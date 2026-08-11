import { num, type Slice } from "../labels.js";
import type { TafsirCoverageStatus } from "../../tools/listTafsirsForAya.js";

/** Wording for shamela_list_tafsirs_for_aya. Arabic first; English translates it. */
export const listTafsirsForAyaLabels: Slice<{
    heading: (surahName: string, surah: string, aya: string) => string;
    /** Counts arrive raw, not pre-formatted: English has to say "1 book" and
     *  "2 books", and only the sentence knows which noun it is agreeing with. */
    summary: (located: number, unlocated: number, pending: string) => string;
    pendingClause: (count: number) => string;
    /** Prose, though it travels in structuredContent — a caveat a reader reads,
     *  not a value a caller branches on. */
    note: string;
    statusLabel: Record<TafsirCoverageStatus, string>;
    deathYear: (year: string) => string;
    pageBit: (pageId: string, printedPage: string) => string;
    fromCategory: (categoryName: string) => string;
    notDownloaded: string;
    bitSeparator: string;
    bookLine: (bookName: string, bits: string) => string;
}> = {
    ar: {
        heading: (surahName, surah, aya) => `تغطية تفاسير الآية ${surahName} ${surah}:${aya}`,
        summary: (located, unlocated, pending) =>
            `موضع الآية معلوم في **${num(located)}** كتابًا، وغير معلوم في **${num(unlocated)}**${pending}.`,
        pendingClause: (count) => `، ولم يُفهرس بعد **${num(count)}**`,
        note: "المواضع تأتي من مصدرين: فهرس الشاملة الجاهز (منتقًى لا يشمل كل الكتب)، وفهرسٌ نبنيه من عناوين الكتاب نفسه. و«غير معلوم» ليس نفيًا: الكتاب قد يفسّر الآية ولم نجد له علامةً تحدّد موضعها، فتصفَّحه بـ shamela_get_toc أو shamela_get_book_section. ولا يُبنى موضعٌ على مطابقة نصّ الآية، لأن الألفاظ المتكررة بين السور تُنتج نسبةً واثقةً إلى صفحةٍ خاطئة.",
        statusLabel: {
            indexed_covers: "موضع الآية معلوم (من فهرس الشاملة)",
            title_index: "موضع الآية معلوم (من فهرس عناوين الكتاب)",
            title_index_group: "الموضع معلوم لمجموعة آيات تشمل هذه الآية",
            indexed_no_entry_for_this_aya: "مشارك في فهرس الشاملة ولا مدخل له لهذه الآية",
            covered_no_locus: "الكتاب مفهرس عندنا ولا علامة لهذه الآية فيه",
            index_pending: "لم يُفهرس بعد — أعد الطلب لاستكماله",
            not_indexed_coverage_unknown: "غير مرتَّب على الآيات — التغطية غير معلومة",
        },
        deathYear: (year) => ` (ت ${year}هـ)`,
        pageBit: (pageId, printedPage) => `page_id=${pageId}${printedPage ? `، ص ${printedPage}` : ""}`,
        fromCategory: (categoryName) => `من تصنيف: ${categoryName}`,
        notDownloaded: "غير منزَّل",
        bitSeparator: "؛ ",
        bookLine: (bookName, bits) => `- **${bookName}**${bits ? ` — ${bits}` : ""}`,
    },
    en: {
        heading: (surahName, surah, aya) => `Tafsir coverage for aya ${surahName} ${surah}:${aya}`,
        summary: (located, unlocated, pending) =>
            `The aya is located in **${num(located)}** ${located === 1 ? "book" : "books"}, and not located in **${num(unlocated)}**${pending}.`,
        pendingClause: (count) => `, with **${num(count)}** not indexed yet`,
        note: "Loci come from two sources: Shamela's ready-made index (curated — it does not cover every book), and an index we build from the book's own chapter titles. \"Not located\" is not a denial: the book may well comment on the aya even though we found no marker fixing its place, so browse it with shamela_get_toc or shamela_get_book_section. No locus is ever built by matching the text of the aya, because wording repeated across surahs yields a confident attribution to the wrong page.",
        statusLabel: {
            indexed_covers: "Aya located (from Shamela's index)",
            title_index: "Aya located (from the book's own chapter titles)",
            title_index_group: "Located for a group of ayat that includes this aya",
            indexed_no_entry_for_this_aya: "In Shamela's index, but with no entry for this aya",
            covered_no_locus: "Indexed here, but with no marker for this aya",
            index_pending: "Not indexed yet — ask again to finish it",
            not_indexed_coverage_unknown: "Not arranged by aya — coverage unknown",
        },
        deathYear: (year) => ` (d. ${year} AH)`,
        pageBit: (pageId, printedPage) => `page_id=${pageId}${printedPage ? `, p. ${printedPage}` : ""}`,
        fromCategory: (categoryName) => `from category: ${categoryName}`,
        notDownloaded: "not downloaded",
        bitSeparator: "; ",
        bookLine: (bookName, bits) => `- **${bookName}**${bits ? ` — ${bits}` : ""}`,
    },
};
