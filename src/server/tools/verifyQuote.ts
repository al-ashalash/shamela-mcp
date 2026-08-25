/**
 * shamela_verify_quote — is this quotation really on the page it is credited to?
 *
 * The question a footnote exists to answer, and the one nobody could ask this
 * extension until now. A reader holds a sentence and an attribution — from a
 * paper, a lecture, a forum post, or from a model that produced both — and
 * needs to know three things that ordinary search runs together:
 *
 *   verbatim   the wording is there, letter for letter, diacritics and hamza
 *              and digits included
 *   differs    ALL of it is there, but not as written: the differences are
 *              NAMED, because «found, with differences» that will not say which
 *              differences is not a finding
 *   partial    part of it is there and the rest is not — what a quotation
 *              carried by memory looks like. Kept apart from `differs` because
 *              «the book says this differently» and «the book says four of your
 *              words» are not the same claim, and the share is reported
 *   not_found  it is not in what was examined — and the answer says what was
 *              examined, since «not in your library» and «not in the tradition»
 *              are different sentences
 *
 * Two further things decide whether a quotation may be used, and both are
 * invisible in a search result (item 96):
 *
 *   WHERE ON THE PAGE. Text in the matn is the author's. Text in the hashiya is
 *   the modern editor's — a different person, usually by six centuries. A
 *   quotation lifted from a footnote and attributed to the author is a
 *   misattribution even though every word of it is on the page.
 *
 *   WHICH NUMBER. Shamela's `page_id` is its own running count; the printed
 *   page is what the paper edition shows, and a citation carried by hand almost
 *   always carries the printed one. Given one where the other was meant, the
 *   reader lands on a real page that says nothing like the quotation and
 *   concludes it was invented. So when a claimed page does not hold the quote,
 *   this looks for the page whose PRINTED number is the one given, and says so.
 *
 * No Java. The exactness comparison is searchExact's `normalizeExact` /
 * `containsExact`, run at several settings against the raw page text, which is
 * where the differences are found by construction: the axis whose preservation
 * breaks the match IS the difference.
 */

import { z } from "zod";

import { ARABIC_PUNCT_RE, hamzaCollisionWords, normalizeArabic, tokenizeArabic } from "../arabic.js";
import { CatalogScope, type Catalog } from "../catalog.js";
import { MAX_QUERY_TOKENS, SHAMELA_WEB } from "../constants.js";
import { badArg, emptyScope } from "../errors.js";
import { excerptAround } from "../excerpt.js";
import type { Helper } from "../helper.js";
import type { PageStore } from "../pages.js";
import { ResponseFormatInput, ScopeInputShape, type ScopeInputType } from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { verifyQuoteLabels, type VerifyNoteKey } from "../i18n/tools/verifyQuote.js";
import { containsExact, type PreserveFlags } from "./searchExact.js";

/** Every distinction, preserved. The reading that earns the word «verbatim». */
const STRICT: PreserveFlags = {
    preserve_diacritics: true,
    preserve_hamza: true,
    preserve_digits: true,
};

/** Nothing preserved — the loosest reading, and the one search itself uses. */
const LOOSE: PreserveFlags = {
    preserve_diacritics: false,
    preserve_hamza: false,
    preserve_digits: false,
};

/** The three orthographic axes, each testable on its own. */
const AXES = ["diacritics", "hamza", "digits"] as const;

/**
 * How a quotation can differ from the page.
 *
 * The first three are spelling: the same words, written another way. The
 * fourth is not — `wording` means the page says something else at some point,
 * which is what a quotation carried by memory or by hand usually does, and it
 * is the difference a reader most needs to see.
 */
export type QuoteDifference = (typeof AXES)[number] | "wording";

/**
 * Which axes the quotation and the page disagree on.
 *
 * One axis is preserved at a time and the rest folded. If the match survives,
 * the page agrees with the quotation on that axis; if it breaks, that axis is
 * the difference. This is a measurement, not an inference — each answer comes
 * from a comparison that was actually run.
 */
export function differencesBetween(pageText: string, quote: string): QuoteDifference[] {
    const out: QuoteDifference[] = [];
    for (const axis of AXES) {
        const flags: PreserveFlags = { ...LOOSE, [`preserve_${axis}`]: true };
        if (!containsExact(pageText, quote, flags)) out.push(axis);
    }
    return out;
}

