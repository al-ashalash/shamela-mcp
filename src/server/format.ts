/**
 * Markdown/JSON renderers for tool responses + CHARACTER_LIMIT truncation.
 * Per `docs/architecture.md` §"Search result envelope" and mcp-builder
 * Node guide §"Character Limits and Truncation".
 *
 * Every tool returns dual content:
 *   content[0].text     — formatted per response_format (markdown or JSON)
 *   structuredContent   — typed JSON, always present
 *
 * Tool handlers should:
 *   1. Build the structured payload (typed object).
 *   2. Call `renderResponse(payload, response_format, budget, renderMarkdown)`.
 *      The budget names the list that may be cut to fit CHARACTER_LIMIT and
 *      the parameter the caller uses to get the rest.
 *   3. Return the RenderedResponse as-is: its `structuredContent` is the cut
 *      payload, not the original.
 *
 * The budget is enforced on the PAYLOAD, not on the rendered string. Every
 * tool declares an outputSchema, so clients render `structuredContent` and
 * never the text channel; cutting the string left the oversized half of the
 * response untouched, which is why the limit had never once taken effect. The
 * string cut also produced text `JSON.parse` refuses, mid-token.
 */

import { CHARACTER_LIMIT } from "./constants.js";
import { currentLang, messages } from "./i18n/index.js";

export interface RenderedResponse<T> {
    content: Array<{ type: "text"; text: string }>;
    structuredContent: T;
}

/**
 * What a caller can do about a response that had to be cut.
 *
 * One sentence used to be printed for all thirty-four tools — «use 'limit' or
 * 'offset' to page through more results» — and twenty-three of them have
 * neither parameter. Sending a reader to look for something that is not there
 * is worse than saying nothing, so each tool names its own way through.
 */
export type TruncationAdvice =
    /** `limit` + `offset`; the envelope's `next_offset` says where to resume. */
    | "page"
    /** `limit` only — there is no offset to page with. */
    | "limit"
    /** get_page: the next slice of one page's body. */
    | "body_part"
    /** get_pages_range / get_book_section: continue from `next_start_page_id`. */
    | "next_page"
    /** get_tafseer_texts: feed `remaining_book_ids` back as `book_ids`. */
    | "sources"
    /** No paging parameter at all: the request itself has to get smaller. */
    | "narrow";

/**
 * How much of a tool's answer may be dropped to fit the budget, and what the
 * caller does about it.
 *
 * Required, never optional: a tool that declares nothing is exactly the failure
 * this exists to stop, and a compile error is a cheaper way to find that out
 * than a forty-seven-thousand-character response in someone's session.
 */
export interface ResponseBudget<T> {
    /**
     * Lists to cut, trimmed together to one length. More than one only when
     * they are parallel views of the same rows — books_by_period returns
     * `book_ids` beside `books`, index for index — never two unrelated lists.
     *
     * `null` when there is nothing to cut, or when the TOOL already owns a
     * character budget of its own (get_page's PAGE_BODY_BUDGET,
     * get_pages_range / get_book_section / get_tafseer_texts and
     * MULTIPAGE_CHAR_BUDGET). Cutting their lists from out here would falsify
     * the very fields that say where to resume — `next_start_page_id`,
     * `remaining_book_ids` — so their payload is left whole and only the
     * advice is printed.
     */
    list: readonly (keyof T & string)[] | null;
    /** The tool's own name for «how many rows are in this response», if it reports one. */
    counter?: keyof T & string;
    /** Which of this tool's parameters gets the rest. */
    advice: TruncationAdvice;
    /**
     * The TOOL already cut this payload to its own character budget
     * (PAGE_BODY_BUDGET, MULTIPAGE_CHAR_BUDGET) and reports where to resume.
     * This module must then neither cut it nor claim it did: stamping
     * `truncated` here would overwrite get_book_section's own field — whose
     * meaning is «the section was cut short» — on a section returned whole.
     */
    ownsBudget?: true;
}

/**
 * Format a structured payload for the text channel.
 * @param payload  Structured content (will also become structuredContent).
 * @param format   "markdown" or "json".
 * @param renderMarkdown  Function that formats the payload as markdown.
 *                        Called only when format === "markdown".
 */
