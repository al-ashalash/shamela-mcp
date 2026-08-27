import { z } from "zod";

import { CatalogScope, type Catalog } from "../catalog.js";
import { emptyScope } from "../errors.js";
import type { Helper } from "../helper.js";
import {
    OptionsInputShape,
    PaginationInput,
    ResponseFormatInput,
    ScopeInputShape,
    type ScopeInputType,
} from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { depthLimited, depthNote } from "../i18n/tools/paging.js";
import { noResultsLabels, pageSearchAdvice } from "../i18n/tools/noResults.js";
import { searchTitlesLabels } from "../i18n/tools/searchTitles.js";
import { droppedNote } from "../i18n/tools/droppedWords.js";

export const searchTitlesInputShape = {
    query: z.string().min(1).describe("Arabic search phrase. Matches against chapter / section title text."),
    scope: z.object(ScopeInputShape).strict().optional().describe("Same scope filter as shamela_search_pages (book_ids, author_ids, category_ids, period_*, downloaded_only)."),
    options: z.object(OptionsInputShape).strict().optional().describe("morphology / wildcards / preserve_* (preserve_* deferred to v1.1). search_in is ignored — titles are a single field."),
    ...PaginationInput,
    ...ResponseFormatInput,
};
export const searchTitlesInput = z.object(searchTitlesInputShape).strict();

interface RawHit {
    book_id: number;
    title_id: number;
    title_text: string;
    parent_id?: number;
}

interface RawEnvelope {
    query: string;
    normalized_tokens: string[];
    offset: number;
    total_hits: number;
    returned: number;
    has_more: boolean;
    next_offset?: number;
    coverage: { by_book_key: Record<string, number>; total_seen: number };
    results: RawHit[];
    dropped_tokens?: string[];
}

export interface SearchTitleHit {
    book_id: number;
    book_name: string;
    author_name: string | null;
    title_id: number;
    title_text: string;
    parent_id: number | null;
    /**
     * False when the book's page file is not on disk (issue #47).
     *
     * A title hit quotes nothing, so nothing can be misattributed on the
     * strength of it — but the tool's own description tells the model to chain
     * into get_book_section, and a warning that arrives before the failed call
     * is worth more than the error that arrives after it.
     */
    readable: boolean;
}

export interface SearchTitlesOutput {
    total_hits: number;
    returned: number;
    offset: number;
    has_more: boolean;
    next_offset?: number;
    query: string;
    normalized_tokens: string[];
    /** Present only when nothing matched: what to try next. */
    suggestions?: string[];
    results: SearchTitleHit[];
    /**
     * Words of the query the engine could not take. It accepts five per search
     * and the rest are dropped, so the results are WIDER than what was asked.
     */
    dropped_tokens?: string[];
}

export async function runSearchTitles(
    helper: Helper,
    catalog: Catalog,
    args: z.infer<typeof searchTitlesInput>,
): Promise<RenderedResponse<SearchTitlesOutput>> {
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
    const raw = await helper.request<RawEnvelope>("search_titles", {
        query: args.query,
        scope_book_keys: scopeBookKeys,
        max_results: args.limit,
        offset: args.offset,
        options: args.options ?? {},
    });
    // Asked once per book: a page of title hits is often many chapters of one
    // book, and confirmOnDisk goes to the filesystem.
    const readableByBook = new Map<number, boolean>();
    const results: SearchTitleHit[] = raw.results.map((h) => {
        const rec = catalog.bookRecord(h.book_id);
        let readable = readableByBook.get(h.book_id);
        if (readable === undefined) {
            readable = catalog.isDownloaded(h.book_id) || catalog.confirmOnDisk(h.book_id);
            readableByBook.set(h.book_id, readable);
        }
        return {
            book_id: h.book_id,
            book_name: rec?.book_name ?? `(unknown ${h.book_id})`,
            author_name: rec ? catalog.mainAuthorName(rec) : null,
            title_id: h.title_id,
            title_text: h.title_text,
            parent_id: h.parent_id ?? null,
            readable,
        };
    });
    const out: SearchTitlesOutput = {
        total_hits: raw.total_hits,
        returned: raw.returned,
        offset: raw.offset,
        has_more: raw.has_more,
        ...(raw.next_offset !== undefined ? { next_offset: raw.next_offset } : {}),
        query: raw.query,
        normalized_tokens: raw.normalized_tokens,
        ...(raw.total_hits === 0
            ? {
                  suggestions: pageSearchAdvice({
                      scopeCount: scopeBookKeys?.length ?? -1,
                      morphology: args.options?.morphology ?? false,
                      tokenCount: raw.normalized_tokens.length,
                      toolSpecific: pick(noResultsLabels).titlesUntitled,
                  }),
              }
            : {}),
        results,
    };
    // The engine reports what it could not take; the answer says so.
    if (raw.dropped_tokens?.length) out.dropped_tokens = raw.dropped_tokens;
    return renderResponse(out, args.response_format, (data) => {
        const L = pick(searchTitlesLabels);
        const lines = [header(1, L.heading(data.query))];
        const trimmedQuery = droppedNote(data);
        if (trimmedQuery) lines.push("", `> *${trimmedQuery}*`);
        lines.push(L.summary(num(data.total_hits), num(data.returned), num(data.offset)));
        if (data.suggestions?.length) {
            lines.push("", pick(noResultsLabels).heading);
            for (const s of data.suggestions) lines.push(`- ${s}`);
        }
        lines.push("");
        for (const r of data.results) {
            // A suffix here rather than a line of its own: the hit is a list
            // item, and a bold line beneath it would end the list.
            lines.push(
                `- **${r.title_text}** — ${r.book_name}${r.author_name ? ` (${r.author_name})` : ""} — title_id=${String(r.title_id)}${r.readable ? "" : L.unreadableTitleHit}`,
            );
        }
        if (data.has_more) lines.push("", L.more(String(data.next_offset)));
        else if (depthLimited(data)) lines.push("", depthNote(data));
        return lines.join("\n");
    });
}
