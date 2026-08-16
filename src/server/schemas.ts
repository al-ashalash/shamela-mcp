/**
 * Shared Zod fragments composed into tool input schemas.
 * Per `docs/architecture.md` §"Schemas (locked)".
 */

import { z } from "zod";

import { DEFAULT_LIMIT, MAX_LIMIT } from "./constants.js";

/** Pagination — composed into every list/search tool's input. */
export const PaginationInput = {
    limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_LIMIT)
        .default(DEFAULT_LIMIT)
        .describe(`Maximum number of results to return (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT}).`),
    offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe(
            "Number of results to skip for pagination. Use with `limit` to page through large result sets. The response includes `has_more` and `next_offset` to drive paging.",
        ),
};

/** Response format — composed into every tool that produces output. */
export const ResponseFormatInput = {
    response_format: z
        .enum(["markdown", "json"])
        .default("markdown")
        .describe(
            "Output format for the human-readable text. 'markdown' (default) is best for direct display; 'json' returns the same data as a single JSON code block. The structured data is returned in `structuredContent` regardless of this setting.",
        ),
};

/** Scope filter — composed into search_pages, search_titles, search_books. */
export const ScopeInputShape = {
    book_ids: z
        .array(z.number().int().positive())
        .optional()
        .describe(
            "Restrict to these book IDs. Use `shamela_resolve` or `shamela_list_downloaded_books` to find IDs. Combine with other scope keys for intersection.",
        ),
    author_ids: z
        .array(z.number().int().positive())
        .optional()
        .describe(
            "Restrict to books by these authors. Includes co-authored books. Use `shamela_resolve(type='author')` to find IDs.",
        ),
    category_ids: z
        .array(z.number().int().positive())
        .optional()
        .describe(
            "Restrict to books in these categories. Categories are flat in master.db (no parent_id, no transitive subtree expansion). Use `shamela_list_categories` to find IDs. When comparing schools of law, run one search per school's category rather than a single search across them — a school you did not search cannot be reported as silent on the question.",
        ),
    period_from: z
        .number()
        .int()
        .min(1)
        .max(2000)
        .optional()
        .describe(
            "Hijri year, inclusive lower bound. Matches book.book_date (Shamela's dating year — see period_basis) OR author.death_number (death year). Pair with period_to.",
        ),
    period_to: z
        .number()
        .int()
        .min(1)
        .max(2000)
        .optional()
        .describe("Hijri year, inclusive upper bound. Pair with period_from."),
    period_basis: z
        .enum(["composed", "died", "either"])
        .optional()
        .describe(
            "Which date the period bounds apply to. 'composed' = book.book_date; 'died' = the main author's death year; 'either' (default) = the union. CAUTION: book_date is NOT the year the book was written — it is Shamela's dating stamp for the work and tracks the ORIGINAL author's death year, equalling the main author's death year for 8,467 of 8,593 catalogue books. So 'composed' and 'died' separate very little here, and neither answers 'what was written in this century'. Say which basis you used when a period carries the argument.",
        ),
    madhhab: z
        .array(z.enum(["hanafi", "maliki", "shafii", "hanbali"]))
        .optional()
        .describe(
            "Restrict to the fiqh categories of these schools of law. A convenience over category_ids so a comparison does not depend on remembering four numbers. Note this covers each school's own fiqh category only — general fiqh, fatwa collections and usul are separate categories and are NOT included.",
        ),
    downloaded_only: z
        .boolean()
        .default(false)
        .describe(
            "Restrict to books actually downloaded on this user's machine (master.db.book.major_ondisk > 0). Critical for honest research scoping when using `shamela_search_pages` — only downloaded books have searchable content.",
        ),
};

export const ScopeInput = z.object(ScopeInputShape).strict();
export type ScopeInputType = z.infer<typeof ScopeInput>;

/** Search options — composed into search_pages, search_titles, search_books, search_authors. */
export const OptionsInputShape = {
    morphology: z
        .boolean()
        .default(false)
        .describe(
            "Search Arabic root forms via the AlKhalil morphological analyzer. Useful when looking for all word forms (يكتب، كاتب، مكتوب…) of a root (كتب). Cannot be combined with `wildcards`.",
        ),
    wildcards: z
        .boolean()
        .default(false)
        .describe(
            "Interpret `*` (zero-or-more characters) and `?` (exactly-one character) within tokens. Examples: `صيا*` matches صيام/صيامهم, `ص?م` matches صام/صوم/صمم. Leading wildcards (`*ابن`) are slow. Cannot combine with `morphology`.",
        ),
    preserve_diacritics: z
        .boolean()
        .default(false)
        .describe(
            "[v1.1] Match diacritics exactly. Currently returns OPTION_NOT_SUPPORTED. The default analyzer already strips all diacritics from both index and query.",
        ),
    preserve_hamza: z
        .boolean()
        .default(false)
        .describe(
            "[v1.1] Match hamza/alef variants exactly. Currently returns OPTION_NOT_SUPPORTED. The default analyzer folds ٱآأإ→ا.",
        ),
    preserve_digits: z
        .boolean()
        .default(false)
        .describe(
            "[v1.1] Distinguish Arabic-Indic vs Western digits. Currently returns OPTION_NOT_SUPPORTED.",
        ),
    search_in: z
        .array(z.enum(["body", "foot", "comment"]))
        .default(["body", "foot"])
        .describe(
            "Which page sections to search. 'body' = matn (المتن), 'foot' = footnotes (الحواشي), 'comment' = user comments (التعليقات). Default ['body','foot']. Narrowing to ['foot'] alone targets the editor's apparatus — where printed hadith referencing and source citations live — and keeps the matn out of the results. To search chapter titles use the separate `shamela_search_titles` tool.",
        ),
};

export const OptionsInput = z.object(OptionsInputShape).strict().default({});
export type OptionsInputType = z.infer<typeof OptionsInput>;
