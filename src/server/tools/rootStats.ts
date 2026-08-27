/**
 * shamela_root_stats (#15).
 *
 * Given an Arabic root (e.g. «رحم»، «صبر»، «علم»), report how widely that root
 * spreads across the DOWNLOADED library — a *distribution*, not per-page detail.
 * It runs one morphological (AlKhalil) page search for the root and returns the
 * `coverage` rollup (by category / Hijri century / book / author) plus the exact
 * total number of matching pages.
 *
 * Reuses the existing `search_pages` helper command exactly as searchPages.ts
 * does (options.morphology = true); no Java changes. This tool deliberately
 * discards the snippet payload and keeps only the aggregation.
 *
 * HONESTY — surfaced in the output so callers don't over-read the numbers:
 *   • `total_hits` is EXACT (Lucene `searcher.count`), i.e. the true number of
 *     pages whose morphological forms include the root.
 *   • The DISTRIBUTION is normally exact too: the Java side counts every
 *     matching page by book, reading a per-document book number rather than
 *     the pages themselves. `coverage_basis` says which happened —
 *     "all_results" for the full count, "window" when the pass was abandoned
 *     and the numbers describe a sample instead (then `coverage_capped` is
 *     true and the shares are indicative only).
 *   • Morphology accuracy on classical Arabic is ~0.80, so counts are indicative
 *     of reach, not exact lexical tallies (surfaced in `accuracy_note`).
 *
 * Only the distribution is wanted here, never the page rows, so the request
 * asks for the smallest page of results the helper will return. When the full
 * count is unavailable the old trick is still needed — coverage then follows
 * the fetched window, so the request is repeated with the window opened to the
 * cap. See SearchPages.java / Coverage.java.
 */

import { z } from "zod";

import { CatalogScope, type Catalog } from "../catalog.js";
import { COVERAGE_CAP, UNDATED_BOOK_DATE, UNDATED_CENTURY_LABEL } from "../constants.js";
import { emptyScope } from "../errors.js";
import type { Helper } from "../helper.js";
import { ResponseFormatInput, ScopeInputShape, type ScopeInputType } from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { rootStatsLabels } from "../i18n/tools/rootStats.js";
import { droppedNote } from "../i18n/tools/droppedWords.js";

export const rootStatsInputShape = {
    root: z
        .string()
        .min(1)
        .describe(
            "Arabic root or base word to profile morphologically (e.g. «صبر»، «رحم»، «علم»). Matched via the AlKhalil analyzer, so all derived forms (صابر، يصبر، اصطبار…) are counted, not just the literal string.",
        ),
    scope: z
        .object(ScopeInputShape)
        .strict()
        .optional()
        .describe(
            "Restrict the profile to specific books, authors, categories, or a Hijri date range. Use shamela_list_categories / shamela_resolve to find IDs. Omit to profile the whole downloaded library.",
        ),
    ...ResponseFormatInput,
};
export const rootStatsInput = z.object(rootStatsInputShape).strict();

// --- Raw helper envelope (only the fields this tool consumes) ---------------
interface RawCoverage {
    by_book_key: Record<string, number>;
    total_seen: number;
    at_cap: boolean;
    /** "all_results" when every match was counted, "window" when sampled. */
    basis?: "all_results" | "window";
}
interface RawEnvelope {
    query: string;
    normalized_tokens: string[];
    total_hits: number;
    coverage: RawCoverage;
    dropped_tokens?: string[];
}

interface CountItem {
    name: string;
    count: number;
}
interface BookCountItem {
    book_id: number;
    book_name: string;
    author_name: string | null;
    category: string | null;
    book_date: number | null;
    count: number;
}

