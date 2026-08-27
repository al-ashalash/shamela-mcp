import type { Slice } from "../labels.js";

/** Wording for shamela_search_pages. Arabic first; English translates it. */
export const searchPagesLabels: Slice<{
    /** Appended to a hit whose book file is missing (issue #47). */
    unreadableHit: string;
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
    /**
     * The count above is inflated: Shamela's index dissolves «يء», so these
     * words share a term with a different lexeme.
     */
    hamzaFold: (words: string[]) => string;
    /**
     * What was SEARCHED, beside what was found.
     *
     * A hit list says what turned up and never how much was looked at, so a
     * thin answer reads as a thin tradition. These are exact local facts, not
     * an estimate about the world.
     */
    searchedLine: (books: string, downloaded: string, scoped: boolean) => string;
    /** Marks a hit as the named scholar's own work, or as someone reporting him. */
    provenancePrimary: string;
    provenanceReport: string;
}> = {
    ar: {
        unreadableHit: "⚠️ ملف الكتاب غير موجود على القرص — لن تنجح قراءته",
        heading: (query) => `نتائج البحث في الصفحات: «${query}»`,
        summary: (total, returned, offset) =>
            `**${total}** صفحة موافقة، عرض ${returned} ابتداءً من ${offset}.`,
        scopeLine: (books) => `النطاق: ${books} كتاب.`,
        printedPage: (page) => ` (ص ${page})`,
        bookDate: (year) => ` — ${year}هـ`,
        footLabel: "_حاشية_: ",
        more: (offset) => `*للمزيد، استخدم \`offset=${offset}\`.*`,
        searchedLine: (books, downloaded, scoped) =>
            scoped
                ? `بُحث في **${books}** كتابًا من ${downloaded} منزَّلًا على هذا الجهاز؛ والفهرس لا يشمل غير المنزَّل.`
                : `بُحث في **${books}** كتابًا — وهي كل المنزَّل على هذا الجهاز؛ والفهرس لا يشمل غيرها.`,
        provenancePrimary: "من كتب صاحب القول",
        provenanceReport: "نقلٌ عنه في كتاب غيره",
        hamzaFold: (words) =>
            `تنبيه: فهرس الشاملة يُذيب الهمزة في «يء»، فيصير ${words.map((w) => `«${w}»`).join(" و")} في الفهرس لفظًا واحدًا مع نظيره بلا همزة (فـ«بريء» تُطابِق «بريّ»). فالعدد أعلاه يشمل اللفظين، ولا يخصّه هذا البحث. وللفصل بينهما استعمل \`shamela_search_exact\` بـ \`preserve_hamza\`، فهو يعيد قراءة نصّ الصفحة نفسه.`,
    },
    en: {
        unreadableHit: "⚠️ the book's file is not on disk — reading it will fail",
        heading: (query) => `Page search results: "${query}"`,
        summary: (total, returned, offset, n) =>
            `**${total}** ${n === 1 ? "page matches" : "pages match"}, showing ${returned} starting at ${offset}.`,
        scopeLine: (books, n) => `Scope: ${books} ${n === 1 ? "book" : "books"}.`,
        printedPage: (page) => ` (p. ${page})`,
        bookDate: (year) => ` — ${year} AH`,
        footLabel: "_hashiya_ (footnote): ",
        more: (offset) => `*For more, use \`offset=${offset}\`.*`,
        searchedLine: (books, downloaded, scoped) =>
            scoped
                ? `Searched **${books}** of the ${downloaded} books downloaded on this machine; the index covers nothing else.`
                : `Searched **${books}** books — everything downloaded on this machine; the index covers nothing else.`,
        provenancePrimary: "the scholar's own work",
        provenanceReport: "reported in another author's book",
        // The caveat is ABOUT two Arabic spellings collapsing into one index
        // term, and no English sentence can say which spellings without
        // printing them; transliterating would hide the very distinction being
        // warned about.
        // i18n:arabic-intentional
        hamzaFold: (words) =>
            `Note: Shamela's index dissolves the hamza in «يء», so ${words.map((w) => `«${w}»`).join(" and ")} share one index term with the hamza-less word («بريء» matches «بريّ»). The count above covers both, not this search alone. To separate them use \`shamela_search_exact\` with \`preserve_hamza\`, which re-reads the page text itself.`,
    },
};
