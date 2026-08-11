import type { Slice } from "../labels.js";

/** Wording for shamela_books_by_period. Arabic first; English translates it. */
export const booksByPeriodLabels: Slice<{
    /** BAD_ARG guidance when the caller gave neither temporal bound. */
    needRange: string;
    /** Filter phrase: the range of composition years. */
    composedRange: (from: string, to: string) => string;
    /** Filter phrase: the range of main-author death years. */
    diedRange: (from: string, to: string) => string;
    /** Filter phrase: the category, named or (when unknown) by id. */
    categoryFilter: (name: string) => string;
    downloadedOnly: string;
    /** Between the filter phrases inside the heading's parentheses. */
    filterSep: string;
    heading: (scope: string, total: string) => string;
    counts: (returned: string, total: string, offset: string) => string;
    /** Appended to a book's heading when its file is on this machine. */
    downloadedSuffix: string;
    author: string;
    died: (year: string) => string;
    composedYear: string;
    hijri: (year: string) => string;
    category: string;
    more: (offset: string) => string;
    note: string;
}> = {
    ar: {
        needRange:
            "حدِّد نطاقًا زمنيًّا واحدًا على الأقل: composed_from/composed_to (سنة التأليف) أو died_from/died_to (سنة وفاة المؤلف). هذه الأداة تفصل سنة التأليف عن سنة الوفاة.",
        composedRange: (from, to) => `سنة التأليف ${from}–${to}هـ`,
        diedRange: (from, to) => `سنة وفاة المؤلف ${from}–${to}هـ`,
        categoryFilter: (name) => `التصنيف ${name}`,
        downloadedOnly: "المنزَّلة فقط",
        filterSep: "، ",
        heading: (scope, total) => `كتب حسب المدة${scope} — ${total}`,
        counts: (returned, total, offset) => `عرض ${returned} من ${total} ابتداءً من ${offset}`,
        downloadedSuffix: " — منزَّل",
        author: "المؤلف",
        died: (year) => ` (ت ${year}هـ)`,
        composedYear: "سنة التأليف",
        hijri: (year) => `${year}هـ`,
        category: "التصنيف",
        more: (offset) => `*للمزيد، استخدم \`offset=${offset}\`.*`,
        note: "*تنبيه: هذه الأداة تفصل سنة التأليف (book_date) عن سنة وفاة المؤلف الرئيس (death_year)، بخلاف scope.period القديم الذي يخلط بينهما. مرِّر `book_ids` الناتجة إلى scope.book_ids في أدوات البحث.*",
    },
    en: {
        needRange:
            "Give at least one date range: composed_from/composed_to (the year the book was composed) or died_from/died_to (the year its author died). This tool keeps the composition year and the death year apart.",
        composedRange: (from, to) => `composed ${from}–${to} AH`,
        diedRange: (from, to) => `author died ${from}–${to} AH`,
        categoryFilter: (name) => `category ${name}`,
        downloadedOnly: "downloaded only",
        filterSep: ", ",
        heading: (scope, total) => `Books by period${scope} — ${total}`,
        counts: (returned, total, offset) => `Showing ${returned} of ${total}, starting at ${offset}`,
        downloadedSuffix: " — downloaded",
        author: "Author",
        died: (year) => ` (d. ${year} AH)`,
        composedYear: "Year composed",
        hijri: (year) => `${year} AH`,
        category: "Category",
        more: (offset) => `*For more, use \`offset=${offset}\`.*`,
        note: "*Note: this tool keeps the year a book was composed (book_date) separate from its main author's death year (death_year), unlike the old scope.period, which conflates the two. Pass the resulting `book_ids` to scope.book_ids in the search tools.*",
    },
};
