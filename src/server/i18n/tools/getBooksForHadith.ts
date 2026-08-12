import type { Slice } from "../labels.js";

/** Wording for shamela_get_books_for_hadith. Arabic first; English translates it. */
export const getBooksForHadithLabels: Slice<{
    heading: (hadithKey: string) => string;
    /** How many books carry the key at all, and how many survived the scope filter. */
    summary: (total: string, returned: string) => string;
    /** One book that carries the hadith, and the page it sits on. */
    resultLine: (
        bookName: string,
        authorName: string | null,
        pageId: string,
        downloaded: boolean,
    ) => string;
}> = {
    ar: {
        heading: (hadithKey) => `كتب تتضمَّن الحديث ذو المفتاح ${hadithKey}`,
        summary: (total, returned) => `**${total}** كتاب، منها ${returned} ضمن النطاق الحالي.`,
        resultLine: (bookName, authorName, pageId, downloaded) =>
            `- **${bookName}**${authorName ? ` — ${authorName}` : ""} (page_id=${pageId}${downloaded ? ", منزَّل" : ""})`,
    },
    en: {
        heading: (hadithKey) => `Books carrying hadith key ${hadithKey}`,
        summary: (total, returned) =>
            `**${total}** ${plural(total, "book", "books")}, ${returned} of them within the current scope.`,
        resultLine: (bookName, authorName, pageId, downloaded) =>
            `- **${bookName}**${authorName ? ` — ${authorName}` : ""} (page_id=${pageId}${downloaded ? ", downloaded" : ""})`,
    },
};

/** English agrees the noun with the count; the Arabic counted noun does not move. */
function plural(count: string, one: string, many: string): string {
    return count === "1" ? one : many;
}
