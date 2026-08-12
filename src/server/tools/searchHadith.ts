/**
 * shamela_search_hadith (#20) — find a hadith by its TEXT (not its
 * numeric key), then surface its cross-collection takhrij.
 *
 * #20: `get_books_for_hadith` needs the numeric key up front, which the
 * user can't know. This composes existing pieces: text-search the downloaded
 * library → read each matching page's `services` for hadith keys → resolve each
 * key's takhrij via `hadeeth.db`. Pure Node composition; no Java change.
 *
 * Note: on libraries with few hadith collections, service keys are sparse — the
 * matched-page snippets still show the editor's printed takhrij ("رواه البخاري…").
 */

import { z } from "zod";

import type { Catalog } from "../catalog.js";
import type { Helper } from "../helper.js";
import type { PageStore } from "../pages.js";
import { PaginationInput, ResponseFormatInput } from "../schemas.js";
import type { ServiceStore } from "../services.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { noResultsLabels, pageSearchAdvice } from "../i18n/tools/noResults.js";
import { searchHadithLabels } from "../i18n/tools/searchHadith.js";

export const searchHadithInputShape = {
    query: z.string().min(1).describe("The hadith text (or a distinctive part of it). AND-combines words across matn + footnotes."),
    max_pages_scanned: z.number().int().min(1).max(50).default(20).describe("How many matching pages to scan for hadith service keys."),
    // Only `limit` — no offset: the tool scans a single window of
    // max_pages_scanned pages, so there is no further page to offset into.
    limit: PaginationInput.limit,
    ...ResponseFormatInput,
};
export const searchHadithInput = z.object(searchHadithInputShape).strict();

interface RawHit {
    book_id: number;
    page_id: number;
    snippet_body: string;
    snippet_foot: string;
}
interface SearchEnvelope {
    total_hits: number;
    results: RawHit[];
}

export interface HadithTakhrijBook {
    book_id: number;
    book_name: string;
    author_name: string | null;
    page_id: number;
    downloaded: boolean;
}
export interface HadithMatch {
    book_id: number;
    book_name: string;
    page_id: number;
    snippet: string;
    /** False when the book's page file is not on disk (issue #47). */
    readable: boolean;
    hadith_keys: number[];
}
export interface SearchHadithOutput {
    query: string;
    total_text_matches: number;
    pages_scanned: number;
    matches: HadithMatch[];
    takhrij: Array<{ hadith_key: number; books: HadithTakhrijBook[] }>;
    /** Present only when nothing matched: what to try next. */
    suggestions?: string[];
}

export async function runSearchHadith(
    helper: Helper,
    catalog: Catalog,
    pages: PageStore,
    services: ServiceStore,
    args: z.infer<typeof searchHadithInput>,
): Promise<RenderedResponse<SearchHadithOutput>> {
    // Stage 1: text-search the downloaded library (matn + footnotes).
    const raw = await helper.request<SearchEnvelope>("search_pages", {
        query: args.query,
        scope_book_keys: null,
        max_results: args.max_pages_scanned,
        offset: 0,
        options: { search_in: ["body", "foot"], skip_coverage: true },
    });

    // Stage 2: read each matching page's service keys.
    const matches: HadithMatch[] = [];
    const allKeys = new Set<number>();
    for (const hit of raw.results) {
        const svc = await pages.getPageServices(hit.book_id, hit.page_id).catch(() => null);
        const keys = svc?.hadeeth ?? [];
        keys.forEach((k) => allKeys.add(k));
        const rec = catalog.bookRecord(hit.book_id);
        matches.push({
            book_id: hit.book_id,
            book_name: rec?.book_name ?? `(unknown ${hit.book_id})`,
            page_id: hit.page_id,
            snippet: hit.snippet_body || hit.snippet_foot,
            // The same judgement search_pages makes about the same hit. This
            // loop is bounded by max_pages_scanned and already awaits per
            // iteration, so no memo is needed here.
            readable: catalog.isDownloaded(hit.book_id) || catalog.confirmOnDisk(hit.book_id),
            hadith_keys: keys,
        });
    }

    // Stage 3: resolve each unique key's cross-collection takhrij.
    const takhrij: Array<{ hadith_key: number; books: HadithTakhrijBook[] }> = [];
    for (const key of allKeys) {
        const hits = await services.getBooksForKey("hadeeth", key).catch(() => []);
        const books: HadithTakhrijBook[] = hits.map((h) => {
            const rec = catalog.bookRecord(h.book_id);
            return {
                book_id: h.book_id,
                book_name: rec?.book_name ?? `(unknown ${h.book_id})`,
                author_name: rec ? catalog.mainAuthorName(rec) : null,
                page_id: h.page_id,
                downloaded: catalog.isDownloaded(h.book_id),
            };
        });
        if (books.length) takhrij.push({ hadith_key: key, books });
    }

    const out: SearchHadithOutput = {
        query: args.query,
        total_text_matches: raw.total_hits,
        pages_scanned: raw.results.length,
        matches: matches.slice(0, args.limit),
        takhrij,
        ...(raw.total_hits === 0
            ? {
                  suggestions: pageSearchAdvice({
                      tokenCount: args.query.trim().split(/\s+/).filter(Boolean).length,
                      toolSpecific: pick(noResultsLabels).hadithFragment,
                  }),
              }
            : {}),
    };

    return renderResponse(out, args.response_format, (data) => {
        const L = pick(searchHadithLabels);
        const lines = [header(1, L.heading(data.query))];
        lines.push(L.summary(num(data.total_text_matches), num(data.pages_scanned)));
        if (data.suggestions?.length) {
            lines.push("", pick(noResultsLabels).heading);
            for (const s of data.suggestions) lines.push(`- ${s}`);
        }
        lines.push("");
        for (const m of data.matches) {
            lines.push(`## ${m.book_name} — page_id=${String(m.page_id)}`);
            // Under the heading, never in it, and the blank line is load-bearing
            // — see searchPages for both reasons.
            if (!m.readable) lines.push(`**${L.unreadableHit}**`, "");
            if (m.snippet) lines.push("", `> ${m.snippet}`);
            // These keys exist to be handed to shamela_get_books_for_hadith,
            // so they are typed back and stay Latin.
            if (m.hadith_keys.length) lines.push(L.hadithKeys(m.hadith_keys.map((k) => String(k))));
            lines.push("");
        }
        if (data.takhrij.length) {
            lines.push(header(2, L.takhrijHeading));
            for (const t of data.takhrij) {
                lines.push(L.keyLine(String(t.hadith_key), t.books.map((b) => `${b.book_name}${b.downloaded ? L.downloadedTag : ""}`)));
            }
        } else if (data.matches.length) {
            // The sentence points at "the snippets above", so it must not be
            // printed when there are none.
            lines.push(L.noKeys);
        }
        return lines.join("\n");
    });
}
