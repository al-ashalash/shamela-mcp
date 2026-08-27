import type { Slice } from "../labels.js";

/** Wording for shamela_search_boolean. Arabic first; English translates it. */
export const searchBooleanLabels: Slice<{
    /** Appended to a hit whose book file is missing (issue #47). */
    unreadableHit: string;
    /** AND — every term must be on the page. */
    allOf: (terms: string[]) => string;
    /** OR — at least one of the terms must be on the page. */
    anyOf: (terms: string[]) => string;
    /** NOT — none of the terms may be on the page. */
    noneOf: (terms: string[]) => string;
    /** Title line; `parts` is the three operator clauses already joined. */
    heading: (parts: string) => string;
    /**
     * The counted nouns take `n` as well as its rendered form: English has to
     * agree with the number and cannot read it back out of «١٢».
     */
    summary: (total: string, returned: string, offset: string, n: number) => string;
    scope: (books: string, n: number) => string;
    note: (text: string) => string;
    printedPage: (page: string) => string;
    bookDate: (year: string) => string;
    /** Which all_of/any_of terms this page came from. */
    matchedTerms: (terms: string[]) => string;
    /** Prefix on the snippet taken from the footnote. */
    footLabel: string;
    more: (offset: string) => string;
}> = {
    ar: {
        unreadableHit: "⚠️ ملف الكتاب غير موجود على القرص — لن تنجح قراءته",
        allOf: (terms) => `الكل: «${terms.join("» و«")}»`,
        anyOf: (terms) => `أيّ: «${terms.join("» أو «")}»`,
        noneOf: (terms) => `دون: «${terms.join("» و«")}»`,
        heading: (parts) => `بحث منطقي: ${parts}`,
        summary: (total, returned, offset) =>
            `**${total}** صفحة مطابقة، عرض ${returned} ابتداءً من ${offset}.`,
        scope: (books) => `النطاق: ${books} كتاب.`,
        note: (text) => `*ملاحظة: ${text}*`,
        printedPage: (page) => ` (ص ${page})`,
        bookDate: (year) => ` — ${year}هـ`,
        matchedTerms: (terms) => `_وافق_: ${terms.join("، ")}`,
        footLabel: "_حاشية_: ",
        more: (offset) => `*للمزيد، استخدم \`offset=${offset}\`.*`,
    },
    en: {
        unreadableHit: "⚠️ the book's file is not on disk — reading it will fail",
        allOf: (terms) => `All: "${terms.join('" and "')}"`,
        anyOf: (terms) => `Any: "${terms.join('" or "')}"`,
        noneOf: (terms) => `None: "${terms.join('" and "')}"`,
        heading: (parts) => `Boolean search: ${parts}`,
        summary: (total, returned, offset, n) =>
            `**${total}** ${n === 1 ? "page matches" : "pages match"}, showing ${returned} starting at ${offset}.`,
        scope: (books, n) => `Scope: ${books} ${n === 1 ? "book" : "books"}.`,
        note: (text) => `*Note: ${text}*`,
        printedPage: (page) => ` (p. ${page})`,
        bookDate: (year) => ` — ${year} AH`,
        matchedTerms: (terms) => `_Matched_: ${terms.join(", ")}`,
        footLabel: "_hashiya_ (footnote): ",
        more: (offset) => `*For more, use \`offset=${offset}\`.*`,
    },
};
