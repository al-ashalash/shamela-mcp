import type { Slice } from "../labels.js";

/** Wording for shamela_get_book_parts. Arabic first; English translates it. */
export const getBookPartsLabels: Slice<{
    heading: (bookName: string) => string;
    multiVolume: string;
    yes: string;
    no: string;
    totalPages: string;
    partsHeading: string;
    partLine: (part: string, pages: string, first: string, last: string) => string;
    singleVolume: string;
}> = {
    ar: {
        heading: (bookName) => `أجزاء «${bookName}»`,
        multiVolume: "مجلَّد متعدِّد الأجزاء؟",
        yes: "نعم",
        no: "لا",
        totalPages: "عدد الصفحات الإجمالي",
        partsHeading: "الأجزاء",
        partLine: (part, pages, first, last) =>
            `- **${part}**: ${pages} صفحة (page_id ${first}–${last})`,
        singleVolume: "_هذا الكتاب من جزء واحد._",
    },
    en: {
        heading: (bookName) => `Volumes of "${bookName}"`,
        multiVolume: "In several volumes?",
        yes: "Yes",
        no: "No",
        totalPages: "Total pages",
        partsHeading: "Volumes",
        partLine: (part, pages, first, last) =>
            `- **${part}**: ${pages} ${plural(pages, "page", "pages")} (page_id ${first}–${last})`,
        singleVolume: "_This book is in a single volume._",
    },
};

/** English agrees the noun with the count; the Arabic counted noun does not move. */
function plural(count: string, one: string, many: string): string {
    return count === "1" ? one : many;
}
