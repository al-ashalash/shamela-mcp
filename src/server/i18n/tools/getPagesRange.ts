import { num, type Slice } from "../labels.js";

/** Wording for shamela_get_pages_range. Arabic first; English translates it. */
export const getPagesRangeLabels: Slice<{
    /**
     * Heading: the book, then the page_id the range opens at — named as one.
     *
     * It used to read «صفحات ١٥+» over pages headed «صفحة ٢٠» … «صفحة ٢٣»: the
     * same word for two different numbering systems, four lines apart, with the
     * smaller number on top. Whichever number a reader trusted, the other was
     * there to contradict it.
     */
    heading: (bookName: string, startId: string) => string;
    /**
     * Heading over each page: the number printed on it, and the id that fetches
     * it. Both, because they answer different questions — one is what a reader
     * cites, the other is what the next call asks for — and a book that carries
     * no printed numbering has only the second.
     */
    page: (printed: string | null, pageId: string) => string;
    /** Shown when pages remain after the last one returned. */
    more: (nextStart: string) => string;
    /**
     * Shown — in the markdown and in `_display` — when the range was cut short
     * to stay within the character budget: how many pages came back, how many
     * were asked for, and the page_id to resume from.
     */
    trimmed: (kept: number, requested: number, nextStart: string) => string;
}> = {
    ar: {
        heading: (bookName, startId) => `${bookName} — ابتداءً من page_id=${startId}`,
        page: (printed, pageId) => (printed ? `ص ${printed} — page_id=${pageId}` : `page_id=${pageId}`),
        more: (nextStart) => `للمزيد، استخدم \`start_page_id=${nextStart}\`.`,
        trimmed: (kept, requested, nextStart) =>
            `النطاق طويل، فاقتُصِر على ${num(kept)} صفحة (من ${num(requested)} مطلوبة) لضبط الحجم. أكمِل بـ start_page_id=${nextStart}.`,
    },
    en: {
        heading: (bookName, startId) => `${bookName} — from page_id=${startId}`,
        page: (printed, pageId) => (printed ? `p. ${printed} — page_id=${pageId}` : `page_id=${pageId}`),
        more: (nextStart) => `For more, use \`start_page_id=${nextStart}\`.`,
        trimmed: (kept, requested, nextStart) =>
            `The range is long, so it was cut to ${num(kept)} ${kept === 1 ? "page" : "pages"} (of ${num(requested)} requested) to keep the size in hand. Continue with start_page_id=${nextStart}.`,
    },
};