export interface RootStatsOutput {
    root: string;
    normalized_tokens: string[];
    /** EXACT number of downloaded pages whose morphological forms include the root. */
    total_hits: number;
    /** Number of hits actually folded into the distribution (≤ COVERAGE_CAP). */
    total_counted: number;
    /** Distinct books that contributed to the (possibly capped) distribution. */
    books_matched: number;
    /**
     * True when the distribution below is a top-COVERAGE_CAP sample rather than
     * the full population (i.e. total_hits exceeded the 5,000 cap). The relative
     * shares stay indicative but the absolute per-bucket counts are floors.
     */
    coverage_capped: boolean;
    coverage_cap: number;
    /** "all_results" when every matching page was counted; "window" when sampled. */
    coverage_basis: "all_results" | "window";
    /** Books the scope resolved to. Absent on an unscoped call — never -1. */
    scope_count?: number;
    accuracy_note: string;
    by_category: CountItem[];
    by_century: CountItem[];
    by_book: BookCountItem[];
    by_author: CountItem[];
    /**
     * Words of the query the engine could not take. It accepts five per search
     * and the rest are dropped, so the results are WIDER than what was asked.
     */
    dropped_tokens?: string[];
}

export async function runRootStats(
    helper: Helper,
    catalog: Catalog,
    args: z.infer<typeof rootStatsInput>,
): Promise<RenderedResponse<RootStatsOutput>> {
    // Resolve scope → book keys, exactly like search_pages.
    let scopeBookKeys: string[] | null = null;
    let scopeCount = -1;
    if (args.scope) {
        const scopeInput: ScopeInputType = {
            ...(args.scope as ScopeInputType),
            downloaded_only: args.scope?.downloaded_only ?? false,
        };
        const resolved = new CatalogScope(catalog).resolveBookIds(scopeInput);
        if (resolved.book_ids.length === 0) throw emptyScope(resolved.diagnostics);
        scopeBookKeys = resolved.book_ids.map(String);
        scopeCount = resolved.book_ids.length;
    }

    // Ask for one row, not five thousand: the distribution comes from the
    // coverage rollup, which now counts every matching page regardless of how
    // many are returned. Highlighting a page that is thrown away unread is the
    // most expensive thing this tool could do.
    let raw = await helper.request<RawEnvelope>("search_pages", {
        query: args.root,
        scope_book_keys: scopeBookKeys,
        max_results: 1,
        offset: 0,
        options: { morphology: true },
    });
    if (raw.coverage.basis !== "all_results") {
        // The full pass did not happen, so coverage describes the fetched
        // window — which one row would make useless. Open the window to the cap
        // and take the sample, saying so in the output.
        raw = await helper.request<RawEnvelope>("search_pages", {
            query: args.root,
            scope_book_keys: scopeBookKeys,
            max_results: 100,
            offset: Math.max(0, COVERAGE_CAP - 100),
            options: { morphology: true },
        });
    }
    const fullCoverage = raw.coverage.basis === "all_results";

    // `accuracy_note` is a sentence a reader reads, not a value a caller
    // branches on — `coverage_basis` is what says which case this is. So the
    // note comes from the slice and follows the language in force, like every
    // other line of prose this tool emits.
    const L = pick(rootStatsLabels);

    const enriched = enrichDistribution(raw.coverage, catalog);
    const out: RootStatsOutput = {
        root: raw.query,
        normalized_tokens: raw.normalized_tokens,
        total_hits: raw.total_hits,
        total_counted: raw.coverage.total_seen,
        books_matched: enriched.booksMatched,
        coverage_capped: raw.coverage.at_cap,
        coverage_cap: COVERAGE_CAP,
        coverage_basis: fullCoverage ? "all_results" : "window",
        // The renderer already guards on >= 0; the payload leaked the raw -1
        // sentinel, where it reads as a real count of minus one book.
        ...(scopeCount >= 0 ? { scope_count: scopeCount } : {}),
        accuracy_note: fullCoverage ? L.accuracyNoteFull : L.accuracyNoteSample,
        by_category: enriched.byCategory,
        by_century: enriched.byCentury,
        by_book: enriched.byBook,
        by_author: enriched.byAuthor,
    };

    // The engine reports what it could not take; the answer says so.
    if (raw.dropped_tokens?.length) out.dropped_tokens = raw.dropped_tokens;

    return renderResponse(out, args.response_format, (data) => {
        const lines = [header(1, L.heading(data.root))];
        const trimmedQuery = droppedNote(data);
        if (trimmedQuery) lines.push("", `> *${trimmedQuery}*`);
        lines.push(
            L.summary(num(data.total_hits), num(data.total_counted), num(data.books_matched)),
        );
        if (data.scope_count !== undefined) lines.push(L.scope(num(data.scope_count)));
        if (data.coverage_capped) {
            lines.push(L.cappedNote(num(data.coverage_cap)));
        }
        lines.push("");

        if (data.by_category.length) {
            lines.push(header(2, L.byCategory));
            for (const c of data.by_category) lines.push(`- ${c.name}: ${num(c.count)}`);
            lines.push("");
        }
        if (data.by_century.length) {
            lines.push(header(2, L.byCentury));
            for (const c of data.by_century) {
                lines.push(
                    c.name === UNDATED_CENTURY_LABEL
                        ? `- ${L.undatedCentury}: ${num(c.count)}`
                        : L.centuryLine(num(c.name), num(c.count)),
                );
            }
            lines.push("");
        }
        if (data.by_book.length) {
            lines.push(header(2, L.topBooks));
            for (const b of data.by_book) {
                const who = b.author_name ? ` — ${b.author_name}` : "";
                const when = b.book_date ? L.bookDate(num(b.book_date)) : "";
                lines.push(`- ${b.book_name}${who}${when}: ${num(b.count)} — book_id=${b.book_id}`);
            }
            lines.push("");
        }
        if (data.by_author.length) {
            lines.push(header(2, L.topAuthors));
            for (const a of data.by_author) lines.push(`- ${a.name}: ${num(a.count)}`);
            lines.push("");
        }

        lines.push(`*${data.accuracy_note}*`);
        return lines.join("\n");
    });
}