/**
 * One shape for "how much of the answer is this?", added to every payload that
 * carries counts.
 *
 * Tools grew their own names for the same two numbers — total_hits/returned in
 * search, total/returned in the listings — and a caller reading one field name
 * across tools would silently read nothing from half of them. Rather than
 * rename fields and break every existing consumer, the canonical pair is ADDED
 * alongside whatever a tool already reports, together with an explicit flag for
 * whether the returned slice is the whole result set.
 */
export interface ResultCounts {
    /** Everything that matched, not just this page. */
    total_count: number;
    /** How many items are in this response. */
    returned_count: number;
    /** False when there is more beyond this slice — the honest reading of a partial answer. */
    complete: boolean;
}

/** Read whichever names a payload happens to use, without assuming any. */
function deriveCounts(payload: Record<string, unknown>): ResultCounts | null {
    const total =
        typeof payload.total_hits === "number"
            ? payload.total_hits
            : typeof payload.total === "number"
              ? payload.total
              : null;
    if (total === null) return null;
    const returned =
        typeof payload.returned === "number"
            ? payload.returned
            : Array.isArray(payload.results)
              ? payload.results.length
              : null;
    if (returned === null) return null;
    const offset = typeof payload.offset === "number" ? payload.offset : 0;
    const hasMore = typeof payload.has_more === "boolean" ? payload.has_more : offset + returned < total;
    return { total_count: total, returned_count: returned, complete: !hasMore && offset === 0 };
}

/** The canonical counts folded in, when the payload carries the numbers. */
function counted<T extends object>(payload: T): T {
    const counts = deriveCounts(payload as Record<string, unknown>);
    return counts ? ({ ...payload, ...counts } as T) : payload;
}

/**
 * What a response actually costs.
 *
 * Both channels ride in the same message, so measuring one measured half the
 * bill — and in markdown format the unmeasured half (structuredContent) is
 * usually the bigger one. Measured live: list_downloaded_books at limit 100
 * put 47,679 characters on the wire under a 25,000 limit.
 */
function wireSize(text: string, structured: object): number {
    return text.length + JSON.stringify(structured).length;
}

/**
 * The reader's digits. `num()` in i18n/labels.ts does the same, but that module
 * imports this one for `arabize`; reaching back across would close the loop.
 */
function digits(n: number): string {
    return currentLang() === "ar" ? arabize(n) : String(n);
}

/** «N of M returned, and here is how to reach the rest», in the reader's language. */
function trimNote(advice: TruncationAdvice, kept: number, total: number): string {
    const t = messages().truncation;
    return t.trimmed(digits(kept), digits(total), t.advice[advice]);
}

/** Said when the response is over budget and nothing here may be dropped. */
function overLimitNote(advice: TruncationAdvice): string {
    const t = messages().truncation;
    return t.overLimit(t.advice[advice]);
}

/**
 * The longest of the lists a budget names, or 0 when there is nothing to cut.
 * The LONGEST, not the first: get_toc fills `titles` OR `ancestor_chain` and
 * leaves the other empty, and resolve returns no books when asked for authors
 * — reading only list[0] left both untrimmed.
 */
function budgetedRows<T extends object>(payload: T, budget: ResponseBudget<T>): number {
    let n = 0;
    for (const field of budget.list ?? []) {
        const rows = (payload as Record<string, unknown>)[field];
        if (Array.isArray(rows)) n = Math.max(n, rows.length);
    }
    return n;
}

/**
 * The payload with its lists cut to `kept`, its own counters brought back in
 * line, and the truncation flags stamped on.
 */
function trimPayload<T extends object>(
    payload: T,
    budget: ResponseBudget<T>,
    kept: number,
    message: string,
): T {
    const p = { ...payload } as Record<string, unknown>;
    for (const field of budget.list ?? []) {
        const rows = p[field];
        if (Array.isArray(rows)) p[field] = rows.slice(0, kept);
    }
    if (budget.counter !== undefined && typeof p[budget.counter] === "number") {
        p[budget.counter] = kept;
    }
    // `has_more` and `next_offset` are PaginationInput's declared contract
    // (schemas.ts, the `offset` description): the next page starts where this
    // one ends. Left stale after a cut, the caller pages straight over the rows
    // that were dropped — losing them silently, which is the one outcome worse
    // than an over-long response.
    if (budget.advice === "page" && typeof p.offset === "number") {
        p.has_more = true;
        p.next_offset = p.offset + kept;
    }
    // Re-derived rather than carried over: total_count is still every match,
    // but returned_count is now the cut length and `complete` is now false.
    return { ...counted(p as T), truncated: true, truncation_message: message } as T;
}

