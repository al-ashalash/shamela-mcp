import { num, type Slice } from "../labels.js";

/** Wording for shamela_get_pages_range. Arabic first; English translates it. */
export const getPagesRangeLabels: Slice<{
    /** Heading: the book, then the page_id the range opens at. */
    heading: (bookName: string, start: string) => string;
    /** Heading over each page of the range. */
    page: (page: string) => string;
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
        heading: (bookName, start) => `${bookName} — صفحات ${start}+`,
        page: (page) => `صفحة ${page}`,
        more: (nextStart) => `للمزيد، استخدم \`start_page_id=${nextStart}\`.`,
        trimmed: (kept, requested, nextStart) =>
            `النطاق طويل، فاقتُصِر على ${num(kept)} صفحة (من ${num(requested)} مطلوبة) لضبط الحجم. أكمِل بـ start_page_id=${nextStart}.`,
    },
    en: {
        heading: (bookName, start) => `${bookName} — pages ${start}+`,
        page: (page) => `Page ${page}`,
        more: (nextStart) => `For more, use \`start_page_id=${nextStart}\`.`,
        trimmed: (kept, requested, nextStart) =>
            `The range is long, so it was cut to ${num(kept)} ${kept === 1 ? "page" : "pages"} (of ${num(requested)} requested) to keep the size in hand. Continue with start_page_id=${nextStart}.`,
    },
};
