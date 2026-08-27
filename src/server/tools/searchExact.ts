/**
 * shamela_search_exact (#19) — exactness-preserving search that honors
 * diacritics (التشكيل), hamza/alef forms (ٱآأإ vs ا, ؤ ئ ء ى), and digit systems
 * (Arabic-Indic ٠-٩ vs Western 0-9).
 *
 * The default Lucene analyzer strips all of these from BOTH the index and the
 * query, so `shamela_search_pages` rejects preserve_* with OPTION_NOT_SUPPORTED
 * (see errors.ts::optionNotSupported and Main.java's rejectPreservation). This
 * tool uses the SAME two-stage strategy the phrase tool proved
 * (see searchPhrase.ts), needing no Java change:
 *
 *   1. Ask the helper's normalized AND-search (`search_pages`) for candidate
 *      pages where all query words co-occur — fast and wide (the analyzer folds
 *      everything, so this over-fetches on purpose).
 *   2. Fetch each candidate's FULL raw text (`get_pages_batch` returns the
 *      diacritized/hamza-preserving text straight from SQLite — the same source
 *      get_page reads) and, in Node, verify the page actually contains the query
 *      at the requested exactness level, using a TUNABLE normalizer that folds
 *      only what the caller did NOT ask to preserve. Keep only pages that pass,
 *      with a snippet drawn from the raw text around the match.
 *
 * Honesty (mirrors search_phrase): the candidate window is bounded, so
 * `candidate_cap_hit` / `total_candidates_scanned` are reported and no result is
 * silently dropped. Because stage 1 folds the preserved features, exactness only
 * ever REMOVES false positives from the candidate set — it never invents hits.
 */

import { z } from "zod";

import { tokenizeArabic } from "../arabic.js";
import { CatalogScope, type Catalog } from "../catalog.js";
import { badArg, emptyScope } from "../errors.js";
import type { Helper } from "../helper.js";
import type { PageStore } from "../pages.js";
import { PaginationInput, ResponseFormatInput, ScopeInputShape, type ScopeInputType } from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { noResultsLabels, pageSearchAdvice } from "../i18n/tools/noResults.js";
import { searchExactLabels } from "../i18n/tools/searchExact.js";

// --- Tunable exactness normalizer (pure, local — does NOT touch arabic.ts) ---

// i18n:arabic-data — everything from here to ANY_ARABIC_INDIC_RE is the
// alphabet this tool operates ON, not wording it shows. Translating any of
// it would stop the normalisation matching, in every language.
// Tashkeel, tatweel, dagger-alef, Quranic annotation marks. Mirrors arabic.ts's
// DIACRITICS_RE so "stripped" behaviour is identical when preserve_diacritics is off.
const DIACRITICS_RE = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
// Tatweel alone (kept out of the "diacritic" bucket so it is always dropped —
// it is a purely decorative letter-elongation, never semantically meaningful).
const TATWEEL_RE = /ـ/g;
const HTML_TAG_RE = /<[^>]*>/g;

