/**
 * shamela_dump_book (#63) — a book's whole text, in the shape a pipeline wants.
 *
 * The reading tools answer a reader: they fetch a page, a range, a chapter, and
 * they render it for someone about to quote it. A retrieval pipeline wants the
 * opposite — every page of a book, in order, as records it can chunk and embed,
 * each carrying enough of its own provenance that a fragment retrieved months
 * later still knows which book and which printed page it came from.
 *
 * Assembling that out of `shamela_get_pages_range` was possible and wrong: the
 * range tool trims itself to a reading budget and renders markdown, so a
 * pipeline built on it silently lost pages and had to parse prose back into
 * data.
 *
 * The dump is still bounded — a book of eight thousand pages is not a single
 * response, and pretending otherwise would truncate somewhere unstated. It
 * pages by character budget and hands back a cursor, so a caller's loop is
 * `while (has_more) dump(next_start_page_id)`. What it will not do is stop
 * early and stay quiet about it.
 */

import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { formatShortCitation } from "../citation.js";
import { requireDownloadedBook } from "../gate.js";
import type { Helper } from "../helper.js";
import type { PageStore } from "../pages.js";
import { ResponseFormatInput } from "../schemas.js";
import { arabize, header, renderResponse, type RenderedResponse } from "../format.js";

/**
 * Characters of page text per call, by default.
 *
 * Chosen so the JSON rendering of a full response stays inside the protocol's
 * character limit: above it the text channel is cut, and a pipeline reading the
 * text channel rather than the structured one would lose the tail. Callers that
 * read `structuredContent` — which is never cut — can raise it.
 */
const DEFAULT_CHAR_BUDGET = 18_000;
const MAX_CHAR_BUDGET = 60_000;

const HTML_TAG_RE = /<[^>]+>/g;

export const dumpBookInputShape = {
    book_id: z.number().int().positive().describe("The book to export. Must be downloaded."),
    start_page_id: z
        .number()
        .int()
        .min(1)
        .default(1)
        .describe("Resume cursor: the first page_id to include. Pass `next_start_page_id` from the previous call to continue. Defaults to the start of the book."),
    max_chars: z
        .number()
        .int()
        .min(1_000)
        .max(MAX_CHAR_BUDGET)
        .default(DEFAULT_CHAR_BUDGET)
        .describe(`Characters of page text per call (default ${DEFAULT_CHAR_BUDGET}, max ${MAX_CHAR_BUDGET}). Above ~${DEFAULT_CHAR_BUDGET} the rendered text channel is truncated by the protocol; structuredContent is always complete.`),
    include: z
        .array(z.enum(["body", "foot", "comment"]))
        .default(["body", "foot"])
        .describe("Which parts of each page to export. Drop 'foot' to halve the volume of a heavily annotated edition."),
    keep_html: z
        .boolean()
        .default(false)
        .describe("Keep Shamela's inline markup. Off by default: a pipeline wants plain text."),
    include_titles: z
        .boolean()
        .default(true)
        .describe("Attach the chapter title in force at each page, so a chunk carries its context. Costs one extra index read for the book."),
    ...ResponseFormatInput,
};
export const dumpBookInput = z.object(dumpBookInputShape).strict();

export interface DumpPage {
    page_id: number;
    printed_page: string | null;
    part: string | null;
    /** The chapter heading in force at this page, when titles were requested. */
    title: string | null;
    body: string;
    foot: string;
    comment: string;
    /** Self-contained reference, so a chunk lifted out of order keeps its source. */
    citation: string;
}

export interface DumpBookOutput {
    book_id: number;
    book_name: string;
    author_name: string | null;
    author_death_year: number | null;
    category: string | null;
    /** Pages in the book, by the highest page id it holds. */
    total_pages: number;
    start_page_id: number;
    /** Pages in THIS response. */
    returned: number;
    /** Characters of page text in this response. */
    chars: number;
    has_more: boolean;
    next_start_page_id: number | null;
    /** True when Shamela numbered the pages itself rather than reading them off the print. */
    citation_auto_numbered: boolean;
    /** Said out loud when the budget ended the page early. */
    _display: string | null;
    pages: DumpPage[];
}

/** Pages read per helper round-trip while filling the budget. */
const CHUNK = 25;

