import { num, pick, type Slice } from "../labels.js";

/**
 * Said when paging runs out of depth before it runs out of matches.
 *
 * A search fetches at most five thousand rows, so a query with more matches
 * than that has an end to its paging that is not the end of its results. The
 * envelope reports both numbers and they disagree; this is the sentence that
 * says why, because a reader who sees `has_more: false` after the last page is
 * entitled to assume they have seen everything, and here they have not.
 *
 * Shared rather than per-tool: seven searches page, all of them stop at the
 * same wall, and the reader should meet the same sentence at each.
 */
export const pagingLabels: Slice<{
    depthLimit: (shown: string, total: string, n: number) => string;
}> = {
    ar: {
        depthLimit: (shown, total) =>
            `*بلغ التصفّح أقصى عمقه: يمكن استعراض ${shown} من أصل ${total} نتيجة. للوصول إلى البقية ضيّق البحث — بنطاق كتب أو تصنيف أو عبارة أدقّ.*`,
    },
    en: {
        depthLimit: (shown, total, n) =>
            `*Paging has reached its limit: ${shown} of ${total} ${n === 1 ? "match" : "matches"} can be browsed. To reach the rest, narrow the search — a book scope, a category, or a more specific phrase.*`,
    },
};

/**
 * Whether paging stopped short of the matches it counted.
 *
 * Derived from the envelope rather than from the ceiling: the helper owns that
 * number, and a copy of it here would be a second place to change and a first
 * place to be wrong.
 */
export function depthLimited(d: Paged): boolean {
    return !d.has_more && d.offset + d.returned < d.total_hits;
}

/** The sentence itself, in the reader's language and digits. */
export function depthNote(d: Paged): string {
    return pick(pagingLabels).depthLimit(num(d.offset + d.returned), num(d.total_hits), d.total_hits);
}

/** What every paging envelope carries, by whatever name its tool gives it. */
export interface Paged {
    has_more: boolean;
    offset: number;
    returned: number;
    total_hits: number;
}
