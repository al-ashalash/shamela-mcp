import type { Slice } from "../labels.js";

/** Wording for shamela_search_phrase. Arabic first; English translates it. */
export const searchPhraseLabels: Slice<{
    /** Appended to a hit whose book file is missing (issue #47). */
    unreadableHit: string;
    /** mode='phrase': the words stand consecutively, as written. */
    phraseHeading: (query: string) => string;
    /**
     * mode='near': the words stand within `distance` words of each other.
     *
     * Takes `n` beside the rendered number for the same reason `summary` does,
     * and needs it more: `distance` runs from 1 to 50, so it crosses every band
     * the counted noun has — and the invariant form the rest of this file uses
     * would say «ضمن ١ كلمات» at one end of that range.
     */
    nearHeading: (distance: string, query: string, n: number) => string;
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
        // المعدود يتبع منزلة العدد: مفردٌ للواحد، ومثنًّى للاثنين، وجمعٌ من ٣ إلى
        // ١٠، ومفردٌ منصوب من ١١ فصاعدًا. والمنازل الأربع كلها واقعة في ١..٥٠.
        nearHeading: (distance, query, n) =>
            `بحث بالتقارب اللفظي (ضمن ${
                n === 1 ? "كلمة واحدة" : n === 2 ? "كلمتين" : n <= 10 ? `${distance} كلمات` : `${distance} كلمةً`
            }): «${query}»`,
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
        nearHeading: (distance, query, n) =>
            `Proximity search (within ${distance} ${n === 1 ? "word" : "words"}): "${query}"`,
        summary: (total, returned, n) =>
            `**${total}** ${n === 1 ? "page matches" : "pages match"} across the whole library, showing ${returned}.`,
        printedPage: (page) => ` (p. ${page})`,
        bookDate: (year) => ` — ${year} AH`,
        footLabel: "_hashiya_ (footnote): ",
        more: (offset) => `*For more, use \`offset=${offset}\`.*`,
    },
};
