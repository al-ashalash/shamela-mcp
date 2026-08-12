import type { Slice } from "../labels.js";

/** Wording for shamela_search_titles. Arabic first; English translates it. */
export const searchTitlesLabels: Slice<{
    heading: (query: string) => string;
    /** How many chapter titles matched, how many are on screen, and where the window starts. */
    summary: (total: string, returned: string, offset: string) => string;
    more: (offset: string) => string;
    /**
     * Appended to a hit whose book file is missing (issue #47).
     *
     * Not the search_pages sentence: nothing has been quoted from a title hit,
     * so "reading it will fail" accuses the wrong act. What fails is the next
     * call, and the wording names it.
     */
    unreadableTitleHit: string;
}> = {
    ar: {
        heading: (query) => `نتائج البحث في عناوين الفصول: «${query}»`,
        summary: (total, returned, offset) =>
            `**${total}** عنوان موافق، عرض ${returned} ابتداءً من ${offset}.`,
        more: (offset) => `*للمزيد، استخدم \`offset=${offset}\`.*`,
        unreadableTitleHit: " — ⚠️ ملف الكتاب غير موجود على القرص، فلا يمكن فتح هذا الفصل",
    },
    en: {
        heading: (query) => `Chapter-title search results: "${query}"`,
        summary: (total, returned, offset) =>
            `**${total}** ${plural(total, "title matches", "titles match")}, showing ${returned} starting at ${offset}.`,
        more: (offset) => `*For more, use \`offset=${offset}\`.*`,
        unreadableTitleHit: " — ⚠️ the book's file is not on disk, so this section cannot be opened",
    },
};

/** English agrees the noun with the count; the Arabic counted noun does not move. */
function plural(count: string, one: string, many: string): string {
    return count === "1" ? one : many;
}
