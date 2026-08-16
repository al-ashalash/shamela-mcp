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
            "حدِّد نطاقًا زمنيًّا واحدًا على الأقل: composed_from/composed_to (سنة تأريخ الكتاب في الشاملة) أو died_from/died_to (سنة وفاة المؤلف الرئيس).",
        composedRange: (from, to) => `سنة تأريخ الكتاب ${from}–${to}هـ`,
        diedRange: (from, to) => `سنة وفاة المؤلف ${from}–${to}هـ`,
        categoryFilter: (name) => `التصنيف ${name}`,
        downloadedOnly: "المنزَّلة فقط",
        filterSep: "، ",
        heading: (scope, total) => `كتب حسب المدة${scope} — ${total}`,
        counts: (returned, total, offset) => `عرض ${returned} من ${total} ابتداءً من ${offset}`,
        downloadedSuffix: " — منزَّل",
        author: "المؤلف",
        died: (year) => ` (ت ${year}هـ)`,
        composedYear: "سنة تأريخ الكتاب في الشاملة (وفاة مؤلِّف الأصل)",
        hijri: (year) => `${year}هـ`,
        category: "التصنيف",
        more: (offset) => `*للمزيد، استخدم \`offset=${offset}\`.*`,
        note: "*تنبيه مهمّ: `book_date` في الشاملة **ليس سنة تأليف الكتاب**، بل سنة تأريخه عندهم، وهي سنة وفاة مؤلِّف الأصل: تطابق سنةَ وفاة المؤلف الرئيس في ٨٬٤٦٧ كتابًا من ٨٬٥٩٣ في الفهرس، والباقي — وهي المختصرات والشروح — تحمل سنة وفاة صاحب الأصل لا المختصِر. فالفرق بين `composed_*` و`died_*` في هذا الفهرس ضيّق، ولا يصلح `composed_*` جوابًا عن «ما أُلِّف في هذا القرن». مرِّر `book_ids` الناتجة إلى scope.book_ids في أدوات البحث.*",
    },
    en: {
        needRange:
            "Give at least one date range: composed_from/composed_to (Shamela's dating year for the book) or died_from/died_to (the year its main author died).",
        composedRange: (from, to) => `dated ${from}–${to} AH`,
        diedRange: (from, to) => `author died ${from}–${to} AH`,
        categoryFilter: (name) => `category ${name}`,
        downloadedOnly: "downloaded only",
        filterSep: ", ",
        heading: (scope, total) => `Books by period${scope} — ${total}`,
        counts: (returned, total, offset) => `Showing ${returned} of ${total}, starting at ${offset}`,
        downloadedSuffix: " — downloaded",
        author: "Author",
        died: (year) => ` (d. ${year} AH)`,
        composedYear: "Shamela dating year (original author's death)",
        hijri: (year) => `${year} AH`,
        category: "Category",
        more: (offset) => `*For more, use \`offset=${offset}\`.*`,
        note: "*Important: Shamela's `book_date` is **not** the year the book was written. It is their dating stamp for the work, and it tracks the original author's death: it equals the main author's death year for 8,467 of the catalogue's 8,593 books, and the remainder — abridgements and commentaries — carry the year the ORIGINAL author died, not the abridger. So `composed_*` and `died_*` separate very little in this catalogue, and `composed_*` will not answer \"what was written in this century\". Pass the resulting `book_ids` to scope.book_ids in the search tools.*",
    },
};
