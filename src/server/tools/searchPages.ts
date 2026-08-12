import { z } from "zod";

import { CatalogScope, type Catalog } from "../catalog.js";
import { emptyScope } from "../errors.js";
import type { Helper } from "../helper.js";
import type { PageStore } from "../pages.js";
import {
    OptionsInputShape,
    PaginationInput,
    ResponseFormatInput,
    ScopeInputShape,
    type ScopeInputType,
} from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { noResultsLabels, pageSearchAdvice } from "../i18n/tools/noResults.js";
import { depthLimited, depthNote } from "../i18n/tools/paging.js";
import { searchPagesLabels } from "../i18n/tools/searchPages.js";
import { UNDATED_BOOK_DATE, UNDATED_CENTURY_LABEL } from "../constants.js";

export const searchPagesInputShape = {
    query: z.string().min(1).describe("Arabic search phrase. Multiple words are AND-combined; each can match in body or footnotes."),
    scope: z.object(ScopeInputShape).strict().optional().describe("Restrict the search to specific books, authors, categories, or a Hijri date range. Use shamela_list_categories / shamela_resolve to find IDs."),
    options: z.object(OptionsInputShape).strict().optional().describe("Search options: morphology, wildcards, search_in (body/foot/comment), preserve_*. Defaults to body+foot, no toggles."),
    ...PaginationInput,
    ...ResponseFormatInput,
};
export const searchPagesInput = z.object(searchPagesInputShape).strict();

interface RawHit {
    book_id: number;
    page_id: number;
    matched_in: string[];
    snippet_body: string;
    snippet_foot: string;
    snippet_comment?: string;
}
interface RawCoverage {
    by_book_key: Record<string, number>;
    total_seen: number;
    at_cap: boolean;
    /** "all_results" when every match was counted, "window" when sampled. */
    basis?: "all_results" | "window";
}
interface RawEnvelope {
    query: string;
    normalized_tokens: string[];
    offset: number;
    total_hits: number;
    returned: number;
    has_more: boolean;
    next_offset?: number;
    scope_count: number;
    coverage: RawCoverage;
    results: RawHit[];
}

export interface SearchPageHit {
    book_id: number;
    book_name: string;
    author_name: string | null;
    category: string | null;
    book_date: number | null;
    page_id: number;
    printed_page: string | null;
    matched_in: string[];
    /**
     * False when the book's page file is not on disk — the index answered, but
     * get_page will refuse. Issue #47: a hit that cannot be read must say so.
     */
    readable: boolean;
    snippet_body: string;
    snippet_foot: string;
    snippet_comment?: string;
}

export interface SearchPagesOutput {
    total_hits: number;
    returned: number;
    offset: number;
    has_more: boolean;
    next_offset?: number;
    query: string;
    normalized_tokens: string[];
    scope_count: number;
    /**
     * Present only when nothing matched: what to try next, most likely cause
     * first. A zero here does not mean the wording is absent from the tradition
     * — only from the part of it on this machine — and saying nothing let the
     * reader draw the larger conclusion.
     */
    suggestions?: string[];
    coverage: {
        /**
         * What the rollup below describes: "all_results" when every matching
         * page was counted, "window" when only the fetched page of results was.
         */
        basis: "all_results" | "window";
        /**
         * How many hits the counting pass actually folded in — the population
         * the buckets are drawn from, and not the same number as `total_hits`.
         * On the "all_results" basis a match whose document carries no book
         * number cannot be placed in a book; on the "window" basis only the
         * fetched window was walked at all. The gap between this and
         * `total_hits` is how much of the search the rollup does not speak for,
         * and without it the buckets read as exhaustive.
         */
        total_counted: number;
        /**
         * True when counting stopped at the five-thousand-hit ceiling, so every
         * bucket is a floor and the shares are indicative rather than exact.
         * Only ever true on the "window" basis: a pass that finished had no
         * ceiling to reach.
         */
        capped: boolean;
        by_category: Record<string, number>;
        by_century: Record<string, number>;
        by_book: Record<string, number>;
        by_author: Record<string, number>;
    };
    results: SearchPageHit[];
}

