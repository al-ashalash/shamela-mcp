/**
 * shamela_books_by_period — catalog-only temporal filter that keeps the two
 * date FIELDS as separate AND-combined constraints (#21):
 *
 *   - composed_from / composed_to  → book.book_date      (Shamela's dating year)
 *   - died_from    / died_to       → author.death_year   (MAIN AUTHOR's death)
 *
 * The legacy `scope.period_from`/`period_to` (see CatalogScope.resolveBookIds)
 * unions the two into one range; this tool intersects them, so a book matches
 * only if it satisfies ALL provided constraints at once (dating-year AND
 * death-year AND category AND downloaded).
 *
 * WHAT book_date IS NOT — measured, 15 Aug 2026, against this machine's
 * master.db: it is NOT the year the book was written. It equals the main
 * author's death year for **8,467 of 8,593** catalogue books, and the 126
 * exceptions are abridgements and commentaries carrying the ORIGINAL author's
 * death year (id 171 «صحيح الترغيب والترهيب» → 656, المنذري's death, not
 * الألباني's). Books published posthumously carry the death year too.
 *
 * So the two fields are separate, but they are not the two temporal
 * DIMENSIONS this file used to claim: neither answers "what was composed in
 * this century". Every label, description and note now says so, because a
 * filter that reads as a composition filter and is not one produces
 * confident, wrong period claims — the worst kind for an argument that rests
 * on when something was written.
 *
 * Pure Node / master.db logic — deterministic, read-only, no Java helper.
 * Returns matching book_ids the caller then passes as scope.book_ids to the
 * search tools.
 */

import { z } from "zod";

import type { Catalog } from "../catalog.js";
import type { PageStore } from "../pages.js";
import { badArg } from "../errors.js";
import { ResponseFormatInput, PaginationInput } from "../schemas.js";
import { renderResponse, type RenderedResponse, header } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { booksByPeriodLabels } from "../i18n/tools/booksByPeriod.js";

export const booksByPeriodInputShape = {
    composed_from: z
        .number()
        .int()
        .min(1)
        .max(2000)
        .optional()
        .describe(
            "Hijri year, inclusive LOWER bound on book.book_date — Shamela's DATING year for the work, which is NOT the year it was written: it tracks the original author's death year and equals the main author's death year for 8,467 of 8,593 catalogue books. Use died_from for the main author's death. Pair with composed_to.",
        ),
    composed_to: z
        .number()
        .int()
        .min(1)
        .max(2000)
        .optional()
        .describe(
            "Hijri year, inclusive UPPER bound on book.book_date — Shamela's dating year for the work, not the year it was written. Pair with composed_from.",
        ),
    died_from: z
        .number()
        .int()
        .min(1)
        .max(2000)
        .optional()
        .describe(
            "Hijri year, inclusive LOWER bound on the MAIN AUTHOR's death year (author.death_year). This is the dimension the catalogue actually records well. Pair with died_to.",
        ),
    died_to: z
        .number()
        .int()
        .min(1)
        .max(2000)
        .optional()
        .describe(
            "Hijri year, inclusive UPPER bound on the MAIN AUTHOR's death year (author.death_year). Pair with died_from.",
        ),
    category_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
            "Optional: restrict to one category (use shamela_list_categories for IDs). Categories are flat in master.db.",
        ),
    downloaded_only: z
        .boolean()
        .default(false)
        .describe(
            "If true, restrict to books whose file is actually present on this machine — the only ones with searchable page content.",
        ),
    ...PaginationInput,
    ...ResponseFormatInput,
};
export const booksByPeriodInput = z.object(booksByPeriodInputShape).strict();

export interface BooksByPeriodRow {
    book_id: number;
    book_name: string;
    /** Main author's display name (join on book.main_author), null if none. */
    main_author_name: string | null;
    /** Main author's Hijri death year (null when unknown/modern → excluded when a died_* bound is set). */
    main_author_death_year: number | null;
    /** Book composition year (book.book_date, Hijri; null → excluded when a composed_* bound is set). */
    book_date: number | null;
    category_id: number | null;
    category: string | null;
    /** The per-book file is present on this machine. */
    downloaded: boolean;
    /**
     * Whether the book can actually be read, which `downloaded` alone does not
     * say: a file can be present and hold no text (an image/scan-only title).
     * Resolved for the returned page only — opening every matched book's file
     * would make a catalogue browse pay for content it was not asked about.
     */
    content_status: "readable" | "downloaded_no_pages" | "not_downloaded";
}

export interface BooksByPeriodOutput {
    total: number;
    returned: number;
    offset: number;
    has_more: boolean;
    next_offset?: number;
    /** Echo of the applied constraints so the caller can confirm the split was honored. */
    filter: {
        composed_from: number | null;
        composed_to: number | null;
        died_from: number | null;
        died_to: number | null;
        category_id: number | null;
        downloaded_only: boolean;
    };
    /** Convenience: the matching ids to feed straight into scope.book_ids of a search tool. */
    book_ids: number[];
    books: BooksByPeriodRow[];
}

/**
 * Filter the catalog by composition year and/or main-author death year, kept
 * as DISTINCT AND-combined constraints. Catalog-only and synchronous.
 * Throws BAD_ARG if none of the four temporal bounds is provided.
 */
