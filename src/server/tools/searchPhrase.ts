/**
 * shamela_search_phrase (#19) — exact-phrase and proximity search.
 *
 * The search runs inside the engine. It used to run in two stages outside it —
 * fetch a bounded window of pages where the words merely co-occur, then re-read
 * each page here and keep the ones where the words were actually arranged as
 * asked. The arrangement test was exact but the window was not, so a phrase
 * common enough to fill thousands of pages was answered from the first hundred
 * of them, with a note admitting as much.
 *
 * Shamela's index records where each word sits on a page, not merely that it is
 * there, so the engine can answer adjacency and proximity directly and over the
 * whole library. `total_candidates_scanned` therefore now means every matching
 * page, and `candidate_cap_hit` is false: there is no longer a cap to hit. Both
 * fields are kept so callers reading them do not break.
 */

import { z } from "zod";

import { tokenizeArabic } from "../arabic.js";
import { CatalogScope, type Catalog } from "../catalog.js";
import { badArg, emptyScope } from "../errors.js";
import type { Helper } from "../helper.js";
import type { PageStore } from "../pages.js";
import { PaginationInput, ResponseFormatInput, ScopeInputShape, type ScopeInputType } from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { depthLimited, depthNote } from "../i18n/tools/paging.js";
import { noResultsLabels, pageSearchAdvice } from "../i18n/tools/noResults.js";
import { searchPhraseLabels } from "../i18n/tools/searchPhrase.js";
import { droppedNote } from "../i18n/tools/droppedWords.js";

export const searchPhraseInputShape = {
    query: z
        .string()
        .min(1)
        .describe(
            "Arabic phrase. In mode='phrase' the words must appear consecutively (exact phrase). In mode='near' the words must appear within `distance` words of each other in any order.",
        ),
    mode: z
        .enum(["phrase", "near"])
        .default("phrase")
        .describe("'phrase' = exact consecutive words (default). 'near' = words within `distance` words, any order."),
    distance: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(5)
        .describe("For mode='near': maximum number of words between the query words. Ignored for mode='phrase'."),
    search_in: z
        .array(z.enum(["body", "foot", "comment"]))
        .default(["body", "foot"])
        .describe("Which page sections to verify the phrase in: body (matn), foot (footnotes), comment."),
    scope: z
        .object(ScopeInputShape)
        .strict()
        .optional()
        .describe("Restrict to books/authors/categories/period. Strongly recommended to scope large libraries."),
    ...PaginationInput,
    ...ResponseFormatInput,
};
export const searchPhraseInput = z.object(searchPhraseInputShape).strict();

interface RawHit {
    book_id: number;
    page_id: number;
    matched_in: string[];
    snippet_body: string;
    snippet_foot: string;
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

export interface PhraseHit {
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
    snippet_body: string;
    snippet_foot: string;
}

export interface SearchPhraseOutput {
    mode: "phrase" | "near";
    query: string;
    distance: number;
    /** Every page the engine matched, across the whole scope. */
    total_hits: number;
    /** Kept for callers that read it: now the same exhaustive number. */
    total_candidates_scanned: number;
    /** Kept for callers that read it: always false, there is no cap now. */
    candidate_cap_hit: boolean;
    returned: number;
    offset: number;
    has_more: boolean;
    next_offset?: number;
    /** Present only when nothing matched: what to try next. */
    suggestions?: string[];
    results: PhraseHit[];
    /**
     * Words of the query the engine could not take. It accepts five per search
     * and the rest are dropped, so the results are WIDER than what was asked.
     */
    dropped_tokens?: string[];
}

export async function runSearchPhrase(
    helper: Helper,
    catalog: Catalog,
    pages: PageStore,
    args: z.infer<typeof searchPhraseInput>,
): Promise<RenderedResponse<SearchPhraseOutput>> {
    const qTokens = tokenizeArabic(args.query);
    if (qTokens.length === 0) throw badArg("Query has no searchable Arabic words.");

    // Resolve scope to book keys (same path as search_pages).
    let scopeBookKeys: string[] | null = null;
    if (args.scope) {
        const scopeInput: ScopeInputType = {
            ...(args.scope as ScopeInputType),
            downloaded_only: args.scope?.downloaded_only ?? false,
        };
        const resolved = new CatalogScope(catalog).resolveBookIds(scopeInput);
        if (resolved.book_ids.length === 0) throw emptyScope(resolved.diagnostics);
        scopeBookKeys = resolved.book_ids.map(String);
    }

    const raw = await helper.request<RawEnvelope>("search_phrase", {
        query: args.query,
        mode: args.mode,
        distance: args.distance,
        scope_book_keys: scopeBookKeys,
        max_results: args.limit,
        offset: args.offset,
        options: { search_in: args.search_in },
    });

    const results: PhraseHit[] = [];
    for (const c of raw.results) {
        const rec = catalog.bookRecord(c.book_id);
        const printed = await pages.printedPage(c.book_id, c.page_id);
        results.push({
            book_id: c.book_id,
            book_name: rec?.book_name ?? `(unknown ${c.book_id})`,
            author_name: rec ? catalog.mainAuthorName(rec) : null,
            category: rec ? catalog.categoryPath(rec.book_category)[0] ?? null : null,
            book_date: rec?.book_date ?? null,
            page_id: c.page_id,
            printed_page: printed,
            matched_in: c.matched_in,
            readable: catalog.isDownloaded(c.book_id) || catalog.confirmOnDisk(c.book_id),
            snippet_body: c.snippet_body,
            snippet_foot: c.snippet_foot,
        });
    }

    const out: SearchPhraseOutput = {
        mode: args.mode,
        query: args.query,
        distance: args.distance,
        total_hits: raw.total_hits,
        total_candidates_scanned: raw.total_hits,
        candidate_cap_hit: false,
        returned: results.length,
        offset: args.offset,
        has_more: raw.has_more,
        ...(raw.next_offset !== undefined ? { next_offset: raw.next_offset } : {}),
        ...(raw.total_hits === 0
            ? {
                  suggestions: pageSearchAdvice({
                      scopeCount: scopeBookKeys?.length ?? -1,
                      tokenCount: qTokens.length,
                      toolSpecific: pick(noResultsLabels).phraseLoosen,
                  }),
              }
            : {}),
        results,
    };

    // The engine reports what it could not take; the answer says so.
    if (raw.dropped_tokens?.length) out.dropped_tokens = raw.dropped_tokens;

    return renderResponse(out, args.response_format, (data) => {
        const L = pick(searchPhraseLabels);
        const lines = [
            header(
                1,
                data.mode === "phrase"
                    ? L.phraseHeading(data.query)
                    : L.nearHeading(num(data.distance), data.query, data.distance),
            ),
        ];
        const trimmedQuery = droppedNote(data);
        if (trimmedQuery) lines.push("", `> *${trimmedQuery}*`);
        lines.push(L.summary(num(data.total_hits), num(data.returned), data.total_hits));
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
            if (r.snippet_body) lines.push("", `> ${r.snippet_body}`);
            if (r.snippet_foot) lines.push("", `> ${L.footLabel}${r.snippet_foot}`);
            lines.push("");
        }
        if (data.has_more) lines.push(L.more(String(data.next_offset)));
        else if (depthLimited(data)) lines.push(depthNote(data));
        return lines.join("\n");
    });
}
