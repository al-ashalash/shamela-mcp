import type { Slice } from "../labels.js";

/** Wording for shamela_search_titles. Arabic first; English translates it. */
export const searchTitlesLabels: Slice<{
    heading: (query: string) => string;
    /** How many chapter titles matched, how many are on screen, and where the window starts. */
    summary: (total: string, returned: string, offset: string) => string;
    more: (offset: string) => string;
}> = {
    ar: {
        heading: (query) => `نتائج البحث في عناوين الفصول: «${query}»`,
        summary: (total, returned, offset) =>
            `**${total}** عنوان موافق، عرض ${returned} ابتداءً من ${offset}.`,
        more: (offset) => `*للمزيد، استخدم \`offset=${offset}\`.*`,
    },
    en: {
        heading: (query) => `Chapter-title search results: "${query}"`,
        summary: (total, returned, offset) =>
            `**${total}** titles match, showing ${returned} starting at ${offset}.`,
        more: (offset) => `*For more, use \`offset=${offset}\`.*`,
    },
};
