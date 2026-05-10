import { z } from "zod";

import type { Helper } from "../helper.js";
import { surahAyaFromId } from "../quran.js";
import { OptionsInputShape, PaginationInput, ResponseFormatInput } from "../schemas.js";
import { arabize, header, renderResponse, type RenderedResponse } from "../format.js";

export const searchQuranInputShape = {
    query: z.string().min(1).describe("Arabic phrase. Searches against the Egyptian إملائي (writing-style) text of all 6,236 verses."),
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
    results: QuranHit[];
}

export async function runSearchQuran(
    helper: Helper,
    args: z.infer<typeof searchQuranInput>,
): Promise<RenderedResponse<SearchQuranOutput>> {
    const raw = await helper.request<RawEnvelope>("search_quran", {
        query: args.query,
        max_results: args.limit,
        offset: args.offset,
        options: args.options ?? {},
    });
    const results: QuranHit[] = raw.results.map((h) => {
        const sa = surahAyaFromId(h.aya_id) ?? { surah: 0, aya: 0, surah_name: "" };
        return {
            aya_id: h.aya_id,
            surah: sa.surah,
            surah_name: sa.surah_name,
            aya: sa.aya,
            body: h.body,
            snippet_body: h.snippet_body,
        };
    });
    const out: SearchQuranOutput = {
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
        const lines = [header(1, `نتائج البحث في القرآن: «${data.query}»`)];
        lines.push(`**${arabize(data.total_hits)}** آية موافقة، عرض ${arabize(data.returned)}.`);
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
