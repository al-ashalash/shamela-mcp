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
import { arabize, header, renderResponse, type RenderedResponse } from "../format.js";

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
}

export interface SearchTitleHit {
    book_id: number;
    book_name: string;
    author_name: string | null;
    title_id: number;
    title_text: string;
    parent_id: number | null;
}

export interface SearchTitlesOutput {
    total_hits: number;
    returned: number;
    offset: number;
    has_more: boolean;
    next_offset?: number;
    query: string;
    normalized_tokens: string[];
    results: SearchTitleHit[];
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
    const results: SearchTitleHit[] = raw.results.map((h) => {
        const rec = catalog.bookRecord(h.book_id);
        return {
            book_id: h.book_id,
            book_name: rec?.book_name ?? `(unknown ${h.book_id})`,
            author_name: rec ? catalog.mainAuthorName(rec) : null,
            title_id: h.title_id,
            title_text: h.title_text,
            parent_id: h.parent_id ?? null,
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
        results,
    };
    return renderResponse(out, args.response_format, (data) => {
        const lines = [header(1, `نتائج البحث في عناوين الفصول: «${data.query}»`)];
        lines.push(`**${arabize(data.total_hits)}** عنوان موافق، عرض ${arabize(data.returned)} ابتداءً من ${arabize(data.offset)}.`);
        lines.push("");
        for (const r of data.results) {
            lines.push(`- **${r.title_text}** — ${r.book_name}${r.author_name ? ` (${r.author_name})` : ""} — title_id=${r.title_id}`);
        }
        if (data.has_more) lines.push("", `*للمزيد، استخدم \`offset=${data.next_offset}\`.*`);
        return lines.join("\n");
    });
}
