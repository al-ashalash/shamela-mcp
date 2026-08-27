import type { Slice } from "../labels.js";

/** Wording for shamela_get_book_section. Arabic first; English translates it. */
export const getBookSectionLabels: Slice<{
    /** Stands in for the section's heading when the book gives it none. */
    untitled: string;
    /**
     * The span the section covers, and how many pages that is.
     *
     * The span is in page_ids and says so. It used to read «صفحات ٤٢–٤٧» above
     * six pages headed «صفحة ٥٣» … «صفحة ٥٨» — a stated range containing not one
     * of the pages beneath it, because the two lines were counting in different
     * systems and neither said which.
     */
    range: (start: string, end: string, total: string) => string;
    /**
     * Heading over each page: the number printed on it, and the id that fetches
     * it. Both, because they answer different questions — one is what a reader
     * cites, the other is what the next call asks for — and a book that carries
     * no printed numbering has only the second.
     */
    page: (printed: string | null, pageId: string) => string;
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
        // Opens with the Arabic word, not with `page_id`: a line whose first run
        // is Latin inside an RTL paragraph is the one construction that reorders
        // visually, and every other line in this tool leads with Arabic.
        range: (start, end, total) => `النطاق: page_id ${start}–${end} (${total} صفحة)`,
        page: (printed, pageId) => (printed ? `ص ${printed} — page_id=${pageId}` : `page_id=${pageId}`),
        // No «ارفع max_pages» here: the budget trim runs AFTER the max_pages
        // slice, so raising it changes nothing — the identical response comes
        // back. Only trimmedByMaxPages below may offer it.
        trimmedByBudget: (shown, total, nextStart) =>
            `القسم طويل، فعُرِض ${shown} من ${total} صفحة لضبط الحجم. أكمِل بـ shamela_get_pages_range(start_page_id=${nextStart}).`,
        trimmedByMaxPages: (shown, total, nextStart) =>
            `القسم مقطوع عند حدّ max_pages — عُرِض ${shown} من ${total}. أكمِل بـ start_page_id=${nextStart} أو ارفع max_pages.`,
    },
    en: {
        untitled: "(untitled)",
        // A section can be a single page, and `total` is end − start + 1, so the
        // two ends meeting is exactly the case where "page_id 12–12 (1 page in
        // all)" would appear. Arabic carries the plural over one page; English
        // cannot.
        range: (start, end, total) =>
            start === end
                ? `Range: page_id ${start}`
                : `Range: page_id ${start}–${end} (${total} pages in all)`,
        page: (printed, pageId) => (printed ? `p. ${printed} — page_id=${pageId}` : `page_id=${pageId}`),
        // "this response shows N of M" keeps the verb agreeing with the response,
        // not with N, so a single kept page reads as well as twenty do.
        trimmedByBudget: (shown, total, nextStart) =>
            `The section is long, so this response shows ${shown} of its ${total} pages to keep it a manageable size. Continue with shamela_get_pages_range(start_page_id=${nextStart}).`,
        trimmedByMaxPages: (shown, total, nextStart) =>
            `The section was cut at the max_pages limit — ${shown} of ${total} shown. Continue with start_page_id=${nextStart} or raise max_pages.`,
    },
};