/** An Arabic word of the quotation: as written, as indexed, and where it starts. */
interface QuoteWord {
    raw: string;
    token: string;
    at: number;
}

/**
 * The quotation's Arabic words, keeping the offset of each.
 *
 * The offsets are what let a partial finding quote the page rather than
 * paraphrase it. Tokenisation matches `tokenizeArabic` — same normaliser, same
 * «ابن» → «بن» rule — so a run measured here means the same thing the index
 * means by it.
 */
export function quoteWords(s: string): QuoteWord[] {
    const out: QuoteWord[] = [];
    // Arabic punctuation is INSIDE the Arabic block, so without this a comma
    // glued to a word — «حكم،» — becomes part of the word, and a token carrying
    // it matches no index term and no page token. One editor's comma then
    // flipped a verbatim quotation to a confident «not_found», and a SPACED
    // comma was counted as a word of the quotation, corrupting the «N of M
    // words» denominator. Each mark becomes one space, so offsets into the
    // caller's own string survive for the excerpt slicing below.
    const cleaned = s.replace(ARABIC_PUNCT_RE, " ");
    // i18n:arabic-data — the Arabic block itself, and the one word-level rule
    // the index applies. Both are the alphabet this function operates ON, not
    // wording it shows; translating either would stop it matching, in every
    // language.
    const re = /[؀-ۿ]+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cleaned))) {
        const normalized = normalizeArabic(m[0]);
        const token = normalized === "ابن" ? "بن" : normalized;
        if (token) out.push({ raw: m[0], token, at: m.index });
    }
    return out;
}

/**
 * The longest stretch of the quotation that the page carries word for word.
 *
 * Anchored rather than quadratic: each place the page repeats the quotation's
 * word is a possible start, and the run is extended from there. A quotation of
 * twenty words against a page of six hundred costs one pass over the page and a
 * handful of short walks.
 *
 * This is what separates «that is not in the book» from «the book says it
 * differently», which are the two answers a reader most needs told apart — and
 * a search that requires every word at once can never tell them apart, because
 * one changed word empties the result.
 */
export function longestSharedRun(quote: string[], page: string[]): { at: number; len: number } {
    const positions = new Map<string, number[]>();
    page.forEach((t, i) => {
        const list = positions.get(t);
        if (list) list.push(i);
        else positions.set(t, [i]);
    });
    let best = { at: 0, len: 0 };
    for (let i = 0; i < quote.length; i++) {
        for (const p of positions.get(quote[i]!) ?? []) {
            let len = 0;
            while (i + len < quote.length && p + len < page.length && quote[i + len] === page[p + len]) len++;
            if (len > best.len) best = { at: i, len };
        }
    }
    return best;
}

/**
 * How much of a quotation a page must carry before the page is worth showing.
 *
 * Four words, or a third of it — whichever is larger. Four consecutive Arabic
 * words are already distinctive; below that the "match" is a phrase every fiqh
 * page contains, and reporting it would bury the reader in pages that share
 * «في حكم» with the quotation and nothing else. The proportion is what keeps a
 * thirty-word quotation from being answered by four of its words.
 */
export function partialThreshold(words: number): number {
    return Math.max(4, Math.ceil(words * 0.35));
}

/**
 * Starting points of the windows to try when the whole quotation finds nothing.
 *
 * A quotation carried by hand is usually right somewhere and wrong somewhere,
 * and a search that demands every word at once is emptied by the wrong part —
 * so the right part is asked for on its own. The first window comes first
 * because a quotation that drifts usually drifts later; the rest are spread
 * evenly, and there are few, because each one is a round trip.
 */
export function windowStarts(total: number, size: number, max: number): number[] {
    const last = total - size;
    if (last <= 0) return [0];
    const wanted = Math.min(max, last + 1);
    const out = [0];
    for (let i = 1; i < wanted; i++) {
        const at = Math.round((last * i) / (wanted - 1));
        if (!out.includes(at)) out.push(at);
    }
    return out;
}

/** Windows tried before giving up — each is a search, and few are enough. */
const MAX_WINDOWS = 4;

/**
 * The words to ask the engine for, when the quotation has more than it accepts.
 *
 * The longest ones. Length is a decent proxy for rarity in Arabic — the short
 * words are the particles every page carries — and asking for fewer, rarer
 * words is strictly better here anyway: the candidate set is meant to be wide,
 * because the verification that follows can only ever remove pages from it.
 */
