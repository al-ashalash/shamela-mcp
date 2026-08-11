import type { Slice } from "../labels.js";

/** Wording for shamela_get_tafseer_of_aya. Arabic first; English translates it. */
export const getTafseerOfAyaLabels: Slice<{
    heading: (surahName: string, surah: string, aya: string) => string;
    summary: (total: string, returned: string) => string;
    /**
     * The curated-index caveat. Quoted under the summary, and also the value of
     * the `coverage_note` field — it is a sentence the reader reads, not a code
     * a caller switches on, so it follows the reader's language either way.
     */
    coverageNote: string;
    /**
     * One result. `downloaded` arrives as the flag, not as a ready-made
     * fragment: a caller that pre-renders the phrase has already chosen where
     * in the line it sits, and that is not the same slot in both languages.
     */
    bookLine: (bookName: string, author: string, pageId: string, downloaded: boolean) => string;
}> = {
    ar: {
        heading: (surahName, surah, aya) => `تفاسير الآية ${surahName} ${surah}:${aya}`,
        summary: (total, returned) =>
            `**${total}** كتابًا يعلِّق على هذه الآية في فهرس الشاملة، منها ${returned} في النطاق الحالي.`,
        coverageNote: "هذه القائمة من فهرس الخدمة المنتقى (service/tafseer.db) وقد لا يشمل كل تفاسيرك المنزَّلة — كثير من التفاسير لا تحمل علامات آيات على صفحاتها فلا تظهر هنا. لاستيفاء تفاسيرك المنزَّلة، راجع تصنيفات التفسير عبر shamela_list_downloaded_books(category_id=3) و(category_id=4)، ثم تنقّل إليها بفهرسها (shamela_get_toc).",
        bookLine: (bookName, author, pageId, downloaded) =>
            `- **${bookName}**${author ? ` — ${author}` : ""} (page_id=${pageId}${downloaded ? ", منزَّل" : ""})`,
    },
    en: {
        heading: (surahName, surah, aya) => `Tafsirs of aya ${surahName} ${surah}:${aya}`,
        summary: (total, returned) =>
            `**${total}** ${plural(total, "book comments", "books comment")} on this aya in Shamela's index; ${returned} of them in the current scope.`,
        coverageNote:
            "This list comes from the curated service index (service/tafseer.db) and may not include every tafsir you have downloaded — many tafsirs carry no aya markers on their pages, so they do not appear here. To cover all your downloaded tafsirs, go through the tafsir categories with shamela_list_downloaded_books(category_id=3) and (category_id=4), then navigate them by their table of contents (shamela_get_toc).",
        bookLine: (bookName, author, pageId, downloaded) =>
            `- **${bookName}**${author ? ` — ${author}` : ""} (page_id=${pageId}${downloaded ? ", downloaded" : ""})`,
    },
};

/** English agrees the noun with the count; the Arabic counted noun does not move. */
function plural(count: string, one: string, many: string): string {
    return count === "1" ? one : many;
}