// Punctuation, Arabic and Latin alike, folded ALWAYS — like tatweel, and for
// the same reason: it is the edition's furniture, not the author's wording.
// The exactness this tool enforces is the three axes its flags name
// (diacritics, hamza, digits); a comma was never one of them, yet an Arabic
// comma glued to a word used to break the match, because U+060C sits inside
// the Arabic block and survived every fold. One deliberate exception: the
// Arabic-Indic numeric separators U+066B/U+066C stay, so «٣٫٥» is not fused
// into «٣٥». (A Latin period between digits, «3.5», IS folded — after the
// whitespace collapse both sides fold identically, so matching stays
// consistent; the cost is «3.5» equalling «35», accepted and noted here.)
// i18n:arabic-data — the marks themselves.
const PUNCT_RE = /[،؛؞؟٭۔.,:;!?"'()[\]{}«»„“”‘’…–—-]/g;

// Western 0-9, Arabic-Indic ٠-٩ (U+0660..), Extended Arabic-Indic ۰-۹ (U+06F0..).
const WESTERN_DIGIT_RE = /[0-9]/g;
// i18n:arabic-data — the digit systems themselves, mapped to ASCII.
const ARABIC_INDIC_MAP: Record<string, string> = {
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
    "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};
const ANY_ARABIC_INDIC_RE = /[٠-٩۰-۹]/g;

export interface PreserveFlags {
    preserve_diacritics: boolean;
    preserve_hamza: boolean;
    preserve_digits: boolean;
}

/**
 * Normalize a string for comparison, folding ONLY the features the caller did
 * not ask to preserve. Both the query and the raw page text go through this
 * SAME function with the SAME flags, so matching is internally consistent.
 *
 * - Always: NFC, strip inline HTML tags, strip tatweel AND punctuation
 *   (Arabic and Latin — an editor's comma is not part of the wording),
 *   collapse whitespace.
 * - preserve_diacritics=false → strip all tashkeel/dagger-alef/Quranic marks.
 * - preserve_hamza=false      → fold آأإٱ→ا, ى→ي, ؤ→و, ئ→ي, ة→ه, drop bare ء.
 * - preserve_digits=false     → unify Arabic-Indic/Extended digits to Western.
 */
export function normalizeExact(input: string, flags: PreserveFlags): string {
    if (!input) return "";
    let s = input.normalize("NFC");
    s = s.replace(HTML_TAG_RE, " ");
    s = s.replace(TATWEEL_RE, ""); // tatweel is always decorative
    s = s.replace(PUNCT_RE, " "); // punctuation is the editor's, not the author's
    if (!flags.preserve_diacritics) {
        s = s.replace(DIACRITICS_RE, "");
    }
    if (!flags.preserve_hamza) {
        s = s
            // i18n:arabic-data — the hamza and letter-folding table. This is the
        // transformation the tool performs; translating it would change what
        // the search matches, in every language.
        .replace(/[آأإٱ]/g, "ا") // آأإٱ → ا
            .replace(/ى/g, "ي") // ى → ي
            .replace(/ة/g, "ه") // ة → ه
            .replace(/ؤ/g, "و") // ؤ → و
            .replace(/ئ/g, "ي") // ئ → ي
            .replace(/ء/g, ""); // standalone hamza removed
    }
    if (!flags.preserve_digits) {
        s = s.replace(ANY_ARABIC_INDIC_RE, (d) => ARABIC_INDIC_MAP[d] ?? d);
    }
    // Collapse all runs of whitespace to a single space so line breaks inside a
    // page body never split a multi-word query. Trim the ends.
    s = s.replace(/\s+/g, " ").trim();
    return s;
}

/** True if `needle`, normalized at the given exactness, occurs inside `hay`. */
export function containsExact(hay: string, needle: string, flags: PreserveFlags): boolean {
    const n = normalizeExact(needle, flags);
    if (!n) return false;
    return normalizeExact(hay, flags).includes(n);
}

/**
 * Build a snippet from RAW text around the first exactness-preserving match,
 * so the reader sees the real diacritized/hamza form. The match is located by a
 * robust forward scan: for each raw index we test whether a generous forward
 * window normalizes to START WITH the needle (diacritics/tatweel — and, when
 * folded, hamza/digits — make the raw span longer than the needle, so a direct
 * offset map is fragile). Once the start is found, the end is tightened to the
 * smallest raw span whose normalization covers the needle. Falls back to a
 * head-of-text snippet only if the match cannot be relocated (shouldn't happen,
 * since the caller already verified containsExact on the same field).
 */
function exactSnippet(raw: string, needle: string, flags: PreserveFlags, window = 90): string {
    const cleaned = raw.replace(HTML_TAG_RE, " ").replace(/\s+/g, " ").trim();
    const head = () => (cleaned.length > window * 2 ? cleaned.slice(0, window * 2).trim() + " …" : cleaned);
    const n = normalizeExact(needle, flags);
    if (!n) return head();

    const probeLen = Math.max(n.length * 4, n.length + 40);
    let rawStart = -1;
    for (let i = 0; i < cleaned.length; i++) {
        if (!normalizeExact(cleaned[i] ?? "", flags)) continue; // skip diacritics/whitespace
        if (normalizeExact(cleaned.slice(i, i + probeLen), flags).startsWith(n)) {
            rawStart = i;
            break;
        }
    }
    if (rawStart < 0) return head();

    let rawEnd = rawStart + 1;
    while (rawEnd < cleaned.length && normalizeExact(cleaned.slice(rawStart, rawEnd), flags).length < n.length) {
        rawEnd++;
    }
    const from = Math.max(0, rawStart - window);
    const to = Math.min(cleaned.length, rawEnd + window);
    const prefix = from > 0 ? "… " : "";
    const suffix = to < cleaned.length ? " …" : "";
    return prefix + cleaned.slice(from, to).trim() + suffix;
}

// --- Input schema ------------------------------------------------------------

export const searchExactInputShape = {
    query: z
        .string()
        .min(1)
        .describe(
            "The exact Arabic string to find. Type it WITH the diacritics / hamza form / digit system you want preserved (the query is NOT auto-diacritized). Multiple words are matched as written; the `preserve` flags decide which distinctions are enforced.",
        ),
    preserve: z
        .object({
            preserve_diacritics: z
                .boolean()
                .default(false)
                .describe("Enforce التشكيل exactly: «عِلْم» will not match «عَلَم». The query's own diacritics are honored verbatim."),
            preserve_hamza: z
                .boolean()
                .default(false)
                .describe("Enforce hamza/alef forms exactly: «أحمد» will not match «احمد»; ٱآأإ, ؤ, ئ, ء, ى, ة are all kept distinct."),
            preserve_digits: z
                .boolean()
                .default(false)
                .describe("Distinguish digit systems: Arabic-Indic «٢٥٥» will not match Western «255» (and vice-versa)."),
        })
        .strict()
        .refine(
            (p) => p.preserve_diacritics || p.preserve_hamza || p.preserve_digits,
            { message: "Enable at least one of preserve_diacritics / preserve_hamza / preserve_digits — otherwise use shamela_search_pages." },
        )
        .describe("Which distinctions to enforce during stage-2 verification. At least one must be true."),
    scope: z
        .object(ScopeInputShape)
        .strict()
        .optional()
        .describe("Restrict to books/authors/categories/period. Strongly recommended for large libraries so the candidate window covers the topic."),
    ...PaginationInput,
    ...ResponseFormatInput,
};
export const searchExactInput = z.object(searchExactInputShape).strict();

// --- Helper wire shapes (identical to searchPhrase.ts) -----------------------

interface RawHit {
    book_id: number;
    page_id: number;
    matched_in: string[];
    snippet_body: string;
    snippet_foot: string;
    snippet_comment?: string;
}
interface RawEnvelope {
    total_hits: number;
    returned: number;
    has_more: boolean;
    results: RawHit[];
    dropped_tokens?: string[];
}
interface BatchPage {
    page_id: number;
    found: boolean;
    body: string;
    foot: string;
    comment: string;
}
interface BatchEnvelope {
    book_id: number;
    results: BatchPage[];
}

// --- Output ------------------------------------------------------------------

export interface ExactHit {
    book_id: number;
    book_name: string;
    author_name: string | null;
    category: string | null;
    book_date: number | null;
    page_id: number;
    printed_page: string | null;
    matched_in: string[];
    /**
     * False when the book's page file is not on disk (issue #47).
     *
     * This tool looks as though it could not need the flag: stage 2 re-reads
     * each candidate page and drops it unless the text is there. But the text
     * it reads comes from Lucene's STORED fields, not from the book's own file,
     * so a book whose file has gone still verifies and still comes back — and
     * came back unmarked, while the same hit from search_pages carried a
     * warning. One library state, two answers.
     */
    readable: boolean;
    snippet: string;
}

export interface SearchExactOutput {
    query: string;
    preserve: PreserveFlags;
    total_candidates_scanned: number;
    candidate_cap_hit: boolean;
    returned: number;
    /** Present only when nothing matched: what to try next. */
    suggestions?: string[];
    results: ExactHit[];
    /**
     * Words the CANDIDATE search could not take — the engine accepts five per
     * query. Unlike the ordinary searches, this does NOT widen the results:
     * stage 2 verifies the whole query letter for letter against the raw page
     * text, dropped words included, so every hit carries all of them. What the
     * drop can do is thin the candidate pool the verification reads from,
     * which `candidate_cap_hit` already describes.
     */
    dropped_tokens?: string[];
}

const SEARCH_FIELDS: Array<"body" | "foot"> = ["body", "foot"];

export async function runSearchExact(
    helper: Helper,
    catalog: Catalog,
    pages: PageStore,
    args: z.infer<typeof searchExactInput>,
): Promise<RenderedResponse<SearchExactOutput>> {
    const flags: PreserveFlags = {
        preserve_diacritics: args.preserve.preserve_diacritics,
        preserve_hamza: args.preserve.preserve_hamza,
        preserve_digits: args.preserve.preserve_digits,
    };

    // The stage-1 engine query is the fully-folded token set (the analyzer strips
    // everything anyway). We still require at least one Arabic word so the AND
    // candidate search is meaningful; a purely-numeric query has no Lucene tokens.
    const qTokens = tokenizeArabic(args.query);
    if (qTokens.length === 0) {
        throw badArg(
            "Query has no searchable Arabic words for the candidate stage. Exactness search needs at least one Arabic word (digits alone are not indexed as searchable tokens).",
        );
    }

    // Resolve scope to book keys (same path as search_pages / search_phrase).
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

    // Stage 1: over-fetch candidate pages where all words co-occur (folded). We
    // over-fetch (~8×) because exactness will prune many candidates in stage 2.
    const candidateCap = Math.min(Math.max(args.limit * 8, 40), 100);
    const raw = await helper.request<RawEnvelope>("search_pages", {
        query: args.query,
        scope_book_keys: scopeBookKeys,
        max_results: candidateCap,
        offset: 0,
        options: { search_in: SEARCH_FIELDS, skip_coverage: true },
    });
    const candidates = raw.results;
    const candidateCapHit = raw.has_more || raw.total_hits > candidates.length;

    // Fetch full raw text for candidates, grouped by book (one batch per book).
    const byBook = new Map<number, number[]>();
    for (const c of candidates) {
        const list = byBook.get(c.book_id) ?? [];
        list.push(c.page_id);
        byBook.set(c.book_id, list);
    }
    const text = new Map<string, BatchPage>();
    for (const [bookId, pageIds] of byBook) {
        const batch = await helper.request<BatchEnvelope>("get_pages_batch", {
            book_id: bookId,
            page_ids: pageIds,
        });
        for (const p of batch.results) text.set(`${bookId}:${p.page_id}`, p);
    }

    // Stage 2: keep only pages whose RAW text contains the query at the requested
    // exactness. We verify against body + foot (the same fields stage 1 searched).
    const results: ExactHit[] = [];
    // Asked once per book rather than once per hit: confirmOnDisk goes to the
    // filesystem, and a window of a hundred hits from one missing book would
    // otherwise stat it a hundred times.
    const readableByBook = new Map<number, boolean>();
    const isReadable = (bookId: number): boolean => {
        let v = readableByBook.get(bookId);
        if (v === undefined) {
            v = catalog.isDownloaded(bookId) || catalog.confirmOnDisk(bookId);
            readableByBook.set(bookId, v);
        }
        return v;
    };
    for (const c of candidates) {
        if (results.length >= args.limit) break;
        const page = text.get(`${c.book_id}:${c.page_id}`);
        if (!page || !page.found) continue;

        const matchedFields: string[] = [];
        let snippet = "";
        for (const f of SEARCH_FIELDS) {
            const fieldText = f === "body" ? page.body : page.foot;
            if (!fieldText) continue;
            if (containsExact(fieldText, args.query, flags)) {
                matchedFields.push(f);
                if (!snippet) snippet = exactSnippet(fieldText, args.query, flags);
            }
        }
        if (matchedFields.length === 0) continue;

        const rec = catalog.bookRecord(c.book_id);
        const printed = await pages.printedPage(c.book_id, c.page_id);
        results.push({
            book_id: c.book_id,
            book_name: rec?.book_name ?? `(unknown ${c.book_id})`,
            author_name: rec ? catalog.mainAuthorName(rec) : null,
            category: rec ? catalog.categoryPath(rec.book_category)[0] ?? null : null,
            book_date: rec?.book_date ?? null,
            page_id: c.page_id,
            printed_page: printed,
            matched_in: matchedFields,
            readable: isReadable(c.book_id),
            snippet,
        });
    }

    const out: SearchExactOutput = {
        query: args.query,
        preserve: flags,
        total_candidates_scanned: candidates.length,
        candidate_cap_hit: candidateCapHit,
        returned: results.length,
        // Two different emptinesses, and the reader needs to be told which one.
        // No candidate at all means the wording is not in the library; candidates
        // that all failed verification means it is there, but not in the form the
        // caller insisted on preserving.
        ...(results.length === 0
            ? {
                  suggestions: pageSearchAdvice({
                      scopeCount: scopeBookKeys?.length ?? -1,
                      tokenCount: tokenizeArabic(args.query).length,
                      toolSpecific:
                          candidates.length === 0
                              ? pick(noResultsLabels).exactNoCandidates
                              : pick(noResultsLabels).exactTooStrict,
                  }),
              }
            : {}),
        results,
    };

    // The engine reports what it could not take; the answer says so.
    if (raw.dropped_tokens?.length) out.dropped_tokens = raw.dropped_tokens;

    return renderResponse(out, args.response_format, (data) => {
        const L = pick(searchExactLabels);
        const on: string[] = [];
        if (data.preserve.preserve_diacritics) on.push(L.diacritics);
        if (data.preserve.preserve_hamza) on.push(L.hamza);
        if (data.preserve.preserve_digits) on.push(L.digits);
        const lines = [
            header(1, L.heading(L.joinFeatures(on), data.query)),
        ];
        // NOT the shared dropped-words sentence: that one says the results are
        // wider than asked, which is true of every search except this one —
        // here stage 2 enforces the full text, so the hits are exact and only
        // the candidate pool was narrowed.
        if (data.dropped_tokens?.length) lines.push("", `> *${L.candidatesTrimmed(data.dropped_tokens)}*`);
        lines.push(L.summary(num(data.returned), num(data.total_candidates_scanned)));
        if (data.candidate_cap_hit) {
            lines.push(L.capNote);
        }
        if (data.suggestions?.length) {
            lines.push("", pick(noResultsLabels).heading);
            for (const s of data.suggestions) lines.push(`- ${s}`);
        }
        lines.push("");
        for (const r of data.results) {
            lines.push(
                `## ${r.book_name}${r.printed_page ? L.printedPage(num(r.printed_page)) : ""} — page_id=${String(r.page_id)}`,
            );
            // Under the heading, never in it, and the blank line is load-bearing
            // — see searchPages for both reasons.
            if (!r.readable) lines.push(`**${L.unreadableHit}**`, "");
            if (r.author_name) lines.push(`*${r.author_name}*${r.book_date ? L.bookDate(num(r.book_date)) : ""}`);
            if (r.snippet) {
                const label = r.matched_in.length === 1 && r.matched_in[0] === "foot" ? L.footLabel : "";
                lines.push("", `> ${label}${r.snippet}`);
            }
            lines.push("");
        }
        return lines.join("\n");
    });
}
