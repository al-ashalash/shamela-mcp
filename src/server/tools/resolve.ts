import { z } from "zod";

import { normalizeArabic } from "../arabic.js";
import type { Catalog } from "../catalog.js";
import type { Helper } from "../helper.js";
import { RomanIndex } from "../romanIndex.js";
import { isLatinQuery } from "../romanize.js";
import { ResponseFormatInput } from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { resolveLabels } from "../i18n/tools/resolve.js";
import { transliterationLabels } from "../i18n/tools/transliteration.js";
import { droppedNote } from "../i18n/tools/droppedWords.js";

export const resolveInputShape = {
    query: z
        .string()
        .min(1)
        .describe(
            "Name fragment to resolve. Use partial names: 'ابن قدامة' resolves Ibn Qudamah, 'الروضة' resolves books with that word in their title. A name written in Latin letters ('Ibn Qudama', 'al-Mughni') is answered by matching its spelling against the Arabic names, and the answer says so.",
        ),
    type: z
        .enum(["any", "book", "author"])
        .default("any")
        .describe("'book' searches the s_book/ index, 'author' searches s_author/, 'any' (default) searches both."),
    limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(5)
        .describe("Maximum results per type (1–20, default 5)."),
    ...ResponseFormatInput,
};
export const resolveInput = z.object(resolveInputShape).strict();

interface RawHit {
    id: number;
    score: number;
}

export interface ResolveBookHit {
    book_id: number;
    book_name: string;
    author_name: string | null;
    /**
     * On this machine, now. resolve is the tool the descriptions send callers
     * to BEFORE search_pages, and search only covers downloaded books — so an
     * id handed over without this flag was an id a search could silently never
     * hit. Every other id-producing tool already reports it.
     */
    downloaded: boolean;
    /**
     * The engine's confidence, or — on a transliterated answer — the share of
     * the Arabic name's letters the Latin spelling accounts for, where 1 means
     * it left nothing unexplained. The two are never mixed in one response;
     * `transliterated` says which this is.
     */
    score: number;
}

export interface ResolveAuthorHit {
    author_id: number;
    author_name: string;
    death_year: number | null;
    book_count: number;
    score: number;
}

/**
 * How close a catalogue name is to being the thing the query named.
 *
 * The engine's n-gram scores are constant within a query — measured live,
 * every one of 20 hits for «صحيح البخاري» carried exactly 6.3099747 — so
 * ordering collapsed to ascending id, and at the default limit of 5 the tool
 * returned five shurūḥ and selections while صحيح البخاري itself sat at ranks
 * 7 and 14, unseen. Rank 1 of a "confidence"-scored list reads as the best
 * match; here it was merely the oldest id.
 *
 * Tiers, best first — the base name is the part before Shamela's « - »
 * edition suffix, so «صحيح البخاري - ط السلطانية» counts as an exact match
 * for «صحيح البخاري»:
 *   0  the name (or its base) IS the query
 *   1  it begins with the query
 *   2  it contains the query as a whole-word phrase
 *   3  the tokens merely co-occur
 */
export function nameRankTier(query: string, name: string): 0 | 1 | 2 | 3 {
    const q = normalizeArabic(query).replace(/\s+/g, " ").trim();
    const full = normalizeArabic(name).replace(/\s+/g, " ").trim();
    if (!q || !full) return 3;
    const base = full.split(" - ")[0]!.trim();
    if (full === q || base === q) return 0;
    if (full.startsWith(`${q} `) || base.startsWith(`${q} `)) return 1;
    if (` ${full} `.includes(` ${q} `)) return 2;
    return 3;
}

/** Tie order under equal tiers: engine score, then the shorter name, then id. */
function byTier<T extends { tier: number; score: number; len: number; id: number }>(a: T, b: T): number {
    return a.tier - b.tier || b.score - a.score || a.len - b.len || a.id - b.id;
}

/** Candidates fetched from the engine before re-ranking — the input schema's own max. */
const RERANK_POOL = 20;

export interface ResolveOutput {
    query: string;
    normalized_tokens: string[];
    /**
     * The Arabic indexes returned nothing for a query written in Latin
     * letters, so these names were reached by matching that spelling against
     * the catalogue. Candidates to confirm, not index hits.
     */
    transliterated?: boolean;
    books: ResolveBookHit[];
    authors: ResolveAuthorHit[];
    /**
     * Words of the query the engine could not take. It accepts five per search
     * and the rest are dropped, so the results are WIDER than what was asked.
     */
    dropped_tokens?: string[];
}

