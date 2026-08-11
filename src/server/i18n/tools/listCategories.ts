import type { Slice } from "../labels.js";

/** Wording for shamela_list_categories. Arabic first; English translates it. */
export const listCategoriesLabels: Slice<{
    heading: (total: string) => string;
    /** The line under the heading: how much of the library is on this machine. */
    downloadedTotal: (count: string) => string;
    /** Appended to a category's line when counts were asked for. */
    bookCount: (count: string) => string;
    /** Appended when the user has books of this category downloaded. */
    downloadedCount: (count: string) => string;
    categoryLine: (name: string, id: string, counts: string, downloaded: string) => string;
}> = {
    ar: {
        heading: (total) => `تصنيفات المكتبة الشاملة (${total})`,
        downloadedTotal: (count) => `المنزَّل لديك: ${count} كتاب موزَّعة على التصنيفات أدناه.`,
        bookCount: (count) => `  —  ${count} كتاب`,
        downloadedCount: (count) => `  ·  منزَّل: ${count}`,
        categoryLine: (name, id, counts, downloaded) => `- **${name}** (id=${id})${counts}${downloaded}`,
    },
    en: {
        heading: (total) => `Categories in Maktabah al-Shamela (${total})`,
        downloadedTotal: (count) =>
            `Downloaded on this machine: ${count} ${plural(count, "book", "books")}, spread across the categories below.`,
        bookCount: (count) => `  —  ${count} ${plural(count, "book", "books")}`,
        downloadedCount: (count) => `  ·  downloaded: ${count}`,
        categoryLine: (name, id, counts, downloaded) => `- **${name}** (id=${id})${counts}${downloaded}`,
    },
};

/** English agrees the noun with the count; the Arabic counted noun does not move. */
function plural(count: string, one: string, many: string): string {
    return count === "1" ? one : many;
}
