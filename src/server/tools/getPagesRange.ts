import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { MULTIPAGE_CHAR_BUDGET } from "../constants.js";
import type { Helper } from "../helper.js";
import { trimPagesByBudget } from "../longtext.js";
import type { PageStore } from "../pages.js";
import { ResponseFormatInput } from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { formatShortCitation } from "../citation.js";
import { num, pick } from "../i18n/labels.js";
import { getPagesRangeLabels } from "../i18n/tools/getPagesRange.js";
import { requireDownloadedBook } from "../gate.js";

export const getPagesRangeInputShape = {
    book_id: z.number().int().positive().describe("The book id."),
    start_page_id: z.number().int().positive().describe("First page_id (inclusive)."),
    count: z.number().int().min(1).max(20).default(5).describe("How many consecutive pages to fetch (1–20, default 5). Use shamela_get_book_section for full chapter reads."),
    keep_html: z.boolean().default(false).describe("Preserve inline HTML markers."),
    ...ResponseFormatInput };
export const getPagesRangeInput = z.object(getPagesRangeInputShape).strict();

export interface RangePage {
    page_id: number;
    printed_page: string | null;
    part: string | null;
    body: string;
    foot: string;
    comment: string;
    /** Reference for this page, so a quote lifted from a range keeps its source. */
    citation: string;
}

export interface GetPagesRangeOutput {
    /** True when page numbers are Shamela's automatic count, not the print's. */
    citation_auto_numbered?: boolean;
    book_id: number;
    book_name: string;
    author_name: string | null;
    start_page_id: number;
    count: number;
    has_more: boolean;
    next_start_page_id: number | null;
    /** Display advice when the range was cut short to stay within the char budget. */
    _display: string | null;
    pages: RangePage[];
}

const HTML_TAG_RE = /<[^>]+>/g;

export async function runGetPagesRange(
    helper: Helper,
    catalog: Catalog,
    pages: PageStore,
    args: z.infer<typeof getPagesRangeInput>,
): Promise<RenderedResponse<GetPagesRangeOutput>> {
    const rec = requireDownloadedBook(catalog, args.book_id);

    const rows = await pages.getPagesRange(args.book_id, args.start_page_id, args.count);
    const pageIds = rows.map((r) => r.page_id);
    const batch = pageIds.length
        ? await helper.request<{
              results: Array<{ page_id: number; body: string; foot: string; comment: string }>;
          }>("get_pages_batch", { book_id: args.book_id, page_ids: pageIds })
        : { results: [] };
    const contentMap = new Map(batch.results.map((r) => [r.page_id, r]));
    const total = await pages.pageCount(args.book_id);

    const stripIfHtml = (s: string) => (args.keep_html ? s : s.replace(HTML_TAG_RE, "").replace(/\r/g, "\n"));

    const mainAuthor = catalog.bookAuthors(rec)[0] ?? null;
    const allPages: RangePage[] = await Promise.all(
        rows.map(async (r) => {
            const c = contentMap.get(r.page_id) ?? { body: "", foot: "", comment: "" };
            const printed = await pages.printedPage(args.book_id, r.page_id);
            return {
                page_id: r.page_id,
                printed_page: printed,
                part: r.part,
                body: stripIfHtml(c.body),
                foot: stripIfHtml(c.foot),
                comment: stripIfHtml(c.comment),
                // Per page, not per range: a quote lifted from the middle of a
                // range must carry its own page, not the range's first.
                citation: formatShortCitation(rec, mainAuthor, {
                    page_id: r.page_id,
                    part: r.part,
                    // The numeric column, not the printed label: printedPage
                // formats a part-bearing page as "1/ 5", and Number() of
                // that is NaN — which passes every null check and reaches
                // the reader as «ص NaN».
                page: r.page,
                }) };
        }),
    );

    // #16 — stop early when the bodies are large, so a 20-page range of
    // long pages doesn't dump. The requested page count is still the upper bound.
    const { kept: pagesOut, trimmed } = trimPagesByBudget(allPages, MULTIPAGE_CHAR_BUDGET);
    const lastId = pagesOut.length ? pagesOut[pagesOut.length - 1]!.page_id : args.start_page_id - 1;
    const hasMore = lastId < total;
    const display = trimmed
        ? pick(getPagesRangeLabels).trimmed(pagesOut.length, allPages.length, String(lastId + 1))
        : null;

    const out: GetPagesRangeOutput = {
        book_id: args.book_id,
        book_name: rec.book_name,
        author_name: catalog.mainAuthorName(rec),
        start_page_id: args.start_page_id,
        count: pagesOut.length,
        has_more: hasMore,
        next_start_page_id: hasMore ? lastId + 1 : null,
        _display: display,
        citation_auto_numbered: rec.printed !== 1,
        pages: pagesOut };
    return renderResponse(out, args.response_format, (data) => {
        const L = pick(getPagesRangeLabels);
        const lines = [header(1, L.heading(data.book_name, String(data.start_page_id)))];
        if (data.author_name) lines.push(`*${data.author_name}*`);
        for (const p of data.pages) {
            // Two numbers, two jobs. The printed page is prose a reader quotes,
            // so it follows the language into Arabic-Indic digits; the page_id
            // is what the next call is built from and stays Latin, per the rule
            // in i18n/labels.ts. One slot used to hold whichever of the two
            // existed, which is how a range of ids ended up labelling pages by
            // their printed numbers.
            lines.push(
                "",
                header(3, L.page(p.printed_page !== null ? num(p.printed_page) : null, String(p.page_id))),
            );
            if (p.body) lines.push(p.body);
            if (p.foot) lines.push("", `_${p.foot}_`);
        }
        if (data._display) lines.push("", `> *${data._display}*`);
        else if (data.has_more) lines.push("", `*${L.more(String(data.next_start_page_id))}*`);
        return lines.join("\n");
    });
}
