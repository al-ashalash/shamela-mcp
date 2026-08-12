import { z } from "zod";

import type { Catalog } from "../catalog.js";
import type { Helper } from "../helper.js";
import { OptionsInputShape, PaginationInput, ResponseFormatInput } from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { depthLimited, depthNote } from "../i18n/tools/paging.js";
import { catalogueAdvice, noResultsLabels } from "../i18n/tools/noResults.js";
import { searchAuthorsLabels } from "../i18n/tools/searchAuthors.js";

export const searchAuthorsInputShape = {
    query: z.string().min(1).describe("Arabic search phrase matched against author name + biography."),
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
    results: SearchAuthorHit[];
}

export async function runSearchAuthors(
    helper: Helper,
    catalog: Catalog,
    args: z.infer<typeof searchAuthorsInput>,
): Promise<RenderedResponse<SearchAuthorsOutput>> {
    const raw = await helper.request<RawEnvelope>("search_authors", {
        query: args.query,
        max_results: args.limit,
        offset: args.offset,
        options: args.options ?? {},
    });
    const results: SearchAuthorHit[] = raw.results.map((h) => {
        const rec = catalog.authorRecord(h.author_id);
        return {
            author_id: h.author_id,
            author_name: rec?.author_name ?? `(unknown ${h.author_id})`,
            death_year: rec?.death_year ?? null,
            book_count: catalog.booksByAuthorId(h.author_id).length,
            snippet: h.snippet,
        };
    });
    const out: SearchAuthorsOutput = {
        total_hits: raw.total_hits, returned: raw.returned, offset: raw.offset,
        has_more: raw.has_more,
        ...(raw.next_offset !== undefined ? { next_offset: raw.next_offset } : {}),
        query: raw.query, normalized_tokens: raw.normalized_tokens,
        // No download line here: the author index is catalogue-wide, so an
        // empty answer is about the spelling of the name.
        ...(raw.total_hits === 0 ? { suggestions: catalogueAdvice("authors") } : {}),
        results,
    };
    return renderResponse(out, args.response_format, (data) => {
        const L = pick(searchAuthorsLabels);
        const lines = [header(1, L.heading(data.query))];
        lines.push(L.summary(num(data.total_hits), num(data.returned)));
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