/**
 * The markdown channel's copy of the notice.
 *
 * A tool's renderer knows nothing about `truncation_message`, so without this
 * a markdown reader is never told that rows were dropped. JSON needs no help:
 * the message is a field of the document it prints.
 */
function noteInMarkdown(text: string, note: string): string {
    const room = CHARACTER_LIMIT - note.length - 2;
    return (text.length <= room ? text : text.slice(0, Math.max(0, room))) + "\n\n" + note;
}

/**
 * Format a structured payload for both channels, within the character budget.
 *
 * The budget used to be enforced on the rendered STRING while
 * `structuredContent` went out whole — and since every tool declares an
 * outputSchema, structuredContent is the channel clients render, so the limit
 * never once took effect. The list is cut instead, and both channels then
 * describe the same, smaller, true answer.
 */
export function renderResponse<T extends object>(
    payload_: T,
    format: "markdown" | "json",
    budget: ResponseBudget<T>,
    renderMarkdown: (data: T) => string,
): RenderedResponse<T> {
    const render = (p: T): string =>
        format === "json" ? JSON.stringify(p, null, 2) : renderMarkdown(p);

    const whole = counted(payload_);
    const wholeText = render(whole);
    if (wireSize(wholeText, whole) <= CHARACTER_LIMIT) {
        return { content: [{ type: "text", text: wholeText }], structuredContent: whole };
    }

    const rowCount = budgetedRows(payload_, budget);
    if (rowCount === 0) {
        // The tool's own budget already made the cut and already says how to
        // resume. Saying anything here would either contradict it or invent a
        // truncation that did not happen.
        if (budget.ownsBudget === true) {
            return { content: [{ type: "text", text: wholeText }], structuredContent: whole };
        }
        // Nothing this module may drop without lying — either there is no list,
        // or the tool's own budget owns the cut. Say so in both channels and
        // leave the data alone. The JSON text is NOT sliced: a document cut
        // mid-token is not JSON, and the caller's parser is what finds out.
        const note = overLimitNote(budget.advice);
        const stamped = { ...whole, truncated: true, truncation_message: note } as T;
        const body = render(stamped);
        return {
            content: [{ type: "text", text: format === "json" ? body : noteInMarkdown(body, note) }],
            structuredContent: stamped,
        };
    }

    let kept = rowCount;
    for (;;) {
        const note = trimNote(budget.advice, kept, rowCount);
        const trimmed = trimPayload(payload_, budget, kept, note);
        const body = render(trimmed);
        const text = format === "json" ? body : noteInMarkdown(body, note);
        const size = wireSize(text, trimmed);
        if (size <= CHARACTER_LIMIT || kept === 0) {
            return { content: [{ type: "text", text }], structuredContent: trimmed };
        }
        // Size is very nearly linear in the row count, so aim straight at the
        // budget rather than halving blindly. The guard keeps `kept` strictly
        // decreasing, so the loop always ends — at worst at zero rows.
        const aim = Math.floor(kept * (CHARACTER_LIMIT / size) * 0.95);
        kept = aim >= kept ? kept - 1 : Math.max(0, aim);
    }
}

// --- Markdown helpers -------------------------------------------------------

/** Strip <mark>...</mark> tags from a snippet for plain-text display. */
export function stripMarkTags(s: string): string {
    return s.replace(/<\/?mark>/g, "**"); // Convert to bold for markdown.
}

/** Render an Arabic-Indic digit string from a number or numeric string. */
export function arabize(n: number | string | null | undefined): string {
    if (n === null || n === undefined || n === "") return "";
    const map: Record<string, string> = {
        "0": "٠", "1": "١", "2": "٢", "3": "٣", "4": "٤",
        "5": "٥", "6": "٦", "7": "٧", "8": "٨", "9": "٩",
    };
    return String(n).replace(/[0-9]/g, (d) => map[d] ?? d);
}

/** Render a section header (markdown). */
export function header(level: 1 | 2 | 3, text: string): string {
    return "#".repeat(level) + " " + text;
}

/** Render a labeled metadata line. */
export function meta(label: string, value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === "") return "";
    return `- **${label}**: ${value}`;
}
