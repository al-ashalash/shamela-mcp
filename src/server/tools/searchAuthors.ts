import { z } from "zod";

import type { Catalog } from "../catalog.js";
import type { Helper } from "../helper.js";
import { OptionsInputShape, PaginationInput, ResponseFormatInput } from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { depthLimited, depthNote } from "../i18n/tools/paging.js";
import { catalogueAdvice, noResultsLabels } from "../i18n/tools/noResults.js";
import { searchAuthorsLabels } from "../i18n/tools/searchAuthors.js";
import { transliterationLabels } from "../i18n/tools/transliteration.js";
import { RERANK_POOL, rankByName } from "./authorRanking.js";
import { COVERAGE_CAP } from "../constants.js";
import { RomanIndex } from "../romanIndex.js";
import { isLatinQuery } from "../romanize.js";
import { droppedNote } from "../i18n/tools/droppedWords.js";

export const searchAuthorsInputShape = {
    query: z.string().min(1).describe("Arabic search phrase matched against author name + biography. A name in Latin letters ('Ibn Qudama', 'al-Ghazali') is matched against the Arabic names by spelling instead, and the answer says so."),
    options: z.object(OptionsInputShape).strict().optional().describe("morphology / wildcards. No scope (authors aren't scoped by category/period)."),
    ...PaginationInput,
    ...ResponseFormatInput,
};
export const searchAuthorsInput = z.object(searchAuthorsInputShape).strict();

interface RawHit { author_id: number; snippet: string; }
interface RawEnvelope {
    query: string; normalized_tokens: string[]; offset: number;
    total_hits: number; returned: number; has_more: boolean; next_offset?: number;
    results: RawHit[];
    dropped_tokens?: string[];
}

export interface SearchAuthorHit {
    author_id: number;
    author_name: string;
    death_year: number | null;
    book_count: number;
    snippet: string;
}

export interface SearchAuthorsOutput {
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
    results: SearchAuthorHit[];
    /**
     * Words of the query the engine could not take. It accepts five per search
     * and the rest are dropped, so the results are WIDER than what was asked.
     */
    dropped_tokens?: string[];
}

export async function runSearchAuthors(
    helper: Helper,
    catalog: Catalog,
    args: z.infer<typeof searchAuthorsInput>,
): Promise<RenderedResponse<SearchAuthorsOutput>> {
    // Re-ranking needs a pool to re-rank. The engine scores biographies, and
    // the name — the thing the caller actually typed — is not a field it has,
    // so the right answer can sit anywhere in the first page or two. Fetch the
    // pool from the top, re-order it here, then cut the window the caller
    // asked for. Past the pool the engine's own order stands: that is deep
    // paging through biographies, not disambiguating a name.
    const windowEnd = args.offset + args.limit;
    const rerank = windowEnd <= RERANK_POOL;
    const raw = await helper.request<RawEnvelope>("search_authors", {
        query: args.query,
        max_results: rerank ? RERANK_POOL : args.limit,
        offset: rerank ? 0 : args.offset,
        options: args.options ?? {},
    });
    let ordered: Array<{ author_id: number; snippet: string }> = rerank
        ? rankByName(
              raw.results.map((h) => ({
                  ...h,
                  author_name: catalog.authorRecord(h.author_id)?.author_name ?? "",
              })),
              args.query,
              raw.normalized_tokens,
          ).slice(args.offset, windowEnd)
        : raw.results;
    // Only once the Arabic index has answered with nothing, and only for a
    // query with no Arabic in it: the spelling guess takes the empty answer,
    // never a good one.
    const transliterated = raw.total_hits === 0 && isLatinQuery(args.query);
    let romanTotal = 0;
    if (transliterated) {
        const hits = RomanIndex.for(catalog).authors(args.query).hits;
        romanTotal = hits.length;
        ordered = hits
            .slice(args.offset, args.offset + args.limit)
            .map((h) => ({ author_id: h.author_id, snippet: "" }));
    }
    const results: SearchAuthorHit[] = ordered.map((h) => {
        const rec = catalog.authorRecord(h.author_id);
        return {
            author_id: h.author_id,
            author_name: rec?.author_name ?? `(unknown ${h.author_id})`,
            death_year: rec?.death_year ?? null,
            book_count: catalog.booksByAuthorId(h.author_id).length,
            snippet: h.snippet,
        };
    });
    // The envelope has to describe the window that was CUT, not the pool that
    // was fetched: with rerank on, raw.returned is up to 100 and raw.offset 0.
    const shown = args.offset + results.length;
    // COVERAGE_CAP is the same 5,000-row ceiling the engine pages against.
    const more = transliterated
        ? shown < romanTotal
        : rerank
          ? shown < Math.min(raw.total_hits, COVERAGE_CAP)
          : raw.has_more;
    const out: SearchAuthorsOutput = {
        total_hits: transliterated ? romanTotal : raw.total_hits,
        returned: results.length,
        offset: args.offset,
        has_more: more,
        ...(more ? { next_offset: shown } : rerank ? {} : raw.next_offset !== undefined ? { next_offset: raw.next_offset } : {}),
        query: raw.query, normalized_tokens: raw.normalized_tokens,
        // No download line here: the author index is catalogue-wide, so an
        // empty answer is about the spelling of the name.
        ...(romanTotal === 0 && raw.total_hits === 0 ? { suggestions: catalogueAdvice("authors") } : {}),
        ...(transliterated ? { transliterated: true } : {}),
        results,
    };
    // The engine reports what it could not take; the answer says so.
    if (raw.dropped_tokens?.length) out.dropped_tokens = raw.dropped_tokens;
    return renderResponse(out, args.response_format, (data) => {
        const L = pick(searchAuthorsLabels);
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
            lines.push(`## ${r.author_name}${r.death_year ? L.died(num(r.death_year)) : ""}`);
            lines.push(L.idLine(String(r.author_id), num(r.book_count)));
            if (r.snippet) lines.push("", `> ${r.snippet}`);
            lines.push("");
        }
        if (data.has_more) lines.push(L.more(String(data.next_offset)));
        else if (depthLimited(data)) lines.push(depthNote(data));
        return lines.join("\n");
    });
}
