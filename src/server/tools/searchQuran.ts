import { z } from "zod";

import { expandPrefixVariants } from "../arabic.js";
import type { Helper } from "../helper.js";
import { surahAyaFromId } from "../quran.js";
import { OptionsInputShape, PaginationInput, ResponseFormatInput } from "../schemas.js";
import { arabize, header, renderResponse, type RenderedResponse } from "../format.js";

export const searchQuranInputShape = {
    query: z.string().min(1).describe("Arabic phrase. Searches against the Egyptian إملائي (writing-style) text of all 6,236 verses. Single-word queries also match prefixed forms (e.g. «الصبر» matches «بالصبر»); their results are ordered by mushaf position (aya_id), not relevance."),
    options: z
        .object({
            wildcards: OptionsInputShape.wildcards,
        })
        .strict()
        .optional()
        .describe("Currently only the `wildcards` flag is honored. The Quranic index ships pre-built and zero-config."),
    ...PaginationInput,
    ...ResponseFormatInput,
};
export const searchQuranInput = z.object(searchQuranInputShape).strict();

interface RawHit {
    aya_id: number;
    body: string;
    snippet_body: string;
}
interface RawEnvelope {
    query: string;
    normalized_tokens: string[];
    offset: number;
    total_hits: number;
    returned: number;
    has_more: boolean;
    next_offset?: number;
    results: RawHit[];
}

export interface QuranHit {
    aya_id: number;
    surah: number;
    surah_name: string;
    aya: number;
    body: string;
    snippet_body: string;
}

export interface SearchQuranOutput {
    total_hits: number;
    returned: number;
    offset: number;
    has_more: boolean;
    next_offset?: number;
    query: string;
    normalized_tokens: string[];
    /** Expanded (prefix-variant) searches only: false when a variant's result
     *  set could not be fully paged, so total_hits is a lower bound. */
    total_hits_complete?: boolean;
    results: QuranHit[];
}

function toHit(h: RawHit): QuranHit {
    const sa = surahAyaFromId(h.aya_id) ?? { surah: 0, aya: 0, surah_name: "" };
    return {
        aya_id: h.aya_id,
        surah: sa.surah,
        surah_name: sa.surah_name,
        aya: sa.aya,
        body: h.body,
        snippet_body: h.snippet_body,
    };
}

export async function runSearchQuran(
    helper: Helper,
    args: z.infer<typeof searchQuranInput>,
): Promise<RenderedResponse<SearchQuranOutput>> {
    // Prefix-insensitive single-token search (#11). The Quran index
    // stores whole words, so a bare query like "الصبر" misses "بِالصَّبْرِ". For a
    // single non-wildcard token we expand to proclitic/ال variants, run them in
    // parallel, and union by aya_id. Multi-token or wildcard queries fall back
    // to the original single-call behavior.
    const tokens = args.query.trim().split(/\s+/).filter(Boolean);
    const canExpand = tokens.length === 1 && !args.options?.wildcards && tokens[0]!.length >= 2;

    let out: SearchQuranOutput;
    if (canExpand) {
        const variants = expandPrefixVariants(tokens[0]!);
        // The helper clamps max_results to 100 per call, so a single window
        // would under-report frequent words (e.g. «الله» occurs in 2,000+ ayat).
        // Page each variant to exhaustion — bounded by the corpus itself
        // (6,236 ayat → at most 63 pages per variant, far fewer in practice).
        const PAGE_SIZE = 100;
        const MAX_PAGES = 63;
        const fetchVariant = async (v: string): Promise<{ hits: RawHit[]; complete: boolean }> => {
            const hits: RawHit[] = [];
            let offset = 0;
            for (let i = 0; i < MAX_PAGES; i++) {
                let env: RawEnvelope;
                try {
                    env = await helper.request<RawEnvelope>("search_quran", {
                        query: v,
                        max_results: PAGE_SIZE,
                        offset,
                        options: args.options ?? {},
                    });
                } catch {
                    // A failed variant must not fail the whole query, but its
                    // contribution is unknown — flag the union as incomplete.
                    return { hits, complete: false };
                }
                hits.push(...env.results);
                if (!env.has_more || env.results.length === 0) return { hits, complete: true };
                offset = env.next_offset ?? offset + PAGE_SIZE;
            }
            return { hits, complete: false };
        };
        const fetched = await Promise.all(variants.map(fetchVariant));
        const complete = fetched.every((f) => f.complete);
        const merged = new Map<number, RawHit>();
        for (const f of fetched) {
            for (const h of f.hits) {
                if (!merged.has(h.aya_id)) merged.set(h.aya_id, h);
            }
        }
        // Union of variants has no meaningful relevance score, so expanded
        // results are ordered by aya_id (mushaf order) — stable for pagination.
        const sortedIds = Array.from(merged.keys()).sort((a, b) => a - b);
        const total = sortedIds.length;
        const pageIds = sortedIds.slice(args.offset, args.offset + args.limit);
        const results = pageIds.map((id) => toHit(merged.get(id)!));
        const nextOffset = args.offset + args.limit;
        const hasMore = nextOffset < total;
        out = {
            total_hits: total,
            returned: results.length,
            offset: args.offset,
            has_more: hasMore,
            ...(hasMore ? { next_offset: nextOffset } : {}),
            query: args.query,
            normalized_tokens: variants,
            total_hits_complete: complete,
            results,
        };
    } else {
        const raw = await helper.request<RawEnvelope>("search_quran", {
            query: args.query,
            max_results: args.limit,
            offset: args.offset,
            options: args.options ?? {},
        });
        out = {
            total_hits: raw.total_hits,
            returned: raw.returned,
            offset: raw.offset,
            has_more: raw.has_more,
            ...(raw.next_offset !== undefined ? { next_offset: raw.next_offset } : {}),
            query: raw.query,
            normalized_tokens: raw.normalized_tokens,
            results: raw.results.map(toHit),
        };
    }

    return renderResponse(out, args.response_format, (data) => {
        const lines = [header(1, `نتائج البحث في القرآن: «${data.query}»`)];
        lines.push(`**${arabize(data.total_hits)}** آية موافقة، عرض ${arabize(data.returned)}.`);
        if (data.total_hits_complete === false) {
            lines.push("_العدد الإجمالي حدٌّ أدنى: تعذَّر استيفاء نتائج بعض صيغ الكلمة._");
        }
        lines.push("");
        for (const r of data.results) {
            lines.push(`## ${r.surah_name} ${arabize(r.surah)}:${arabize(r.aya)}`);
            lines.push(`> ${r.snippet_body || r.body}`);
            lines.push("");
        }
        if (data.has_more) lines.push(`*للمزيد، استخدم \`offset=${data.next_offset}\`.*`);
        return lines.join("\n");
    });
}
