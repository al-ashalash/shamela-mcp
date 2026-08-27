import { z } from "zod";

import { expandPrefixVariants, normalizeArabicAya } from "../arabic.js";
import type { Helper } from "../helper.js";
import { surahAyaFromId } from "../quran.js";
import { OptionsInputShape, PaginationInput, ResponseFormatInput } from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { depthLimited, depthNote } from "../i18n/tools/paging.js";
import { searchQuranLabels } from "../i18n/tools/searchQuran.js";
import { droppedNote } from "../i18n/tools/droppedWords.js";

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
    dropped_tokens?: string[];
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
    /**
     * Present only when nothing matched: concrete next steps, so a zero is not
     * mistaken for "this wording is absent from the Qur'an". The Qur'an index
     * stores whole words, and a query can miss for reasons that have nothing to
     * do with the text.
     */
    suggestions?: string[];
    results: QuranHit[];
    /**
     * Words of the query the engine could not take. It accepts five per search
     * and the rest are dropped, so the results are WIDER than what was asked.
     */
    dropped_tokens?: string[];
}

/**
 * Why a Qur'an search can come back empty even for wording that is in the text.
 *
 * The index stores whole surface forms, so an inflected or prefixed form of a
 * word will not match the bare one, and a phrase is matched as tokens rather
 * than as a running string. Saying that beats leaving the reader to conclude
 * the wording is not in the Qur'an at all.
 */
function zeroResultSuggestions(query: string, tokens: string[]): string[] {
    // Prose a person reads, so it follows the reader's language — even though
    // it travels in `structuredContent.suggestions` rather than the markdown.
    // The «ال» surgery below stays here: it is Arabic morphology, not wording.
    const L = pick(searchQuranLabels);
    const out: string[] = [];
    const words = query.trim().split(/\s+/).filter(Boolean);
    if (words.length > 1) {
        out.push(L.tryOneWord(words[0]!, words[words.length - 1]!));
    }
    const first = words[0] ?? query.trim();
    // i18n:arabic-data — «ال» is the Arabic definite article being added to
    // and stripped from the search word. It is the operation, not a label.
    //
    // Offered only when the toggled form was NOT already searched. The engine
    // expands prefix variants, so the ال-toggle is usually among `tokens`
    // already — and the old first suggestion told the reader to retry a form
    // this very call had searched, which provably returns the same zero.
    const searched = new Set(tokens.map((t) => normalizeArabicAya(t.trim())));
    const toggled =
        first.startsWith("ال") && first.length > 3
            ? { form: first.slice(2), had: true }
            : first.length > 2
              ? { form: `ال${first}`, had: false }
              : null;
    if (toggled && !searched.has(normalizeArabicAya(toggled.form))) {
        out.push(toggled.had ? L.tryWithoutAl(toggled.form) : L.tryWithAl(toggled.form));
    }
    out.push(L.tryAnotherForm);
    out.push(L.trySearchPages);
    if (tokens.length) {
        // All of them: five of twelve, unmarked, read as the whole list.
        out.push(L.normalizedAs(tokens.join(L.tokenSeparator)));
    }
    return out;
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
    // Only the multi-word path can lose words to the engine's five-word cap:
    // the expanding path exists precisely for a query of one.
    let droppedTokens: string[] = [];
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
                // Paging can stop before the matches do — the helper fetches at
                // most five thousand rows per search. A variant cut off there
                // has fewer ayat in hand than it matched, and the union built
                // from it must not be called exhaustive.
                if (!env.has_more || env.results.length === 0) {
                    return { hits, complete: hits.length >= env.total_hits };
                }
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
            ...(total === 0 ? { suggestions: zeroResultSuggestions(args.query, variants) } : {}),
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
            ...(raw.total_hits === 0
                ? { suggestions: zeroResultSuggestions(args.query, raw.normalized_tokens) }
                : {}),
            results: raw.results.map(toHit),
        };
        droppedTokens = raw.dropped_tokens ?? [];
    }

    // The engine reports what it could not take; the answer says so.
    if (droppedTokens.length) out.dropped_tokens = droppedTokens;

    return renderResponse(out, args.response_format, (data) => {
        const L = pick(searchQuranLabels);
        const lines = [header(1, L.heading(data.query))];
        const trimmedQuery = droppedNote(data);
        if (trimmedQuery) lines.push("", `> *${trimmedQuery}*`);
        lines.push(L.hits(num(data.total_hits), num(data.returned)));
        if (data.total_hits_complete === false) {
            lines.push(L.lowerBound);
        }
        if (data.suggestions?.length) {
            lines.push("", L.noResults);
            for (const sug of data.suggestions) lines.push(`- ${sug}`);
        }
        lines.push("");
        for (const r of data.results) {
            lines.push(header(2, L.ayaHeading(r.surah_name, num(r.surah), num(r.aya))));
            lines.push(`> ${r.snippet_body || r.body}`);
            lines.push("");
        }
        if (data.has_more) lines.push(L.more(String(data.next_offset)));
        else if (depthLimited(data)) lines.push(depthNote(data));
        return lines.join("\n");
    });
}
