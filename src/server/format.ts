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
 *   2. Call `renderResponse(payload, response_format, renderMarkdown)` to get
 *      the text envelope. The renderer handles truncation transparently.
 *   3. Return `{ content, structuredContent: truncatedPayload }`.
 */

import { CHARACTER_LIMIT, STRUCTURED_LIMIT } from "./constants.js";

export interface RenderedResponse<T> {
    content: Array<{ type: "text"; text: string }>;
    structuredContent: T;
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
    // `returned` still wins when a tool states it: some tools report a count
    // for a slice they do not carry in `results`. Keeping it honest after a
    // trim is fitToBudget's job, and it does it by rewriting the field it can
    // prove was describing the array it shortened.
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

/**
 * Measure a payload the way structuredContent actually travels: compact.
 *
 * Measuring the indented form instead looks safer and is not. Indentation adds
 * no information and roughly doubles the count, so budgeting against it drops
 * rows from ordinary result pages to buy back whitespace — a fifty-row search
 * came back with thirty-five. The text channel is kept in range by choosing its
 * spelling below, not by making every payload pay for the widest one.
 */
const measure = (payload: unknown): number => JSON.stringify(payload)?.length ?? 0;

interface Fitted<T> {
    payload: T;
    /** field name → how many elements were dropped from it. */
    dropped: Record<string, number>;
    droppedTotal: number;
}

/**
 * Shrink a payload to a byte budget by dropping whole array elements.
 *
 * The old truncation sliced the rendered string at a character offset. That cut
 * mid-word in markdown, which is survivable, and mid-string in JSON, which is
 * not: a caller who asked for `response_format:"json"` got something that would
 * not parse. Dropping whole elements instead means every response is still
 * well-formed in the format it was asked for.
 *
 * Elements come off the tail of whichever array is currently largest, 30% at a
 * time, so a payload with two big lists (rows AND a list of ids) sheds from both
 * rather than emptying the first while the second holds the budget hostage. One
 * element is always kept, so the shape of a row stays legible to the caller.
 *
 * This is a backstop and should almost never fire. A tool that hits it routinely
 * is a tool whose `limit` default is wrong, or that has no `limit` at all — the
 * fix belongs there, not here.
 */
function fitToBudget<T extends object>(payload: T, budget: number): Fitted<T> {
    const dropped: Record<string, number> = {};
    if (measure(payload) <= budget) return { payload, dropped, droppedTotal: 0 };

    const source = payload as Record<string, unknown>;
    const clone: Record<string, unknown> = { ...source };
    /** Shortest a text field is allowed to get before we stop shrinking it. */
    const STRING_FLOOR = 200;
    let droppedTotal = 0;

    // Bounded: each pass removes ~30% of the largest shrinkable field, so the
    // budget is reached in log time. The guard only stops a pathological
    // payload whose size lives somewhere no trim can reach.
    for (let pass = 0; pass < 200 && measure(clone) > budget; pass++) {
        let key: string | null = null;
        let largest = -1;
        for (const [k, v] of Object.entries(clone)) {
            const shrinkable =
                (Array.isArray(v) && v.length > 1) || (typeof v === "string" && v.length > STRING_FLOOR);
            if (!shrinkable) continue;
            const size = measure(v);
            if (size > largest) {
                largest = size;
                key = k;
            }
        }
        if (key === null) break; // nothing left that trimming can shrink

        const value = clone[key];
        if (Array.isArray(value)) {
            const keep = Math.max(1, Math.floor(value.length * 0.7));
            dropped[key] = (dropped[key] ?? 0) + (value.length - keep);
            droppedTotal += value.length - keep;
            clone[key] = value.slice(0, keep);
        } else {
            // A single long string — a page body, say. Cutting it here keeps
            // the document well-formed, which slicing the rendered JSON did
            // not: that produced a value ending mid-character and a document
            // that would not parse.
            const text = value as string;
            const keep = Math.max(STRING_FLOOR, Math.floor(text.length * 0.7));
            dropped[key] = (dropped[key] ?? 0) + (text.length - keep);
            droppedTotal += text.length - keep;
            clone[key] = text.slice(0, keep) + " […]";
        }
    }

    // Keep any count field that was describing an array we shortened. Only a
    // field that matched the array's length before the trim can be proven to
    // have been about it, so only that one is rewritten — a count that meant
    // something else is left alone.
    for (const [key, v] of Object.entries(clone)) {
        if (!Array.isArray(v) || dropped[key] === undefined) continue;
        const before = (source[key] as unknown[]).length;
        for (const countField of ["returned", "returned_count"]) {
            if (clone[countField] === before) clone[countField] = v.length;
        }
    }

    return { payload: clone as T, dropped, droppedTotal };
}

export function renderResponse<T extends object>(
    payload_: T,
    format: "markdown" | "json",
    renderMarkdown: (data: T) => string,
): RenderedResponse<T> {
    // Fit BEFORE rendering, so both channels describe the same thing. The
    // previous order rendered the full payload, cut the text, and shipped the
    // structured copy whole — a response that announced it had been truncated
    // to 24,800 characters while carrying 248,000 in the channel nobody
    // measured. Clients that count both rejected the result outright.
    const fitted = fitToBudget(payload_, STRUCTURED_LIMIT);
    const counts = deriveCounts(fitted.payload as Record<string, unknown>);
    const withCounts = (counts ? { ...fitted.payload, ...counts } : fitted.payload) as T;

    const payload =
        fitted.droppedTotal > 0
            ? ({
                  ...withCounts,
                  truncated: true,
                  truncation_message: droppedMessage(fitted.dropped),
              } as T)
            : withCounts;

    // Indented while it fits, compact when it does not. Both are the same
    // document and both parse; the indented one is only easier to read. The
    // compact form is bounded by the budget above, so the JSON text channel
    // cannot overrun — and never needs the character cut that used to leave it
    // ending mid-string and unparseable.
    let text: string;
    if (format === "json") {
        const pretty = JSON.stringify(payload, null, 2);
        text = pretty.length <= CHARACTER_LIMIT ? pretty : JSON.stringify(payload);
    } else {
        text = renderMarkdown(payload);
    }

    // Markdown can still overrun on a payload with no array to shed — one very
    // long page body, say. Prose survives a character cut; JSON does not, and
    // by construction it cannot need one, because the payload was fitted to the
    // pretty-printed size above.
    if (format !== "json" && text.length > CHARACTER_LIMIT) {
        const head = text.slice(0, CHARACTER_LIMIT - 200);
        const message = `\n\n[Response truncated from ${text.length} to ${head.length} characters. Use 'limit' or 'offset' parameters to page through more results, or add a tighter scope to narrow the result set.]`;
        return {
            content: [{ type: "text", text: head + message }],
            structuredContent: { ...payload, truncated: true, truncation_message: message.trim() } as T,
        };
    }

    return { content: [{ type: "text", text }], structuredContent: payload };
}

function droppedMessage(dropped: Record<string, number>): string {
    const parts = Object.entries(dropped).map(([field, n]) => `${n} from \`${field}\``);
    return `[Response too large: dropped ${parts.join(", ")}. Counts and totals still describe the whole result set. Use 'limit'/'offset' to page, or a tighter scope.]`;
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