export async function runSearchPages(
    helper: Helper,
    catalog: Catalog,
    pages: PageStore,
    args: z.infer<typeof searchPagesInput>,
): Promise<RenderedResponse<SearchPagesOutput>> {
    let scopeBookKeys: string[] | null = null;
    let scopeCount = -1;
    if (args.scope) {
        const scopeInput: ScopeInputType = {
            ...(args.scope as ScopeInputType),
            downloaded_only: args.scope?.downloaded_only ?? false,
        };
        const resolved = new CatalogScope(catalog).resolveBookIds(scopeInput);
        if (resolved.book_ids.length === 0) throw emptyScope(resolved.diagnostics);
        scopeBookKeys = resolved.book_ids.map(String);
        scopeCount = resolved.book_ids.length;
    }

    const raw = await helper.request<RawEnvelope>("search_pages", {
        query: args.query,
        scope_book_keys: scopeBookKeys,
        max_results: args.limit,
        offset: args.offset,
        options: args.options ?? {},
    });

    // Perf (#24): batch printed-page lookups — one SQLite query per book
    // instead of one per hit (kills the N+1 in `for (hit) await printedPage`).
    // Books are queried in parallel; results are byte-for-byte identical.
    const pageIdsByBook = new Map<number, number[]>();
    for (const hit of raw.results) {
        const list = pageIdsByBook.get(hit.book_id) ?? [];
        list.push(hit.page_id);
        pageIdsByBook.set(hit.book_id, list);
    }
    const printedByBook = new Map<number, Map<number, string | null>>();
    await Promise.all(
        Array.from(pageIdsByBook.entries()).map(async ([bookId, pageIds]) => {
            printedByBook.set(bookId, await pages.printedPages(bookId, pageIds));
        }),
    );

    const enriched: SearchPageHit[] = raw.results.map((hit) => {
        const rec = catalog.bookRecord(hit.book_id);
        return {
            book_id: hit.book_id,
            book_name: rec?.book_name ?? `(unknown ${hit.book_id})`,
            author_name: rec ? catalog.mainAuthorName(rec) : null,
            category: rec ? catalog.categoryPath(rec.book_category)[0] ?? null : null,
            book_date: rec?.book_date ?? null,
            page_id: hit.page_id,
            printed_page: printedByBook.get(hit.book_id)?.get(hit.page_id) ?? null,
            matched_in: hit.matched_in,
            // The same judgement the reading gate makes, so search and read agree.
            readable: catalog.isDownloaded(hit.book_id) || catalog.confirmOnDisk(hit.book_id),
            snippet_body: hit.snippet_body,
            snippet_foot: hit.snippet_foot,
            ...(hit.snippet_comment ? { snippet_comment: hit.snippet_comment } : {}),
        };
    });

    const coverage = enrichCoverage(raw.coverage, catalog);
    const out: SearchPagesOutput = {
        total_hits: raw.total_hits,
        returned: raw.returned,
        offset: raw.offset,
        has_more: raw.has_more,
        ...(raw.next_offset !== undefined ? { next_offset: raw.next_offset } : {}),
        query: raw.query,
        normalized_tokens: raw.normalized_tokens,
        scope_count: scopeCount,
        ...(raw.total_hits === 0
            ? {
                  suggestions: pageSearchAdvice({
                      scopeCount,
                      morphology: args.options?.morphology ?? false,
                      tokenCount: raw.normalized_tokens.length,
                  }),
              }
            : {}),
        coverage,
        results: enriched,
    };
    return renderResponse(out, args.response_format, (data) => {
        const L = pick(searchPagesLabels);
        const lines = [header(1, L.heading(data.query))];
        lines.push(L.summary(num(data.total_hits), num(data.returned), num(data.offset), data.total_hits));
        if (data.scope_count >= 0) lines.push(L.scopeLine(num(data.scope_count), data.scope_count));
        // Only at a genuine zero. `returned === 0` with hits behind it is a
        // reader who paged past the end, which is a different thing to say.
        if (data.suggestions?.length) {
            lines.push("", pick(noResultsLabels).heading);
            for (const s of data.suggestions) lines.push(`- ${s}`);
        }
        lines.push("");
        for (const r of data.results) {
            lines.push(
                `## ${r.book_name}${r.printed_page ? L.printedPage(num(r.printed_page)) : ""} — page_id=${String(r.page_id)}`,
            );
            // The heading is the hit's name — book, printed page, page id — and
            // it is what gets copied whole in order to ask for the page. The
            // #47 warning used to be concatenated onto it, which typeset a
            // sentence as a level-2 heading and carried the caveat into every
            // quotation of the name. It belongs under the heading instead:
            // impossible to miss, attached to the hit it accuses, and out of
            // the identifier. The blank line is load-bearing — without it
            // CommonMark folds the warning into the author line below it and
            // the caveat reads as part of the byline.
            if (!r.readable) lines.push(`**${L.unreadableHit}**`, "");
            if (r.author_name) lines.push(`*${r.author_name}*${r.book_date ? L.bookDate(num(r.book_date)) : ""}`);
            if (r.snippet_body) lines.push("", `> ${r.snippet_body}`);
            if (r.snippet_foot) lines.push("", `> ${L.footLabel}${r.snippet_foot}`);
            lines.push("");
        }
        if (data.has_more) lines.push(L.more(String(data.next_offset)));
        else if (depthLimited(data)) lines.push(depthNote(data));
        return lines.join("\n");
    });
}

export function enrichCoverage(raw: RawCoverage, catalog: Catalog) {
    const byCat: Record<string, number> = {};
    const byCentury: Record<string, number> = {};
    const byBook: Record<string, number> = {};
    const byAuthor: Record<string, number> = {};
    const items = Object.entries(raw.by_book_key);
    items.sort((a, b) => b[1] - a[1]);
    let bookCnt = 0;
    let authorCnt = 0;
    for (const [key, count] of items) {
        const id = parseInt(key, 10);
        if (Number.isNaN(id)) continue;
        const rec = catalog.bookRecord(id);
        if (!rec) continue;
        const catName = catalog.categoryPath(rec.book_category)[0];
        if (catName) byCat[catName] = (byCat[catName] ?? 0) + count;
        if (rec.book_date && rec.book_date !== UNDATED_BOOK_DATE) {
            const cen = String(Math.floor((rec.book_date - 1) / 100) + 1);
            byCentury[cen] = (byCentury[cen] ?? 0) + count;
        } else {
            byCentury[UNDATED_CENTURY_LABEL] = (byCentury[UNDATED_CENTURY_LABEL] ?? 0) + count;
        }
        if (bookCnt < 10) {
            byBook[rec.book_name] = count;
            bookCnt++;
        }
        const author = catalog.mainAuthorName(rec);
        if (author && authorCnt < 10) {
            byAuthor[author] = (byAuthor[author] ?? 0) + count;
            authorCnt++;
        }
    }
    return {
        basis: raw.basis === "window" ? ("window" as const) : ("all_results" as const),
        // The basis says HOW the numbers were arrived at; these two say how
        // much they cover. Both were already on the wire and read into
        // RawCoverage, and dropping them here left a reader of the rollup no
        // way to tell five thousand counted out of eight hundred thousand from
        // a count that finished.
        total_counted: raw.total_seen,
        capped: raw.at_cap,
        by_category: byCat,
        by_century: byCentury,
        by_book: byBook,
        by_author: byAuthor,
    };
}
