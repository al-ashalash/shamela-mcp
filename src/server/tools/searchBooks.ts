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
import { catalogueAdvice, noResultsLabels } from "../i18n/tools/noResults.js";
import { searchBooksLabels } from "../i18n/tools/searchBooks.js";
import { transliterationLabels } from "../i18n/tools/transliteration.js";
import { UNDATED_BOOK_DATE, UNDATED_CENTURY_LABEL } from "../constants.js";
import { RomanIndex } from "../romanIndex.js";
import { isLatinQuery } from "../romanize.js";
import { droppedNote } from "../i18n/tools/droppedWords.js";

// scope.book_ids isn't useful when searching the catalog; expose the rest.
const SearchBooksScopeShape = {
    author_ids: ScopeInputShape.author_ids,
    category_ids: ScopeInputShape.category_ids,
    period_from: ScopeInputShape.period_from,
    period_to: ScopeInputShape.period_to,
    downloaded_only: ScopeInputShape.downloaded_only,
};

export const searchBooksInputShape = {
    query: z.string().min(1).describe("Arabic search phrase matched against the book name + author + bibliography concatenation. A phrase in Latin letters ('Sahih Muslim', 'al-Mughni') is matched against the Arabic names by spelling instead, and the answer says so."),
    scope: z.object(SearchBooksScopeShape).strict().optional().describe("Optional: restrict to specific authors, categories, periods, or downloaded-only."),
    options: z.object(OptionsInputShape).strict().optional().describe("morphology / wildcards / preserve_*."),
    ...PaginationInput,
    ...ResponseFormatInput,
};
export const searchBooksInput = z.object(searchBooksInputShape).strict();

interface RawHit { book_id: number; snippet: string; }
interface RawEnvelope {
    query: string; normalized_tokens: string[]; offset: number;
    total_hits: number; returned: number; has_more: boolean; next_offset?: number;
    coverage: { by_book_key: Record<string, number>; total_seen: number };
    results: RawHit[];
    dropped_tokens?: string[];
}

export interface SearchBookHit {
    book_id: number;
    book_name: string;
    author_name: string | null;
    category: string | null;
    book_date: number | null;
    downloaded: boolean;
    snippet: string;
}

export interface SearchBooksOutput {
    total_hits: number; returned: number; offset: number;
    has_more: boolean; next_offset?: number;
    query: string; normalized_tokens: string[];
    /** Present only when nothing matched: what to try next. */
    suggestions?: string[];
    /**
     * The index had nothing for a query written in Latin letters, so these
     * were reached by matching that spelling against the catalogue's Arabic
     * names. Candidates to confirm, not index hits.
     */
    transliterated?: boolean;
    coverage: { by_category: Record<string, number>; by_century: Record<string, number> };
    results: SearchBookHit[];
    /**
     * Words of the query the engine could not take. It accepts five per search
     * and the rest are dropped, so the results are WIDER than what was asked.
     */
    dropped_tokens?: string[];
}

