import type { Slice } from "../labels.js";

/** Wording for shamela_get_tafseer_texts. Arabic first; English translates it. */
export const getTafseerTextsLabels: Slice<{
    heading: (surahName: string, surah: string, aya: string) => string;
    summary: (indexed: string, fromService: string, fromTitles: string, fetched: string) => string;
    died: (year: string) => string;
    printedPage: (page: string) => string;
    /** Between the printed page and the ids, and between the ids themselves. */
    sep: string;
    /** The curated-index caveat carried on every response. */
    coverageNote: string;
    /** Why a requested book came back without text. */
    statusNote: {
        indexPending: string;
        noEntryForThisAya: string;
        notIndexed: string;
        notDownloaded: string;
    };
    /** The locus was a marker over several verses, not this one alone. */
    groupNote: string;
    /** How to read on: the rest of this page, the next page, or both. */
    continuation: (
        bookId: string,
        pageId: string,
        hasMore: boolean,
        nextPageId: string | null,
    ) => string;
    /**
     * Said when sources were left out, by max_sources or by the char budget.
     *
     * The id list is joined with an ASCII comma in both languages, and Arabic
     * prose does not get its own «،» here: the sentence hands the reader a
     * literal to paste back into `book_ids`, and «،» is not a separator that
     * parameter accepts. It is the same reason ids are never arabized — what
     * the reader copies has to be what the tool will read.
     */
    trimmed: (fetched: string, budgetCut: boolean, remainingIds: readonly string[]) => string;
}> = {
    ar: {
        heading: (surahName, surah, aya) => `نصوص تفسير الآية ${surahName} ${surah}:${aya}`,
        summary: (indexed, fromService, fromTitles, fetched) =>
            `موضع الآية معلوم في **${indexed}** كتابًا (${fromService} من فهرس الشاملة و${fromTitles} من عناوين الكتب)، جُلِب نص ${fetched} منها.`,
        died: (year) => `(ت ${year}هـ)`,
        printedPage: (page) => `ص ${page}`,
        sep: "، ",
        coverageNote:
            "النصوص المجلوبة هنا من الكتب التي يشملها فهرس التفسير المنتقى لهذه الآية فقط؛ فالتفاسير المنزَّلة غير المفهرسة لا تُجلب هنا وليس ذلك دليلًا على خلوّها من الكلام على الآية — استعرض التغطية بـ shamela_list_tafsirs_for_aya وتصفَّح غير المفهرس بفهرسه (shamela_get_toc).",
        statusNote: {
            indexPending: "لم يُفهرس هذا الكتاب بعد في هذه الجلسة؛ أعد الطلب ليُستكمل.",
            noEntryForThisAya:
                "الكتاب مشارك في فهرس الشاملة لكن لا مدخل له لهذه الآية، ولا علامة لها في عناوينه؛ لا يُجلب نص بلا تحديد موضع تفاديًا للنسبة الخاطئة.",
            notIndexed:
                "لم نجد ما يحدّد موضع الآية في هذا الكتاب — لا في فهرس الشاملة ولا في عناوينه؛ وليس ذلك دليلًا على خلوّه من تفسيرها، فتصفَّحه بـ shamela_get_toc.",
            notDownloaded: "موضع الآية معلوم في هذا الكتاب لكنه غير منزَّل محليًّا فلا يمكن قراءة نصه.",
        },
        groupNote: "هذا الموضع يغطي مجموعة آيات هذه الآية إحداها، لا الآية وحدها.",
        continuation: (bookId, pageId, hasMore, nextPageId) =>
            `التفسير قد يمتد؛ ${hasMore ? `لبقية هذه الصفحة استخدم shamela_get_page(book_id=${bookId}, page_id=${pageId}, body_part=2)` : ""}${hasMore && nextPageId !== null ? "، و" : ""}${nextPageId !== null ? `للصفحة التالية next_page_id=${nextPageId}` : ""}.`,
        trimmed: (fetched, budgetCut, remainingIds) =>
            `اقتُصِر على ${fetched} مصدرًا${budgetCut ? " لضبط الحجم" : ""}؛ لبقية المصادر أعد الاستدعاء بـ \`book_ids=[${remainingIds.join(", ")}]\`.`,
    },
    en: {
        heading: (surahName, surah, aya) => `Tafsir texts for aya ${surahName} ${surah}:${aya}`,
        summary: (indexed, fromService, fromTitles, fetched) =>
            `The aya is located in **${indexed}** ${plural(indexed, "book", "books")} (${fromService} from Shamela's index, ${fromTitles} from the books' own chapter titles); text fetched from ${fetched} ${plural(fetched, "source", "sources")}.`,
        died: (year) => `(d. ${year} AH)`,
        printedPage: (page) => `p. ${page}`,
        sep: ", ",
        coverageNote:
            "The texts fetched here come only from the books the curated tafsir index covers for this aya; downloaded tafsirs that are not in it are not fetched here, and that is no proof they say nothing about the aya — review the coverage with shamela_list_tafsirs_for_aya, and browse an unindexed tafsir by its table of contents (shamela_get_toc).",
        statusNote: {
            indexPending: "This book has not been indexed yet in this session; ask again to finish it.",
            noEntryForThisAya:
                "The book is in Shamela's index but has no entry for this aya, and no marker for it in its chapter titles; no text is fetched without a fixed locus, to avoid attributing the wrong page.",
            notIndexed:
                "Nothing fixes the place of this aya in this book — neither Shamela's index nor the book's own chapter titles; that is no proof it does not comment on the aya, so browse it with shamela_get_toc.",
            notDownloaded:
                "The aya is located in this book, but the book is not downloaded on this machine, so its text cannot be read.",
        },
        groupNote: "This locus covers a group of ayat that includes this aya, not the aya on its own.",
        continuation: (bookId, pageId, hasMore, nextPageId) =>
            `The commentary may run on; ${hasMore ? `for the rest of this page use shamela_get_page(book_id=${bookId}, page_id=${pageId}, body_part=2)` : ""}${hasMore && nextPageId !== null ? ", and " : ""}${nextPageId !== null ? `for the next page next_page_id=${nextPageId}` : ""}.`,
        trimmed: (fetched, budgetCut, remainingIds) =>
            `Stopped at ${fetched} ${plural(fetched, "source", "sources")}${budgetCut ? " to stay within the size budget" : ""}; for the rest, call again with \`book_ids=[${remainingIds.join(", ")}]\`.`,
    },
};

/** English agrees the noun with the count; the Arabic counted noun does not move. */
function plural(count: string, one: string, many: string): string {
    return count === "1" ? one : many;
}