export async function runBooksByPeriod(
    catalog: Catalog,
    pages: PageStore,
    args: z.infer<typeof booksByPeriodInput>,
): Promise<RenderedResponse<BooksByPeriodOutput>> {
    const hasComposed = args.composed_from !== undefined || args.composed_to !== undefined;
    const hasDied = args.died_from !== undefined || args.died_to !== undefined;
    if (!hasComposed && !hasDied) {
        throw badArg(pick(booksByPeriodLabels).needRange);
    }

    // Open-ended bounds: a missing side of a provided range is treated as the
    // widest possible year. When NEITHER side of a dimension is provided, that
    // dimension is not constrained at all (its rows aren't dropped for a null).
    const composedLo = hasComposed ? args.composed_from ?? 1 : null;
    const composedHi = hasComposed ? args.composed_to ?? 2000 : null;
    const diedLo = hasDied ? args.died_from ?? 1 : null;
    const diedHi = hasDied ? args.died_to ?? 2000 : null;

    const matched: BooksByPeriodRow[] = [];

    for (const b of catalog.allBooks()) {
        // Composition-year constraint (only when a composed_* bound was given).
        if (composedLo !== null) {
            if (b.book_date === null) continue; // no composition year → excluded under a composed_* bound
            if (b.book_date < composedLo || b.book_date > (composedHi as number)) continue;
        }

        // Main-author death-year constraint (only when a died_* bound was given).
        const author = b.main_author !== null ? catalog.authorRecord(b.main_author) : undefined;
        if (diedLo !== null) {
            const dy = author?.death_year ?? null;
            if (dy === null) continue; // unknown/modern death year → excluded under a died_* bound
            if (dy < diedLo || dy > (diedHi as number)) continue;
        }

        // Category constraint.
        if (args.category_id !== undefined && b.book_category !== args.category_id) continue;

        // Downloaded constraint.
        const downloaded = catalog.isDownloaded(b.book_id);
        if (args.downloaded_only && !downloaded) continue;

        matched.push({
            book_id: b.book_id,
            book_name: b.book_name,
            main_author_name: catalog.mainAuthorName(b),
            main_author_death_year: author?.death_year ?? null,
            book_date: b.book_date,
            category_id: b.book_category,
            category: catalog.categoryPath(b.book_category)[0] ?? null,
            downloaded,
            content_status: "not_downloaded", // resolved for the returned page below
        });
    }

    matched.sort((x, y) => x.book_id - y.book_id);

    const slice = matched.slice(args.offset, args.offset + args.limit);
    // Only the rows actually being returned pay for a page-count lookup.
    for (const row of slice) {
        if (!row.downloaded) continue;
        row.content_status = (await pages.pageCount(row.book_id)) > 0 ? "readable" : "downloaded_no_pages";
    }
    const hasMore = args.offset + slice.length < matched.length;
    const out: BooksByPeriodOutput = {
        total: matched.length,
        returned: slice.length,
        offset: args.offset,
        has_more: hasMore,
        ...(hasMore ? { next_offset: args.offset + slice.length } : {}),
        filter: {
            composed_from: args.composed_from ?? null,
            composed_to: args.composed_to ?? null,
            died_from: args.died_from ?? null,
            died_to: args.died_to ?? null,
            category_id: args.category_id ?? null,
            downloaded_only: args.downloaded_only,
        },
        book_ids: slice.map((r) => r.book_id),
        books: slice,
    };

    return renderResponse(out, args.response_format, (data) => {
        const L = pick(booksByPeriodLabels);
        const f = data.filter;
        const parts: string[] = [];
        if (f.composed_from !== null || f.composed_to !== null) {
            parts.push(L.composedRange(num(f.composed_from ?? "…"), num(f.composed_to ?? "…")));
        }
        if (f.died_from !== null || f.died_to !== null) {
            parts.push(L.diedRange(num(f.died_from ?? "…"), num(f.died_to ?? "…")));
        }
        if (f.category_id !== null) {
            parts.push(
                L.categoryFilter(
                    catalog.category(f.category_id)?.category_name ?? String(f.category_id),
                ),
            );
        }
        if (f.downloaded_only) parts.push(L.downloadedOnly);
        const scope = parts.length ? ` (${parts.join(L.filterSep)})` : "";

        const lines = [
            header(1, L.heading(scope, num(data.total))),
            L.counts(num(data.returned), num(data.total), num(data.offset)),
            "",
        ];
        for (const b of data.books) {
            lines.push(
                `## ${b.book_name} (id=${b.book_id})${b.downloaded ? L.downloadedSuffix : ""}`,
            );
            if (b.main_author_name) {
                const dy = b.main_author_death_year ? L.died(num(b.main_author_death_year)) : "";
                lines.push(`- ${L.author}: ${b.main_author_name}${dy}`);
            }
            if (b.book_date) lines.push(`- ${L.composedYear}: ${L.hijri(num(b.book_date))}`);
            if (b.category) lines.push(`- ${L.category}: ${b.category} (id=${b.category_id})`);
            lines.push("");
        }
        if (data.has_more) lines.push(L.more(String(data.next_offset)));
        lines.push("", L.note);
        return lines.join("\n");
    });
}
