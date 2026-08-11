import type { Slice } from "../labels.js";

/** Wording for shamela_search_authors. Arabic first; English translates it. */
export const searchAuthorsLabels: Slice<{
    heading: (query: string) => string;
    /** How many authors matched, and how many of them are on screen. */
    summary: (total: string, returned: string) => string;
    /** Fragment after an author's name: the death year, when the catalogue knows it. */
    died: (year: string) => string;
    /** The author's id, and how many of his books the catalogue holds. */
    idLine: (id: string, books: string) => string;
    more: (offset: string) => string;
}> = {
    ar: {
        heading: (query) => `نتائج البحث في فهرس المؤلفين: «${query}»`,
        summary: (total, returned) => `**${total}** مؤلف موافق، عرض ${returned}.`,
        died: (year) => ` (ت ${year}هـ)`,
        idLine: (id, books) => `id=${id} — ${books} كتاب`,
        more: (offset) => `*للمزيد، استخدم \`offset=${offset}\`.*`,
    },
    en: {
        heading: (query) => `Author index search results: "${query}"`,
        summary: (total, returned) =>
            `**${total}** ${plural(total, "author matches", "authors match")}, showing ${returned}.`,
        died: (year) => ` (d. ${year} AH)`,
        idLine: (id, books) => `id=${id} — ${books} ${plural(books, "book", "books")}`,
        more: (offset) => `*For more, use \`offset=${offset}\`.*`,
    },
};

/** English agrees the noun with the count; the Arabic counted noun does not move. */
function plural(count: string, one: string, many: string): string {
    return count === "1" ? one : many;
}