export async function runDumpBook(
    helper: Helper,
    catalog: Catalog,
    pages: PageStore,
    args: z.infer<typeof dumpBookInput>,
): Promise<RenderedResponse<DumpBookOutput>> {
    const rec = requireDownloadedBook(catalog, args.book_id);
    const mainAuthor = catalog.bookAuthors(rec)[0] ?? null;
    const total = await pages.pageCount(args.book_id);

    // The heading in force at a page: the last title at or before it. Read once
    // for the book, not once per page.
    let titleAt: ((pageId: number) => string | null) | null = null;
    if (args.include_titles) {
        titleAt = await buildTitleLookup(helper, pages, args.book_id);
    }

    const stripIfHtml = (s: string) => (args.keep_html ? s : s.replace(HTML_TAG_RE, "").replace(/\r/g, "\n"));
    const wanted = new Set(args.include);

    const out: DumpPage[] = [];
    let chars = 0;
    let cursor = args.start_page_id;
    let exhausted = false;
    let budgetStopped = false;

    while (chars < args.max_chars && !exhausted) {
        const rows = await pages.getPagesRange(args.book_id, cursor, CHUNK);
        if (rows.length === 0) {
            exhausted = true;
            break;
        }
        const pageIds = rows.map((r) => r.page_id);
        const batch = await helper.request<{
            results: Array<{ page_id: number; body: string; foot: string; comment: string }>;
        }>("get_pages_batch", { book_id: args.book_id, page_ids: pageIds });
        const contentById = new Map(batch.results.map((r) => [r.page_id, r]));
        const printedById = await pages.printedPages(args.book_id, pageIds);

        for (const r of rows) {
            const c = contentById.get(r.page_id) ?? { body: "", foot: "", comment: "" };
            const body = wanted.has("body") ? stripIfHtml(c.body) : "";
            const foot = wanted.has("foot") ? stripIfHtml(c.foot) : "";
            const comment = wanted.has("comment") ? stripIfHtml(c.comment) : "";
            const size = body.length + foot.length + comment.length;

            // One page always comes back, however long it is — a budget that can
            // return nothing is a loop that never advances.
            if (out.length > 0 && chars + size > args.max_chars) {
                budgetStopped = true;
                break;
            }

            const printed = printedById.get(r.page_id) ?? null;
            out.push({
                page_id: r.page_id,
                printed_page: printed,
                part: r.part,
                title: titleAt ? titleAt(r.page_id) : null,
                body,
                foot,
                comment,
                citation: formatShortCitation(rec, mainAuthor, {
                    page_id: r.page_id,
                    part: r.part,
                    page: printed !== null ? Number(printed) : null,
                }),
            });
            chars += size;
            cursor = r.page_id + 1;
        }
        if (budgetStopped) break;
        if (rows.length < CHUNK) exhausted = true;
    }

    const lastId = out.length ? out[out.length - 1]!.page_id : args.start_page_id - 1;
    const hasMore = lastId < total;

    const payload: DumpBookOutput = {
        book_id: args.book_id,
        book_name: rec.book_name,
        author_name: catalog.mainAuthorName(rec),
        author_death_year: mainAuthor?.death_year ?? null,
        category: catalog.categoryPath(rec.book_category)[0] ?? null,
        total_pages: total,
        start_page_id: args.start_page_id,
        returned: out.length,
        chars,
        has_more: hasMore,
        next_start_page_id: hasMore ? lastId + 1 : null,
        citation_auto_numbered: rec.printed !== 1,
        _display: hasMore
            ? `صُدِّرت ${arabize(out.length)} صفحة (${arabize(chars)} حرفًا). أكمِل التصدير بـ start_page_id=${lastId + 1}.`
            : null,
        pages: out,
    };

    return renderResponse(payload, args.response_format, (data) => {
        // The markdown channel is a manifest, not the text: whoever asked for a
        // whole book in JSON is not reading it here, and dumping it twice would
        // only get the response truncated.
        const lines = [header(1, `تصدير: ${data.book_name}`)];
        if (data.author_name) {
            lines.push(`*${data.author_name}*${data.author_death_year ? ` — ${arabize(data.author_death_year)}هـ` : ""}`);
        }
        lines.push("");
        lines.push(
            `صُدِّرت **${arabize(data.returned)}** صفحة (${arabize(data.chars)} حرفًا) من أصل ${arabize(data.total_pages)}، ابتداءً من الصفحة ${arabize(data.start_page_id)}.`,
        );
        if (data.category) lines.push(`التصنيف: ${data.category}.`);
        if (data.citation_auto_numbered) {
            lines.push("");
            lines.push("> *ترقيم الصفحات آليٌّ من الشاملة لا من المطبوع، فاحترز في الإحالة.*");
        }
        lines.push("");
        lines.push("النصّ في `structuredContent.pages` — كل صفحة بمتنها وحاشيتها وعنوان بابها وإحالتها.");
        if (data._display) lines.push("", `> *${data._display}*`);
        return lines.join("\n");
    });
}

/**
 * A lookup from page id to the chapter heading in force there.
 *
 * The structural rows live in the book's own file and the heading text lives in
 * the search index, so the two are joined once per call. A book whose titles the
 * index has not read yet simply gets no headings — a missing heading is a
 * blemish on a chunk, not a reason to refuse the export.
 */
async function buildTitleLookup(
    helper: Helper,
    pages: PageStore,
    bookId: number,
): Promise<(pageId: number) => string | null> {
    let rows: Array<{ title_id: number; page_id: number }>;
    try {
        rows = await pages.allTitleRows(bookId);
    } catch {
        return () => null;
    }
    if (rows.length === 0) return () => null;

    let textById = new Map<number, string>();
    try {
        const batch = await helper.request<{
            results: Array<{ title_id: number; title_text: string }>;
        }>("get_titles_batch", { book_id: bookId, title_ids: rows.map((r) => r.title_id) });
        textById = new Map(batch.results.map((r) => [r.title_id, r.title_text]));
    } catch {
        return () => null;
    }

    // Sorted starts, so a page finds its heading by binary search rather than by
    // walking a table that can hold tens of thousands of rows.
    const starts = rows
        .map((r) => ({ page: r.page_id, text: textById.get(r.title_id) ?? "" }))
        .filter((r) => r.text !== "")
        .sort((a, b) => a.page - b.page);
    if (starts.length === 0) return () => null;

    return (pageId: number) => {
        let lo = 0;
        let hi = starts.length - 1;
        let found: string | null = null;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (starts[mid]!.page <= pageId) {
                found = starts[mid]!.text;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return found;
    };
}
