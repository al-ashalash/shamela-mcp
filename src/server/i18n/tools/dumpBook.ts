import type { Slice } from "../labels.js";

/** Wording for shamela_dump_book. Arabic first; English translates it. */
export const dumpBookLabels: Slice<{
    heading: (bookName: string) => string;
    /** Appended to the author's name when the death year is known. */
    deathYear: (year: string) => string;
    summary: (returned: string, chars: string, total: string, start: string) => string;
    category: (name: string) => string;
    /** Said when Shamela numbered the pages itself rather than reading the print. */
    autoNumbered: string;
    /** Where the exported text actually is, since the markdown is only a manifest. */
    textLocation: string;
    /**
     * `structuredContent._display` when the budget ended the export early: prose
     * the reader reads, so it follows the reader's language like the rest.
     * `nextStart` is a page id the caller types back, so it stays in Latin digits.
     */
    display: (returned: string, chars: string, nextStart: string) => string;
}> = {
    ar: {
        heading: (bookName) => `تصدير: ${bookName}`,
        deathYear: (year) => ` — ${year}هـ`,
        summary: (returned, chars, total, start) =>
            `صُدِّرت **${returned}** صفحة (${chars} حرفًا) من أصل ${total}، ابتداءً من الصفحة ${start}.`,
        category: (name) => `التصنيف: ${name}.`,
        autoNumbered:
            "ترقيم الصفحات آليٌّ من الشاملة لا من المطبوع، فاحترز في الإحالة.",
        textLocation:
            "النصّ في `structuredContent.pages` — كل صفحة بمتنها وحاشيتها وعنوان بابها وإحالتها.",
        display: (returned, chars, nextStart) =>
            `صُدِّرت ${returned} صفحة (${chars} حرفًا). أكمِل التصدير بـ start_page_id=${nextStart}.`,
    },
    en: {
        heading: (bookName) => `Export: ${bookName}`,
        deathYear: (year) => ` — d. ${year} AH`,
        summary: (returned, chars, total, start) =>
            `Exported **${returned}** ${plural(returned, "page", "pages")} (${chars} ${plural(chars, "character", "characters")}) out of ${total}, starting at page ${start}.`,
        category: (name) => `Category: ${name}.`,
        autoNumbered:
            "Page numbering is Shamela's own, not the printed edition's; take care when citing.",
        textLocation:
            "The text is in `structuredContent.pages` — each page with its matn (main text), hashiya (footnote), chapter heading and citation.",
        display: (returned, chars, nextStart) =>
            `Exported ${returned} ${plural(returned, "page", "pages")} (${chars} ${plural(chars, "character", "characters")}). Continue the export with start_page_id=${nextStart}.`,
    },
};

/** English agrees the noun with the count; the Arabic counted noun does not move. */
function plural(count: string, one: string, many: string): string {
    return count === "1" ? one : many;
}