export function candidateTokens(tokens: string[]): string[] {
    if (tokens.length <= MAX_QUERY_TOKENS) return tokens;
    return [...tokens]
        .map((t, i) => ({ t, i }))
        .sort((a, b) => b.t.length - a.t.length || a.i - b.i)
        .slice(0, MAX_QUERY_TOKENS)
        .sort((a, b) => a.i - b.i)
        .map((x) => x.t);
}

export const verifyQuoteInputShape = {
    quote: z
        .string()
        .min(4)
        .describe(
            "The quotation to check, written as you have it — with whatever diacritics, hamza spellings and digits it carries. It is compared as typed; nothing is auto-corrected.",
        ),
    book_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("The book the quotation is credited to. Given, the check is about THAT book; omitted, the whole downloaded library is searched."),
    page_id: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
            "The page the quotation is credited to. Requires book_id. If the quotation is not there, the page whose PRINTED number equals this is checked too, and reported separately — that confusion is the commonest error in a hand-carried citation.",
        ),
    scope: z
        .object(ScopeInputShape)
        .strict()
        .optional()
        .describe("Restrict the library-wide search (ignored when book_id is given)."),
    limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(5)
        .describe("Maximum places to report (1–20, default 5)."),
    ...ResponseFormatInput,
};
export const verifyQuoteInput = z.object(verifyQuoteInputShape).strict();

// --- Helper wire shapes (as searchExact/searchPhrase use them) ---------------

