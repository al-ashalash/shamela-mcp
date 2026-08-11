import type { Slice } from "../labels.js";

/** Wording for shamela_get_book_section. Arabic first; English translates it. */
export const getBookSectionLabels: Slice<{
    /** Stands in for the section's heading when the book gives it none. */
    untitled: string;
    /** The span the section covers, and how many pages that is. */
    range: (start: string, end: string, total: string) => string;
    /** Heading over each page of the section. */
    page: (page: string) => string;
    /**
     * Advice when the char budget stopped the read short of max_pages.
     * `nextStart` is a page_id the reader types back, so it stays in Western digits.
     */
    trimmedByBudget: (shown: string, total: string, nextStart: string) => string;
    /** Advice when max_pages itself stopped the read short. */
    trimmedByMaxPages: (shown: string, total: string, nextStart: string) => string;
}> = {
    ar: {
        untitled: "(بدون عنوان)",
        range: (start, end, total) => `صفحات ${start}–${end} (إجمالي ${total})`,
        page: (page) => `صفحة ${page}`,
        trimmedByBudget: (shown, total, nextStart) =>
            `القسم طويل، فعُرِض ${shown} من ${total} صفحة لضبط الحجم. أكمِل بـ shamela_get_pages_range(start_page_id=${nextStart}) أو ارفع max_pages.`,
        trimmedByMaxPages: (shown, total, nextStart) =>
            `القسم مقطوع عند حدّ max_pages — عُرِض ${shown} من ${total}. أكمِل بـ start_page_id=${nextStart} أو ارفع max_pages.`,
    },
    en: {
        untitled: "(untitled)",
        // A section can be a single page, and `total` is end − start + 1, so the
        // two ends meeting is exactly the case where "Pages 12–12 (1 in all)"
        // would appear. Arabic carries the plural over one page; English cannot.
        range: (start, end, total) =>
            start === end ? `Page ${start}` : `Pages ${start}–${end} (${total} in all)`,
        page: (page) => `Page ${page}`,
        // "this response shows N of M" keeps the verb agreeing with the response,
        // not with N, so a single kept page reads as well as twenty do.
        trimmedByBudget: (shown, total, nextStart) =>
            `The section is long, so this response shows ${shown} of its ${total} pages to keep it a manageable size. Continue with shamela_get_pages_range(start_page_id=${nextStart}) or raise max_pages.`,
        trimmedByMaxPages: (shown, total, nextStart) =>
            `The section was cut at the max_pages limit — ${shown} of ${total} shown. Continue with start_page_id=${nextStart} or raise max_pages.`,
    },
};
