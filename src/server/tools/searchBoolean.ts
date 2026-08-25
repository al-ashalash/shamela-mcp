/**
 * shamela_search_boolean (#19) — boolean search with OR and NOT.
 *
 * The regular `shamela_search_pages` AND-combines all query tokens and offers no
 * OR (any-of) or NOT (exclusion) operators. This tool adds both, and the engine
 * answers them:
 *
 *   result = ( ∩ over all_of[i] ) ∩ ( ∪ over any_of[j] ) \ ( ∪ over none_of[k] )
 *
 * where every term is itself AND-searched across its own words, so a multi-word
 * term must co-occur.
 *
 * It used to be assembled here instead, out of one capped sub-search per term
 * whose hit identifiers were intersected, unioned and subtracted in Node. The
 * algebra was right and the inputs were not: each sub-search saw only a window
 * of its term's hits, so an exclusion could only exclude what happened to be in
 * that window, and the tool said so in a note. The index applies all three
 * operators over every page it holds, so the caps and their warnings are gone.
 * `candidate_cap_hit` and `none_of_within_window` are kept and are now always
 * false; `total_in_window` is kept and now counts every matching page.
 */

import { z } from "zod";

import { CatalogScope, type Catalog } from "../catalog.js";
import { MAX_QUERY_TOKENS } from "../constants.js";
import { badArg, emptyScope } from "../errors.js";
import type { Helper } from "../helper.js";
import type { PageStore } from "../pages.js";
import { PaginationInput, ResponseFormatInput, ScopeInputShape, type ScopeInputType } from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { depthLimited, depthNote } from "../i18n/tools/paging.js";
import { noResultsLabels, pageSearchAdvice } from "../i18n/tools/noResults.js";
import { searchBooleanLabels } from "../i18n/tools/searchBoolean.js";
import { droppedNote } from "../i18n/tools/droppedWords.js";

export const searchBooleanInputShape = {
    all_of: z
        .array(z.string().min(1))
        .default([])
        .describe(
            "AND — terms that must ALL appear on the page (each term is itself AND-searched, so a multi-word term must co-occur). Intersection of every term's hit set. Leave empty to rely on any_of.",
        ),
    any_of: z
        .array(z.string().min(1))
        .default([])
        .describe(
            "OR — at least ONE of these terms must appear on the page. Union of every term's hit set, then intersected with the all_of result. Leave empty to rely on all_of.",
        ),
    none_of: z
        .array(z.string().min(1))
        .default([])
        .describe(
            "NOT — pages containing ANY of these terms are excluded. Applied within the returned candidate window (see none_of_within_window in the output). Optional.",
        ),
    scope: z
        .object(ScopeInputShape)
        .strict()
        .optional()
        .describe(
            "Restrict to books/authors/categories/period. STRONGLY recommended: an unscoped boolean search over a large downloaded library only sees a capped window per term and is best-effort. Use shamela_list_categories / shamela_resolve to find IDs.",
        ),
    search_in: z
        .array(z.enum(["body", "foot", "comment"]))
        .default(["body", "foot"])
        .describe("Which page sections each sub-search looks in: body (matn), foot (footnotes), comment. Default ['body','foot']."),
    ...PaginationInput,
    ...ResponseFormatInput,
};
export const searchBooleanInput = z.object(searchBooleanInputShape).strict();

interface RawHit {
    book_id: number;
    page_id: number;
    matched_in: string[];
    snippet_body: string;
    snippet_foot: string;
    matched_terms?: string[];
    snippet_comment?: string;
}
interface RawEnvelope {
    total_hits: number;
    returned: number;
    has_more: boolean;
    next_offset?: number;
    results: RawHit[];
    dropped_tokens?: string[];
}

export interface SubqueryReport {
    term: string;
    role: "all_of" | "any_of" | "none_of";
    total_hits: number;
    window_returned: number;
    cap_hit: boolean;
}

export interface BooleanHit {
    book_id: number;
    book_name: string;
    author_name: string | null;
    category: string | null;
    book_date: number | null;
    page_id: number;
    printed_page: string | null;
    matched_in: string[];
    /** False when the book's page file is not on disk (issue #47). */
    readable: boolean;
    /** Which all_of/any_of terms this page's window hit came from. */
    matched_terms: string[];
    snippet_body: string;
    snippet_foot: string;
    snippet_comment?: string;
}