/**
 * Enrich the raw by_book_key counts into name-resolved distributions by
 * category / century / book / author. Mirrors searchPages.ts `enrichCoverage`,
 * but returns sorted arrays (not maps) and caps each list to a readable top-N.
 */
function enrichDistribution(raw: RawCoverage, catalog: Catalog) {
    const TOP_N = 15;
    const byCatMap = new Map<string, number>();
    const byCenturyMap = new Map<string, number>();
    const byAuthorMap = new Map<string, number>();
    const bookItems: BookCountItem[] = [];

    const items = Object.entries(raw.by_book_key);
    items.sort((a, b) => b[1] - a[1]); // book-count desc
    let booksMatched = 0;

    for (const [key, count] of items) {
        const id = parseInt(key, 10);
        if (Number.isNaN(id)) continue;
        const rec = catalog.bookRecord(id);
        if (!rec) continue;
        booksMatched++;

        const catName = catalog.categoryPath(rec.book_category)[0];
        if (catName) byCatMap.set(catName, (byCatMap.get(catName) ?? 0) + count);

        if (rec.book_date && rec.book_date !== UNDATED_BOOK_DATE) {
            const cen = String(Math.floor((rec.book_date - 1) / 100) + 1);
            byCenturyMap.set(cen, (byCenturyMap.get(cen) ?? 0) + count);
        } else {
            byCenturyMap.set(UNDATED_CENTURY_LABEL, (byCenturyMap.get(UNDATED_CENTURY_LABEL) ?? 0) + count);
        }

        const author = catalog.mainAuthorName(rec);
        if (author) byAuthorMap.set(author, (byAuthorMap.get(author) ?? 0) + count);

        bookItems.push({
            book_id: id,
            book_name: rec.book_name || `(unknown ${id})`,
            author_name: author,
            category: catName ?? null,
            book_date: rec.book_date ?? null,
            count,
        });
    }

    const byCategory: CountItem[] = Array.from(byCatMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    const byCentury: CountItem[] = Array.from(byCenturyMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => {
            // chronological; the undated bucket (non-numeric) sorts last
            const na = Number(a.name);
            const nb = Number(b.name);
            if (Number.isNaN(na)) return 1;
            if (Number.isNaN(nb)) return -1;
            return na - nb;
        });
    const byAuthor: CountItem[] = Array.from(byAuthorMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_N);
    const byBook = bookItems.slice(0, TOP_N);

    return { booksMatched, byCategory, byCentury, byBook, byAuthor };
}
