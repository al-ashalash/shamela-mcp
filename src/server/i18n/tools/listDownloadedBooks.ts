import type { Slice } from "../labels.js";

/** Wording for shamela_list_downloaded_books. Arabic first; English translates it. */
export const listDownloadedBooksLabels: Slice<{
    /** The bucket for books whose category id is absent. */
    uncategorised: string;
    /**
     * The listing's title. `category` is the one category the listing was
     * narrowed to, or null when the whole library is listed; each language
     * places it where its own sentence wants it.
     */
    heading: (category: string | null, total: string) => string;
    counts: (returned: string, total: string, offset: string) => string;
    /** The whole-library tally, shown only when no category filter is in force. */
    byCategoryHeading: string;
    /**
     * The tally's bucket for books whose record carries no category. The
     * structured `category_name` stays Arabic for every caller reading it; only
     * the line the reader sees is translated.
     */
    uncategorized: string;
    /**
     * Said under a book's heading when the file is here but its text will not
     * open. It sat inside the heading once, which made a warning sentence part
     * of the book's name every time that name was quoted.
     */
    noPagesWarning: string;
    author: string;
    category: string;
    composedYear: string;
    hijri: (year: string) => string;
    more: (offset: string) => string;
}> = {
    ar: {
        uncategorised: "(غير مصنَّف)",
        heading: (category, total) =>
            category === null
                ? `الكتب المنزَّلة محليًّا (${total})`
                : `الكتب المنزَّلة محليًّا في تصنيف ${category} (${total})`,
        counts: (returned, total, offset) => `عرض ${returned} من ${total} ابتداءً من ${offset}`,
        byCategoryHeading: "توزيع المكتبة على التصنيفات",
        uncategorized: "(غير مصنَّف)",
        noPagesWarning: "⚠️ منزَّل بلا صفحات مقروءة",
        author: "المؤلف",
        category: "التصنيف",
        composedYear: "سنة تأريخ الكتاب في الشاملة (وفاة مؤلِّف الأصل)",
        hijri: (year) => `${year}هـ`,
        more: (offset) => `*للمزيد، استخدم \`offset=${offset}\`.*`,
    },
    en: {
        uncategorised: "(uncategorised)",
        heading: (category, total) =>
            category === null
                ? `Downloaded books (${total})`
                : `Downloaded books in category ${category} (${total})`,
        counts: (returned, total, offset) => `Showing ${returned} of ${total}, starting at ${offset}`,
        byCategoryHeading: "Library by category",
        uncategorized: "(uncategorized)",
        noPagesWarning: "⚠️ downloaded, no readable pages",
        author: "Author",
        category: "Category",
        composedYear: "Shamela dating year (original author's death)",
        hijri: (year) => `${year} AH`,
        more: (offset) => `*For more, use \`offset=${offset}\`.*`,
    },
};
