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
        /** The id names no book in master.db. */
        notFound: string;
        notDownloaded: string;
    };
    /** The locus was a marker over several verses, not this one alone. */
    groupNote: string;
    /**
     * The text was cut to start at the verse's own marker. `continuedOnto` is
     * the page id the fetch ran on to when the marker sat at the page's foot,
     * or "" when it did not have to.
     */
    slicedToVerse: (continuedOnto: string) => string;
    /**
     * Which index placed this text, and how far it may be trusted — printed in
     * the rendered channel, not only in structuredContent.
     */
    provenance: (
        source: "service" | "titles" | null,
        confidence: "high" | "medium" | null,
        group: boolean,
    ) => string;
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
            "لا يُجلب نصٌّ إلا حيث تحدَّد موضع الآية: إمّا من فهرس الشاملة المنتقى، وإمّا من فهرسٍ يُبنى من عناوين الكتاب نفسه — وهذا يبلغ أكثر تفاسيرك المنزَّلة لا القليل منها. وما لم يتحدَّد موضعه فيه لم يُجلب، وليس ذلك دليلًا على خلوّه من الكلام على الآية — استعرض التغطية بـ shamela_list_tafsirs_for_aya وتصفَّح الباقي بفهرسه (shamela_get_toc).",
        statusNote: {
            indexPending: "لم يُفهرس هذا الكتاب بعد في هذه الجلسة؛ أعد الطلب ليُستكمل.",
            noEntryForThisAya:
                "الكتاب مشارك في فهرس الشاملة لكن لا مدخل له لهذه الآية، ولا علامة لها في عناوينه؛ لا يُجلب نص بلا تحديد موضع تفاديًا للنسبة الخاطئة.",
            notIndexed:
                "لم نجد ما يحدّد موضع الآية في هذا الكتاب — لا في فهرس الشاملة ولا في عناوينه؛ وليس ذلك دليلًا على خلوّه من تفسيرها، فتصفَّحه بـ shamela_get_toc.",
            notFound: "لا يوجد في فهرس الشاملة كتابٌ بهذا الرقم، فلا شيء يُقرأ منه. تحقّق من الرقم بـ shamela_resolve أو shamela_search_books.",
            notDownloaded: "موضع الآية معلوم في هذا الكتاب لكنه غير منزَّل محليًّا فلا يمكن قراءة نصه.",
        },
        groupNote: "هذا الموضع يغطي مجموعة آيات هذه الآية إحداها، لا الآية وحدها.",
        slicedToVerse: (continuedOnto) =>
            `النصّ يبدأ من موضع الآية في الصفحة لا من أولها، فما قبله تفسير ما سبقها.${continuedOnto ? ` وقد كان الموضع في آخر الصفحة، فوُصِل بالصفحة ${continuedOnto}.` : ""}`,
        provenance: (source, confidence, group) => {
            if (source === "service") return "`الموضع من فهرس الشاملة المنتقى.`";
            const trust =
                confidence === "high"
                    ? "ثقة عالية"
                    : confidence === "medium"
                      ? "ثقة متوسطة"
                      : "ثقة غير مقدَّرة";
            const span = group ? "، وعنوانه يغطي مجموعة آيات هذه إحداها" : "";
            return `\`الموضع من عناوين الكتاب نفسه — ${trust}${span}.\``;
        },
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
            "No text is fetched except where the verse was actually placed — from Shamela's curated index, or from an index built from the book's own chapter headings, which reaches most of your downloaded tafsirs rather than a few of them. A book the verse could not be placed in was not fetched, and that is no proof it says nothing about the verse — review the coverage with shamela_list_tafsirs_for_aya, and browse the rest by table of contents (shamela_get_toc).",
        statusNote: {
            indexPending: "This book has not been indexed yet in this session; ask again to finish it.",
            noEntryForThisAya:
                "The book is in Shamela's index but has no entry for this aya, and no marker for it in its chapter titles; no text is fetched without a fixed locus, to avoid attributing the wrong page.",
            notIndexed:
                "Nothing fixes the place of this aya in this book — neither Shamela's index nor the book's own chapter titles; that is no proof it does not comment on the aya, so browse it with shamela_get_toc.",
            notFound:
                "No book in Shamela's catalogue carries this id, so there is nothing to read from it. Check the id with shamela_resolve or shamela_search_books.",
            notDownloaded:
                "The aya is located in this book, but the book is not downloaded on this machine, so its text cannot be read.",
        },
        groupNote: "This locus covers a group of ayat that includes this aya, not the aya on its own.",
        slicedToVerse: (continuedOnto) =>
            `The text starts at the aya's own marker on the page, not at the top of it: what came before is the commentary on the preceding passage.${continuedOnto ? ` The marker sat at the foot of the page, so the text runs on into page ${continuedOnto}.` : ""}`,
        provenance: (source, confidence, group) => {
            if (source === "service") return "`Placed by Shamela's curated index.`";
            const trust =
                confidence === "high"
                    ? "high confidence"
                    : confidence === "medium"
                      ? "medium confidence"
                      : "confidence not graded";
            const span = group ? ", by a heading covering a group of ayat including this one" : "";
            return `\`Placed by the book's own chapter headings — ${trust}${span}.\``;
        },
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