export interface SearchBooleanOutput {
    all_of: string[];
    any_of: string[];
    none_of: string[];
    scope_count: number;
    /** Pages surviving the boolean algebra within the candidate window, before pagination. */
    total_in_window: number;
    returned: number;
    offset: number;
    has_more: boolean;
    next_offset?: number;
    /** True when any contributing sub-search hit its per-term window cap. */
    candidate_cap_hit: boolean;
    /** True when a none_of term hit its cap: exclusion is window-only, not exhaustive. */
    none_of_within_window: boolean;
    subqueries: SubqueryReport[];
    notes: string[];
    /** Present only when nothing matched: what to try next. */
    suggestions?: string[];
    results: BooleanHit[];
    /**
     * Words of a POSITIVE term the engine could not take. It accepts five per
     * term and drops the rest, so the affected term matched more pages than
     * asked — the intersection can only be wider. An over-long none_of term is
     * refused outright (see runSearchBoolean), so a dropped word here never
     * comes from an exclusion.
     */
    dropped_tokens?: string[];
}

export async function runSearchBoolean(
    helper: Helper,
    catalog: Catalog,
    pages: PageStore,
    args: z.infer<typeof searchBooleanInput>,
): Promise<RenderedResponse<SearchBooleanOutput>> {
    const allOf = args.all_of ?? [];
    const anyOf = args.any_of ?? [];
    const noneOf = args.none_of ?? [];

    if (allOf.length === 0 && anyOf.length === 0) {
        throw badArg("At least one of `all_of` or `any_of` must contain a term.");
    }

    // The engine takes five words per term and DROPS the rest. For a positive
    // term that widens the answer, which the shared note explains; for an
    // EXCLUSION it inverts — a five-word subset of a six-word none_of term
    // matches more pages, so more pages are excluded and pages the caller asked
    // to see silently vanish. There is no correct reading of an over-long
    // exclusion under the cap, so it is refused rather than reinterpreted.
    for (const term of noneOf) {
        const words = term.trim().split(/\s+/).filter(Boolean);
        if (words.length > MAX_QUERY_TOKENS) {
            throw badArg(
                `A none_of term takes at most ${MAX_QUERY_TOKENS} words, and "${term}" has ${words.length}: the engine would drop the rest, which BROADENS the exclusion and silently removes pages you asked to see. Split it into two terms, or keep its ${MAX_QUERY_TOKENS} most distinctive words.`,
            );
        }
    }

    // Resolve scope to book keys (same path as search_pages / search_phrase).
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

    const raw = await helper.request<RawEnvelope>("search_boolean", {
        all_of: allOf,
        any_of: anyOf,
        none_of: noneOf,
        scope_book_keys: scopeBookKeys,
        max_results: args.limit,
        offset: args.offset,
        options: { search_in: args.search_in },
    });

    // Each term's own total, for the per-term report. These are counts the
    // index hands back without walking its matches, so asking is cheap.
    const specs: Array<{ term: string; role: SubqueryReport["role"] }> = [
        ...allOf.map((term) => ({ term, role: "all_of" as const })),
        ...anyOf.map((term) => ({ term, role: "any_of" as const })),
        ...noneOf.map((term) => ({ term, role: "none_of" as const })),
    ];
    const subqueries: SubqueryReport[] = await Promise.all(
        specs.map(async ({ term, role }) => {
            const one = await helper.request<RawEnvelope>("search_pages", {
                query: term,
                scope_book_keys: scopeBookKeys,
                max_results: 1,
                offset: 0,
                options: { search_in: args.search_in, skip_coverage: true },
            });
            return {
                term,
                role,
                total_hits: one.total_hits,
                window_returned: one.total_hits,
                cap_hit: false,
            };
        }),
    );

    const offset = args.offset;
    const hasMore = raw.has_more;
    const nextOffset = raw.next_offset;

    // Batch printed-page lookups: one SQLite query per book (kills the N+1).
    const pageIdsByBook = new Map<number, number[]>();
    for (const h of raw.results) {
        const list = pageIdsByBook.get(h.book_id) ?? [];
        list.push(h.page_id);
        pageIdsByBook.set(h.book_id, list);
    }
    const printedByBook = new Map<number, Map<number, string | null>>();
    await Promise.all(
        Array.from(pageIdsByBook.entries()).map(async ([bookId, pageIds]) => {
            printedByBook.set(bookId, await pages.printedPages(bookId, pageIds));
        }),
    );

    const results: BooleanHit[] = raw.results.map((h) => {
        const rec = catalog.bookRecord(h.book_id);
        return {
            book_id: h.book_id,
            book_name: rec?.book_name ?? `(unknown ${h.book_id})`,
            author_name: rec ? catalog.mainAuthorName(rec) : null,
            category: rec ? catalog.categoryPath(rec.book_category)[0] ?? null : null,
            book_date: rec?.book_date ?? null,
            page_id: h.page_id,
            printed_page: printedByBook.get(h.book_id)?.get(h.page_id) ?? null,
            matched_in: h.matched_in,
            readable: catalog.isDownloaded(h.book_id) || catalog.confirmOnDisk(h.book_id),
            matched_terms: h.matched_terms ?? [],
            snippet_body: h.snippet_body,
            snippet_foot: h.snippet_foot,
            ...(h.snippet_comment ? { snippet_comment: h.snippet_comment } : {}),
        };
    });

    // The set algebra now runs inside the index, over every page it holds, so
    // there is no window left to warn about.
    const notes: string[] = [];

    const out: SearchBooleanOutput = {
        all_of: allOf,
        any_of: anyOf,
        none_of: noneOf,
        scope_count: scopeCount,
        total_in_window: raw.total_hits,
        returned: results.length,
        offset,
        has_more: hasMore,
        ...(nextOffset !== undefined ? { next_offset: nextOffset } : {}),
        candidate_cap_hit: false,
        none_of_within_window: false,
        subqueries,
        notes,
        ...(raw.total_hits === 0
            ? {
                  suggestions: pageSearchAdvice({
                      scopeCount,
                      tokenCount: allOf.length + anyOf.length,
                      toolSpecific: pick(noResultsLabels).booleanLoosen,
                  }),
              }
            : {}),
        results,
    };

    // The engine reports what it could not take; the answer says so.
    if (raw.dropped_tokens?.length) out.dropped_tokens = raw.dropped_tokens;

    return renderResponse(out, args.response_format, (data) => {
        const L = pick(searchBooleanLabels);
        const parts: string[] = [];
        if (data.all_of.length) parts.push(L.allOf(data.all_of));
        if (data.any_of.length) parts.push(L.anyOf(data.any_of));
        if (data.none_of.length) parts.push(L.noneOf(data.none_of));
        const lines = [header(1, L.heading(parts.join(" — ")))];
        const trimmedQuery = droppedNote(data);
        if (trimmedQuery) lines.push("", `> *${trimmedQuery}*`);
        lines.push(L.summary(num(data.total_in_window), num(data.returned), num(data.offset), data.total_in_window));
        if (data.scope_count >= 0) lines.push(L.scope(num(data.scope_count), data.scope_count));
        for (const n of data.notes) lines.push(L.note(n));
        if (data.suggestions?.length) {
            lines.push("", pick(noResultsLabels).heading);
            for (const s of data.suggestions) lines.push(`- ${s}`);
        }
        lines.push("");
        for (const r of data.results) {
            lines.push(
                `## ${r.book_name}${r.printed_page ? L.printedPage(num(r.printed_page)) : ""} — page_id=${String(r.page_id)}`,
            );
            // Under the heading, not inside it — see searchPages for why, and
            // for why the blank line has to be there.
            if (!r.readable) lines.push(`**${L.unreadableHit}**`, "");
            if (r.author_name) lines.push(`*${r.author_name}*${r.book_date ? L.bookDate(num(r.book_date)) : ""}`);
            if (r.matched_terms.length) lines.push(L.matchedTerms(r.matched_terms));
            if (r.snippet_body) lines.push("", `> ${r.snippet_body}`);
            if (r.snippet_foot) lines.push("", `> ${L.footLabel}${r.snippet_foot}`);
            lines.push("");
        }
        // The envelope calls the count total_in_window for history's sake; the
        // window is the whole index now, so it is the total the ceiling is
        // measured against.
        const paged = { ...data, total_hits: data.total_in_window };
        if (data.has_more) lines.push(L.more(String(data.next_offset)));
        else if (depthLimited(paged)) lines.push(depthNote(paged));
        return lines.join("\n");
    });
}