export async function runSearchBooks(
    helper: Helper,
    catalog: Catalog,
    args: z.infer<typeof searchBooksInput>,
): Promise<RenderedResponse<SearchBooksOutput>> {
    let scopeBookKeys: string[] | null = null;
    let scopeIds: Set<number> | null = null;
    if (args.scope) {
        const scopeInput: ScopeInputType = {
            ...(args.scope as ScopeInputType),
            downloaded_only: args.scope?.downloaded_only ?? false,
        };
        const resolved = new CatalogScope(catalog).resolveBookIds(scopeInput);
        if (resolved.book_ids.length === 0) throw emptyScope(resolved.diagnostics);
        scopeBookKeys = resolved.book_ids.map(String);
        scopeIds = new Set(resolved.book_ids);
    }
    // Bug #2 workaround: SearchBooks.java applies scope only as a post-fetch
    // filter on `results`, so the helper's `total_hits` / `has_more` /
    // `next_offset` are pre-scope and wrong. When scope is provided we
    // overfetch (helper caps at 5000), trust the scope-filtered `results`
    // array, and re-derive pagination here. Proper fix is in SearchBooks.java —
    // pass scopeBookKeys to QueryBuilder.build using the `id` field — but that
    // needs a JDK to rebuild the helper jar.
    const isScoped = scopeBookKeys !== null;
    const HELPER_FETCH_CAP = 5000;
    const raw = await helper.request<RawEnvelope>("search_books", {
        query: args.query,
        scope_book_keys: scopeBookKeys,
        max_results: isScoped ? HELPER_FETCH_CAP : args.limit,
        offset: isScoped ? 0 : args.offset,
        options: args.options ?? {},
    });
    if (isScoped) {
        const all = raw.results;
        const start = args.offset;
        const end = start + args.limit;
        const slice = all.slice(start, end);
        raw.results = slice;
        raw.total_hits = all.length;
        raw.returned = slice.length;
        raw.offset = start;
        raw.has_more = end < all.length;
        raw.next_offset = raw.has_more ? end : undefined;
    }
    // Only once the Arabic index has answered with nothing, and only for a
    // query with no Arabic in it. A spelling guess must never stand in front
    // of a real hit — it takes the empty answer, not the good one.
    const transliterated = raw.total_hits === 0 && isLatinQuery(args.query);
    let romanKeys: Record<string, number> | null = null;
    if (transliterated) {
        let hits = RomanIndex.for(catalog).books(args.query).hits;
        if (scopeIds) hits = hits.filter((h) => scopeIds!.has(h.book_id));
        const window = hits.slice(args.offset, args.offset + args.limit);
        raw.results = window.map((h) => ({ book_id: h.book_id, snippet: "" }));
        raw.total_hits = hits.length;
        raw.returned = window.length;
        raw.offset = args.offset;
        raw.has_more = args.offset + window.length < hits.length;
        raw.next_offset = raw.has_more ? args.offset + window.length : undefined;
        // Coverage describes every match, not the page of it on screen — the
        // same contract the engine's own coverage carries.
        romanKeys = {};
        for (const h of hits) romanKeys[String(h.book_id)] = 1;
    }
    const byCat: Record<string, number> = {};
    const byCentury: Record<string, number> = {};
    const items = Object.entries(romanKeys ?? raw.coverage.by_book_key).sort((a, b) => b[1] - a[1]);
    for (const [k, c] of items) {
        const id = parseInt(k, 10);
        const rec = !Number.isNaN(id) ? catalog.bookRecord(id) : undefined;
        if (!rec) continue;
        const catName = catalog.categoryPath(rec.book_category)[0];
        if (catName) byCat[catName] = (byCat[catName] ?? 0) + c;
        if (rec.book_date && rec.book_date !== UNDATED_BOOK_DATE) {
            const cen = String(Math.floor((rec.book_date - 1) / 100) + 1);
            byCentury[cen] = (byCentury[cen] ?? 0) + c;
        } else {
            byCentury[UNDATED_CENTURY_LABEL] = (byCentury[UNDATED_CENTURY_LABEL] ?? 0) + c;
        }
    }
    const results: SearchBookHit[] = raw.results.map((h) => {
        const rec = catalog.bookRecord(h.book_id);
        return {
            book_id: h.book_id,
            book_name: rec?.book_name ?? `(unknown ${h.book_id})`,
            author_name: rec ? catalog.mainAuthorName(rec) : null,
            category: rec ? catalog.categoryPath(rec.book_category)[0] ?? null : null,
            book_date: rec?.book_date ?? null,
            downloaded: rec ? catalog.isDownloaded(rec.book_id) : false,
            snippet: h.snippet,
        };
    });
    const out: SearchBooksOutput = {
        total_hits: raw.total_hits, returned: raw.returned, offset: raw.offset,
        has_more: raw.has_more,
        ...(raw.next_offset !== undefined ? { next_offset: raw.next_offset } : {}),
        query: raw.query, normalized_tokens: raw.normalized_tokens,
        // No download line here, unlike the page searches: this index holds
        // every book Shamela knows of, so an empty answer really is about how
        // the name is spelled.
        ...(raw.total_hits === 0 ? { suggestions: catalogueAdvice("books") } : {}),
        ...(transliterated ? { transliterated: true } : {}),
        coverage: { by_category: byCat, by_century: byCentury },
        results,
    };
    // The engine reports what it could not take; the answer says so.
    if (raw.dropped_tokens?.length) out.dropped_tokens = raw.dropped_tokens;
    return renderResponse(out, args.response_format, (data) => {
        const L = pick(searchBooksLabels);
        const lines = [header(1, L.heading(data.query))];
        const trimmedQuery = droppedNote(data);
        if (trimmedQuery) lines.push("", `> *${trimmedQuery}*`);
        lines.push(L.summary(num(data.total_hits), num(data.returned)));
        if (data.transliterated) lines.push("", `> *${pick(transliterationLabels).note}*`);
        if (data.suggestions?.length) {
            lines.push("", pick(noResultsLabels).headingCatalogue);
            for (const s of data.suggestions) lines.push(`- ${s}`);
        }
        lines.push("");
        for (const r of data.results) {
            lines.push(`## ${r.book_name} (id=${r.book_id})${r.downloaded ? L.downloadedSuffix : ""}`);
            if (r.author_name) lines.push(`*${r.author_name}*${r.book_date ? L.bookDate(num(r.book_date)) : ""}`);
            if (r.category) lines.push(`${L.category}: ${r.category}`);
            if (r.snippet) lines.push("", `> ${r.snippet}`);
            lines.push("");
        }
        if (data.has_more) lines.push(L.more(String(data.next_offset)));
        else if (depthLimited(data)) lines.push(depthNote(data));
        return lines.join("\n");
    });
}
