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

import { CHARACTER_LIMIT } from "./constants.js";

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

export function renderResponse<T extends object>(
    payload_: T,
    format: "markdown" | "json",
    renderMarkdown: (data: T) => string,
): RenderedResponse<T> {
    const counts = deriveCounts(payload_ as Record<string, unknown>);
    const payload = (counts ? { ...payload_, ...counts } : payload_) as T;
    const text = format === "json" ? JSON.stringify(payload, null, 2) : renderMarkdown(payload);
    const truncated = enforceCharLimit(text);
    if (truncated.text === text) {
        return {
            content: [{ type: "text", text }],
            structuredContent: payload,
        };
    }
    // Add truncation flags onto the structured content too so callers can detect.
    const stamped = {
        ...payload,
        truncated: true,
        truncation_message: truncated.message,
    };
    return {
        content: [{ type: "text", text: truncated.text }],
        structuredContent: stamped as T,
    };
}

function enforceCharLimit(text: string): { text: string; message?: string } {
    if (text.length <= CHARACTER_LIMIT) return { text };
    const head = text.slice(0, CHARACTER_LIMIT - 200);
    const message = `\n\n[Response truncated from ${text.length} to ${head.length} characters. Use 'limit' or 'offset' parameters to page through more results, or add a tighter scope to narrow the result set.]`;
    return { text: head + message, message };
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