export async function runResolve(
    helper: Helper,
    catalog: Catalog,
    args: z.infer<typeof resolveInput>,
): Promise<RenderedResponse<ResolveOutput>> {
    // Ask for the full pool even when the caller wants 5: the re-rank cannot
    // lift a canonical title it never received, and «صحيح البخاري» itself sat
    // at rank 7 of the id-ordered list — past the default limit.
    const raw = await helper.request<{
        query: string;
        normalized_tokens: string[];
        dropped_tokens?: string[];
        books: RawHit[];
        authors: RawHit[];
    }>("resolve", { query: args.query, type: args.type, limit: Math.max(args.limit, RERANK_POOL) });

    const books: ResolveBookHit[] = raw.books
        .map((h) => {
            const rec = catalog.bookRecord(h.id);
            const name = rec?.book_name ?? `(unknown ${h.id})`;
            return {
                hit: {
                    book_id: h.id,
                    book_name: name,
                    author_name: rec ? catalog.mainAuthorName(rec) : null,
                    downloaded: catalog.isDownloaded(h.id),
                    score: h.score,
                },
                tier: nameRankTier(args.query, rec?.book_name ?? ""),
                score: h.score,
                len: name.length,
                id: h.id,
            };
        })
        .sort(byTier)
        .slice(0, args.limit)
        .map((x) => x.hit);
    const authors: ResolveAuthorHit[] = raw.authors
        .map((h) => {
            const rec = catalog.authorRecord(h.id);
            const name = rec?.author_name ?? `(unknown ${h.id})`;
            return {
                hit: {
                    author_id: h.id,
                    author_name: name,
                    death_year: rec?.death_year ?? null,
                    book_count: catalog.booksByAuthorId(h.id).length,
                    score: h.score,
                },
                tier: nameRankTier(args.query, rec?.author_name ?? ""),
                score: h.score,
                len: name.length,
                id: h.id,
            };
        })
        .sort(byTier)
        .slice(0, args.limit)
        .map((x) => x.hit);
    // Only after both Arabic indexes have come back empty, and only for a
    // query with no Arabic in it: a spelling guess must never displace a
    // real hit, and a query that already has Arabic in it does not need one.
    const transliterated = !books.length && !authors.length && isLatinQuery(args.query);
    if (transliterated) {
        const index = RomanIndex.for(catalog);
        // How much of the Arabic name the spelling actually reached, which is
        // the only confidence a letter comparison can honestly report.
        const share = (m: { aligned: number; skipped: number }) =>
            Math.round((m.aligned / (m.aligned + m.skipped)) * 100) / 100;
        if (args.type !== "author") {
            for (const h of index.books(args.query).hits.slice(0, args.limit)) {
                const rec = catalog.bookRecord(h.book_id);
                books.push({
                    book_id: h.book_id,
                    book_name: rec?.book_name ?? `(unknown ${h.book_id})`,
                    author_name: rec ? catalog.mainAuthorName(rec) : null,
                    downloaded: catalog.isDownloaded(h.book_id),
                    score: share(h.match),
                });
            }
        }
        if (args.type !== "book") {
            for (const h of index.authors(args.query).hits.slice(0, args.limit)) {
                const rec = catalog.authorRecord(h.author_id);
                authors.push({
                    author_id: h.author_id,
                    author_name: rec?.author_name ?? `(unknown ${h.author_id})`,
                    death_year: rec?.death_year ?? null,
                    book_count: catalog.booksByAuthorId(h.author_id).length,
                    score: share(h.match),
                });
            }
        }
    }
    const out: ResolveOutput = {
        query: raw.query,
        normalized_tokens: raw.normalized_tokens,
        ...(transliterated ? { transliterated: true } : {}),
        books,
        authors,
    };
    // The engine reports what it could not take; the answer says so.
    if (raw.dropped_tokens?.length) out.dropped_tokens = raw.dropped_tokens;

    return renderResponse(out, args.response_format, (data) => {
        const L = pick(resolveLabels);
        const lines: string[] = [header(1, L.heading(data.query))];
        const trimmedQuery = droppedNote(data);
        if (trimmedQuery) lines.push("", `> *${trimmedQuery}*`);
        if (data.transliterated) lines.push("", `> *${pick(transliterationLabels).note}*`);
        if (data.authors.length) {
            lines.push("", header(2, L.authorsHeading(num(data.authors.length))));
            for (const a of data.authors) {
                lines.push(
                    L.authorLine(
                        a.author_name,
                        String(a.author_id),
                        a.death_year ? L.died(num(a.death_year)) : "",
                        num(a.book_count),
                    ),
                );
            }
        }
        if (data.books.length) {
            lines.push("", header(2, L.booksHeading(num(data.books.length))));
            for (const b of data.books) {
                lines.push(
                    L.bookLine(b.book_name, String(b.book_id), b.author_name ? L.byAuthor(b.author_name) : "") +
                        (b.downloaded ? L.downloadedTag : ""),
                );
            }
            // resolve's own description hands these ids to search_pages, and
            // search covers downloaded books only — so a list with nothing
            // downloaded is a list of ids a search will silently never hit,
            // and the reader has to be told before the zero arrives.
            if (data.books.every((b) => !b.downloaded)) lines.push("", `> *${L.noneDownloaded}*`);
        }
        if (!data.books.length && !data.authors.length) {
            lines.push("", data.transliterated ? L.emptyLatin : L.empty);
        }
        return lines.join("\n");
    });
}
