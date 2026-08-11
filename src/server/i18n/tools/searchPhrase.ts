import type { Slice } from "../labels.js";

/** Wording for shamela_search_phrase. Arabic first; English translates it. */
export const searchPhraseLabels: Slice<{
    /** Appended to a hit whose book file is missing (issue #47). */
    unreadableHit: string;
    /** mode='phrase': the words stand consecutively, as written. */
    phraseHeading: (query: string) => string;
    /** mode='near': the words stand within `distance` words of each other. */
    nearHeading: (distance: string, query: string) => string;
    /** The engine searched the whole scope, so the total is exhaustive. */
    /**
     * The counted nouns take `n` as well as its rendered form: English has to
     * agree with the number and cannot read it back out of «١٢».
     */
    summary: (total: string, returned: string, n: number) => string;
    printedPage: (page: string) => string;
    bookDate: (year: string) => string;
    /** Prefix on the snippet taken from the footnote. */
    footLabel: string;
    more: (offset: string) => string;
}> = {
    ar: {
        unreadableHit: "⚠️ ملف الكتاب غير موجود على القرص — لن تنجح قراءته",
        phraseHeading: (query) => `بحث بالعبارة الحرفية: «${query}»`,
        nearHeading: (distance, query) => `بحث بالتقارب اللفظي (ضمن ${distance} كلمات): «${query}»`,
        summary: (total, returned) =>
            `**${total}** صفحة مطابقة في المكتبة كلها، معروض منها ${returned}.`,
        printedPage: (page) => ` (ص ${page})`,
        bookDate: (year) => ` — ${year}هـ`,
        footLabel: "_حاشية_: ",
        more: (offset) => `*للمزيد، استخدم \`offset=${offset}\`.*`,
    },
    en: {
        unreadableHit: "⚠️ the book's file is not on disk — reading it will fail",
        phraseHeading: (query) => `Exact phrase search: "${query}"`,
        nearHeading: (distance, query) => `Proximity search (within ${distance} words): "${query}"`,
        summary: (total, returned, n) =>
            `**${total}** ${n === 1 ? "page matches" : "pages match"} across the whole library, showing ${returned}.`,
        printedPage: (page) => ` (p. ${page})`,
        bookDate: (year) => ` — ${year} AH`,
        footLabel: "_hashiya_ (footnote): ",
        more: (offset) => `*For more, use \`offset=${offset}\`.*`,
    },
};
