import type { Slice } from "../labels.js";

/** Wording for shamela_search_pages. Arabic first; English translates it. */
export const searchPagesLabels: Slice<{
    heading: (query: string) => string;
    /** How many pages matched, how many are on screen, and where the window starts. */
    /**
     * The counted nouns take `n` as well as its rendered form: English has to
     * agree with the number and cannot read it back out of «١٢».
     */
    summary: (total: string, returned: string, offset: string, n: number) => string;
    /** Present only when the search was restricted to a set of books. */
    scopeLine: (books: string, n: number) => string;
    printedPage: (page: string) => string;
    bookDate: (year: string) => string;
    /** Prefix on the snippet taken from the footnote. */
    footLabel: string;
    more: (offset: string) => string;
}> = {
    ar: {
        heading: (query) => `نتائج البحث في الصفحات: «${query}»`,
        summary: (total, returned, offset) =>
            `**${total}** صفحة موافقة، عرض ${returned} ابتداءً من ${offset}.`,
        scopeLine: (books) => `النطاق: ${books} كتاب.`,
        printedPage: (page) => ` (ص ${page})`,
        bookDate: (year) => ` — ${year}هـ`,
        footLabel: "_حاشية_: ",
        more: (offset) => `*للمزيد، استخدم \`offset=${offset}\`.*`,
    },
    en: {
        heading: (query) => `Page search results: "${query}"`,
        summary: (total, returned, offset, n) =>
            `**${total}** ${n === 1 ? "page matches" : "pages match"}, showing ${returned} starting at ${offset}.`,
        scopeLine: (books, n) => `Scope: ${books} ${n === 1 ? "book" : "books"}.`,
        printedPage: (page) => ` (p. ${page})`,
        bookDate: (year) => ` — ${year} AH`,
        footLabel: "_hashiya_ (footnote): ",
        more: (offset) => `*For more, use \`offset=${offset}\`.*`,
    },
};