interface RawHit {
    book_id: number;
    page_id: number;
}
interface RawEnvelope {
    total_hits: number;
    has_more: boolean;
    results: RawHit[];
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

const FIELDS = ["body", "foot", "comment"] as const;
export type QuoteField = (typeof FIELDS)[number];

export interface QuoteLocation {
    book_id: number;
    book_name: string;
    author_name: string | null;
    page_id: number;
    /** What the paper edition calls this page — the number a citation carries. */
    printed_page: string | null;
    /**
     * True when Shamela numbered this book itself rather than following a paper
     * edition. Then `printed_page` is a number no printed copy carries, and a
     * citation that quotes it as «ص N» is citing a page that does not exist
     * outside this software.
     */
    auto_numbered: boolean;
    /**
     * Where on the page it sits. `body` is the author's own text; `foot` is the
     * modern editor's apparatus, and a quotation taken from there is not the
     * author's words however exactly it matches.
     */
    field: QuoteField;
    match: "verbatim" | "differs" | "partial";
    /** Named, and only when the wording is not exactly the quotation. */
    differences: QuoteDifference[];
    /** Words of the quotation this page carries, of how many it has. */
    matched_words: number;
    quote_words: number;
    snippet: string;
    source_url: string;
    /** False when the book's file is not on disk — the text came from the index. */
    readable: boolean;
}

export interface VerifyQuoteOutput {
    quote: string;
    /** What was examined. A verdict means nothing without it. */
    checked: "claimed_page" | "claimed_book" | "library" | "nothing";
    /**
     * `unverifiable` is not a softer «not found»: it means nothing was
     * examined, because the book credited is not on this machine. Reporting
     * that as an absence would be a claim about a book we do not hold.
     */
    status: "verbatim" | "differs" | "partial" | "not_found" | "unverifiable";
    claim?: {
        book_id: number;
        book_name: string;
        page_id?: number;
        printed_page?: string | null;
        /** False when the claimed book is not on this machine — nothing could be checked. */
        downloaded: boolean;
    };
    /**
     * The number given was the printed page, not the page id: the quotation is
     * absent from page_id N and present on the page the edition prints as N.
     */
    printed_page_confusion?: { given: number; page_ids: number[] };
    locations: QuoteLocation[];
    /** How much was looked at, so a «not found» can be weighed (item 99). */
    searched: { books: number; downloaded_total: number; scoped: boolean };
    notes: string[];
    suggestions?: string[];
}

/** Candidate pages fetched before verification; exactness only ever prunes. */
const CANDIDATE_CAP = 60;

/**
 * The quotation in its sentence, drawn from the page's own text.
 *
 * Tags come out first: a window opening inside «<span data-type="title">»
 * prints the attributes as though they were the book's words. The fallback is
 * the head of the page — reached only when the offset scan and the exactness
 * comparison disagree about where the wording starts, which the differing
 * normalisers make possible, and an empty quotation of a page that certainly
 * holds the words would be the worse answer.
 */
function quoteInContext(text: string, quote: string): string {
    const clean = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const around = excerptAround(clean, quote, 160);
    if (around) return around.text;
    return clean.length > 320 ? `${clean.slice(0, 320).trim()} …` : clean;
}

export async function runVerifyQuote(
    helper: Helper,
    catalog: Catalog,
    pages: PageStore,
    args: z.infer<typeof verifyQuoteInput>,
): Promise<RenderedResponse<VerifyQuoteOutput>> {
    if (args.page_id !== undefined && args.book_id === undefined) {
        throw badArg("page_id names a page inside a book — pass book_id with it.");
    }
    const words = quoteWords(args.quote);
    const tokens = words.map((w) => w.token);
    const threshold = partialThreshold(tokens.length);
    // The candidate query is the quotation's WORDS, and at most five of them.
    //
    // Two separate reasons, both measured on the fixture page. Punctuation in
    // Arabic prose is frequently unspaced — «والمساواة.واصطلاحاً» is one
    // whitespace-token there — and a term carrying a full stop is in no index.
    // And the engine accepts five words (constants.ts MAX_QUERY_TOKENS): a
    // sixth is glued to the fifth and matches nothing at all. Either one alone
    // made the engine answer a quotation demonstrably present with a confident
    // zero, scoped to the very book holding it.
    const candidateQuery = candidateTokens(tokens).join(" ");
    const qTokens = tokens;
    if (qTokens.length === 0) {
        throw badArg(
            "The quotation has no searchable Arabic words. Pass the Arabic wording itself, not a description of it.",
        );
    }

    const noteKeys: VerifyNoteKey[] = [];
    const collisions = hamzaCollisionWords(args.quote);
    const downloadedTotal = catalog.downloadedBookIds().size;

    /** Read whole pages and judge the quotation against every field of each. */
    const judge = async (bookId: number, pageIds: number[]): Promise<QuoteLocation[]> => {
        if (!pageIds.length) return [];
        const batch = await helper.request<BatchEnvelope>("get_pages_batch", {
            book_id: bookId,
            page_ids: pageIds,
        });
        const rec = catalog.bookRecord(bookId);
        const printed = await pages.printedPages(bookId, pageIds);
        const readable = catalog.isDownloaded(bookId) || catalog.confirmOnDisk(bookId);
        const found: QuoteLocation[] = [];
        const place = (
            page: BatchPage,
            field: QuoteField,
            match: "verbatim" | "differs" | "partial",
            differences: QuoteDifference[],
            matchedWords: number,
            around: string,
        ): QuoteLocation => ({
            book_id: bookId,
            book_name: rec?.book_name ?? `(unknown ${bookId})`,
            author_name: rec ? catalog.mainAuthorName(rec) : null,
            page_id: page.page_id,
            printed_page: printed.get(page.page_id) ?? null,
            // citation.ts computes this the same way, from the same column.
            auto_numbered: rec?.printed !== 1,
            field,
            match,
            differences,
            matched_words: matchedWords,
            quote_words: words.length,
            // Around the wording, so the reader sees it in its sentence and can
            // judge whether what surrounds it changes what it means (item 98).
            snippet: quoteInContext(page[field], around),
            source_url: `${SHAMELA_WEB}/book/${bookId}/${page.page_id}`,
            readable,
        });
        for (const page of batch.results) {
            if (!page.found) continue;
            let best: QuoteLocation | null = null;
            for (const field of FIELDS) {
                const text = page[field];
                if (!text) continue;
                if (containsExact(text, args.quote, LOOSE)) {
                    const verbatim = containsExact(text, args.quote, STRICT);
                    best = place(
                        page,
                        field,
                        verbatim ? "verbatim" : "differs",
                        verbatim ? [] : differencesBetween(text, args.quote),
                        words.length,
                        args.quote,
                    );
                    break; // a whole match settles the page
                }
                // Not the whole quotation — so how much of it, contiguously?
                const run = longestSharedRun(tokens, tokenizeArabic(text));
                if (run.len < threshold || run.len <= (best?.matched_words ?? 0)) continue;
                const first = words[run.at]!;
                const last = words[run.at + run.len - 1]!;
                best = place(
                    page,
                    field,
                    "partial",
                    ["wording"],
                    run.len,
                    args.quote.slice(first.at, last.at + last.raw.length),
                );
            }
            if (best) found.push(best);
        }
        return found;
    };

    /**
     * Candidate pages for the quotation, by whole and then by part.
     *
     * The whole quotation first: when it is right, one search finds it. When
     * that finds nothing, consecutive windows of it are asked for as phrases —
     * which is the engine answering «what page carries this much of it», the
     * question a partial match needs answered before it can be measured.
     */
    const candidatesFor = async (scopeKeys: string[] | null): Promise<RawHit[]> => {
        const whole = await helper.request<RawEnvelope>("search_pages", {
            query: candidateQuery,
            scope_book_keys: scopeKeys,
            max_results: CANDIDATE_CAP,
            offset: 0,
            options: { search_in: ["body", "foot"], skip_coverage: true },
        });
        if (whole.has_more || whole.total_hits > whole.results.length) noteKeys.push("candidates_capped");
        if (whole.results.length || tokens.length <= threshold) return whole.results;
        // The window is asked for as a phrase, so it also has to fit the engine's
        // five words; the run that is finally REPORTED is measured here, at the
        // full threshold, against the page's own text.
        const windowSize = Math.min(threshold, MAX_QUERY_TOKENS);
        for (const start of windowStarts(tokens.length, windowSize, MAX_WINDOWS)) {
            const part = await helper.request<RawEnvelope>("search_phrase", {
                query: tokens.slice(start, start + windowSize).join(" "),
                mode: "phrase",
                distance: 1,
                scope_book_keys: scopeKeys,
                max_results: CANDIDATE_CAP,
                offset: 0,
                options: { search_in: ["body", "foot"] },
            });
            if (part.results.length) return part.results;
        }
        return [];
    };

    let checked: VerifyQuoteOutput["checked"] = "library";
    let locations: QuoteLocation[] = [];
    let claim: VerifyQuoteOutput["claim"];
    let confusion: VerifyQuoteOutput["printed_page_confusion"];
    let searchedBooks = downloadedTotal;
    let scoped = false;

    if (args.book_id !== undefined) {
        const rec = catalog.bookRecord(args.book_id);
        const downloaded = catalog.isDownloaded(args.book_id) || catalog.confirmOnDisk(args.book_id);
        claim = {
            book_id: args.book_id,
            book_name: rec?.book_name ?? `(unknown ${args.book_id})`,
            ...(args.page_id !== undefined ? { page_id: args.page_id } : {}),
            downloaded,
        };
        searchedBooks = 1;
        scoped = true;
        if (!rec) noteKeys.push("unknown_book");
        if (!downloaded) {
            // Nothing was checked, and saying "not found" here would be a claim
            // about a book we simply do not hold.
            checked = "nothing";
            noteKeys.push("claim_book_not_downloaded");
        } else if (args.page_id !== undefined) {
            checked = "claimed_page";
            claim.printed_page = await pages.printedPage(args.book_id, args.page_id);
            locations = await judge(args.book_id, [args.page_id]);
            if (locations.length === 0) {
                // The number may have been the printed one all along.
                const byPrinted = (await pages.pageIdsForPrintedPage(args.book_id, args.page_id))
                    .filter((id) => id !== args.page_id)
                    .slice(0, 5);
                const elsewhere = await judge(args.book_id, byPrinted);
                if (elsewhere.length) {
                    confusion = { given: args.page_id, page_ids: elsewhere.map((l) => l.page_id) };
                    locations = elsewhere;
                    noteKeys.push("printed_page_confusion");
                }
            }
        } else {
            checked = "claimed_book";
            const hits = await candidatesFor([String(args.book_id)]);
            locations = await judge(
                args.book_id,
                hits.map((r) => r.page_id),
            );
        }
    } else {
        let scopeBookKeys: string[] | null = null;
        if (args.scope) {
            const scopeInput: ScopeInputType = {
                ...(args.scope as ScopeInputType),
                downloaded_only: args.scope?.downloaded_only ?? false,
            };
            const resolved = new CatalogScope(catalog).resolveBookIds(scopeInput);
            if (resolved.book_ids.length === 0) throw emptyScope(resolved.diagnostics);
            scopeBookKeys = resolved.book_ids.map(String);
            searchedBooks = resolved.book_ids.length;
            scoped = true;
        }
        const hits = await candidatesFor(scopeBookKeys);
        const byBook = new Map<number, number[]>();
        for (const hit of hits) {
            const list = byBook.get(hit.book_id) ?? [];
            list.push(hit.page_id);
            byBook.set(hit.book_id, list);
        }
        for (const [bookId, pageIds] of byBook) {
            locations.push(...(await judge(bookId, pageIds)));
            if (locations.length >= args.limit) break;
        }
    }

    // Verbatim first: it is the finding that settles the question, and a reader
    // scanning the first line should be reading the strongest evidence.
    const rank = { verbatim: 0, differs: 1, partial: 2 } as const;
    locations.sort(
        (a, b) =>
            rank[a.match] - rank[b.match] ||
            b.matched_words - a.matched_words ||
            a.differences.length - b.differences.length ||
            (a.field === b.field ? 0 : a.field === "body" ? -1 : 1) ||
            a.book_id - b.book_id ||
            a.page_id - b.page_id,
    );
    locations = locations.slice(0, args.limit);

    // The headline follows the STRONGEST place found, and never overstates it:
    // a page carrying four of eight words is not a page that says the
    // quotation differently, and calling that «differs» would let a reader
    // publish a sentence on the strength of half of it turning up somewhere.
    const status: VerifyQuoteOutput["status"] =
        checked === "nothing"
            ? "unverifiable"
            : locations.some((l) => l.match === "verbatim")
              ? "verbatim"
              : locations.some((l) => l.match === "differs")
                ? "differs"
                : locations.length
                  ? "partial"
                  : "not_found";

    if (locations.some((l) => l.field === "foot")) noteKeys.push("found_in_footnote");
    if (locations.some((l) => l.auto_numbered)) noteKeys.push("auto_numbered");
    if (status === "verbatim") noteKeys.push("verbatim_is_folded");
    if (status === "partial") noteKeys.push("partial_wording");
    if (status === "not_found") noteKeys.push("not_found_here");

    const L = pick(verifyQuoteLabels);
    const out: VerifyQuoteOutput = {
        quote: args.quote,
        checked,
        status,
        ...(claim ? { claim } : {}),
        ...(confusion ? { printed_page_confusion: confusion } : {}),
        locations,
        searched: { books: searchedBooks, downloaded_total: downloadedTotal, scoped },
        notes: [
            ...noteKeys.map((k) => L.notes[k]),
            // The index dissolves the hamza in «يء», so a candidate search for
            // such a word reaches a different word entirely. Named, because a
            // reader comparing two spellings has to know one of them was never
            // distinguishable to begin with.
            ...(collisions.length ? [L.hamzaCaveat(collisions)] : []),
        ],
        // Offered on a partial finding too: part of a quotation on a page is a
        // lead to follow, not an answer to stop at.
        ...(status === "not_found" || status === "partial" ? { suggestions: L.suggestions } : {}),
    };

    return renderResponse(out, args.response_format, (data) => {
        const lines = [header(1, L.heading)];
        lines.push(`> ${data.quote}`, "");
        lines.push(L.verdict[data.status]);
        lines.push(L.checkedLine[data.checked](data.claim?.book_name ?? "", num(data.searched.books)));
        if (data.printed_page_confusion) {
            lines.push(
                "",
                `**${L.confusionLine(
                    num(data.printed_page_confusion.given),
                    data.printed_page_confusion.page_ids.map((n) => num(n)),
                )}**`,
            );
        }
        if (data.notes.length) {
            lines.push("");
            for (const n of data.notes) lines.push(`- ${n}`);
        }
        if (data.locations.length) {
            lines.push("", header(2, L.locationsHeading(num(data.locations.length))));
            for (const l of data.locations) {
                lines.push(
                    `### ${l.book_name} — page_id=${String(l.page_id)}${l.printed_page ? L.printedPage(num(l.printed_page)) : ""}`,
                );
                if (l.author_name) lines.push(`*${l.author_name}*`);
                const how =
                    l.match === "verbatim"
                        ? L.verbatimMark
                        : l.match === "partial"
                          ? `${L.partialLead} — ${L.partialMark(num(l.matched_words), num(l.quote_words))}`
                          : L.differsMark(l.differences.map((d) => L.axis[d]));
                lines.push(`${L.fieldLabel[l.field]} — ${how}`);
                if (l.snippet) lines.push("", `> ${l.snippet}`);
                lines.push("", l.source_url, "");
            }
        }
        if (data.suggestions?.length) {
            lines.push("", L.suggestionsHeading);
            for (const s of data.suggestions) lines.push(`- ${s}`);
        }
        return lines.join("\n");
    });
}
