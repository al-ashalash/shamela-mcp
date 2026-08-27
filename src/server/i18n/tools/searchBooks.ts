import type { Slice } from "../labels.js";

/** Wording for shamela_search_books. Arabic first; English translates it. */
export const searchBooksLabels: Slice<{
    heading: (query: string) => string;
    /** How many books in the catalogue matched, and how many are on screen. */
    summary: (total: string, returned: string) => string;
    /** Appended to a book's heading when its file is on this machine. */
    downloadedSuffix: string;
    /** The year the book was written, after the author's name. */
    bookDate: (year: string) => string;
    category: string;
    more: (offset: string) => string;
}> = {
    ar: {
        heading: (query) => `نتائج البحث في فهرس الكتب: «${query}»`,
        summary: (total, returned) => `**${total}** كتاب موافق، عرض ${returned}.`,
        downloadedSuffix: " — منزَّل",
        bookDate: (year) => ` — ${year}هـ`,
        category: "التصنيف",
        more: (offset) => `*للمزيد، استخدم \`offset=${offset}\`.*`,
    },
    en: {
        heading: (query) => `Book catalogue search results: "${query}"`,
        summary: (total, returned) => `**${total}** ${plural(total, "book matches", "books match")}, showing ${returned}.`,
        downloadedSuffix: " — downloaded",
        bookDate: (year) => ` — ${year} AH`,
        category: "Category",
        more: (offset) => `*For more, use \`offset=${offset}\`.*`,
    },
};

/** English agrees the noun with the count; the Arabic counted noun does not move. */
function plural(count: string, one: string, many: string): string {
    return count === "1" ? one : many;
}
