import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { bookNotDownloaded, bookNotFound } from "../errors.js";
import type { Helper } from "../helper.js";
import type { PageStore } from "../pages.js";
import { ResponseFormatInput } from "../schemas.js";
import { arabize, header, renderResponse, type RenderedResponse } from "../format.js";

export const getPagesRangeInputShape = {
    book_id: z.number().int().positive().describe("The book id."),
    start_page_id: z.number().int().positive().describe("First page_id (inclusive)."),
    count: z.number().int().min(1).max(20).default(5).describe("How many consecutive pages to fetch (1–20, default 5). Use shamela_get_book_section for full chapter reads."),
    keep_html: z.boolean().default(false).describe("Preserve inline HTML markers."),
    ...ResponseFormatInput,
};
export const getPagesRangeInput = z.object(getPagesRangeInputShape).strict();

export interface RangePage {
    page_id: number;
    printed_page: string | null;
    part: string | null;
    body: string;
    foot: string;
    comment: string;
}

export interface GetPagesRangeOutput {
    book_id: number;
    book_name: string;
    author_name: string | null;
    start_page_id: number;
    count: number;
    has_more: boolean;
    pages: RangePage[];
}

const HTML_TAG_RE = /<[^>]+>/g;

export async function runGetPagesRange(
    helper: Helper,
    catalog: Catalog,
    pages: PageStore,
    args: z.infer<typeof getPagesRangeInput>,
): Promise<RenderedResponse<GetPagesRangeOutput>> {
    const rec = catalog.bookRecord(args.book_id);
    if (!rec) throw bookNotFound(args.book_id);
    if (rec.major_ondisk === 0) throw bookNotDownloaded(args.book_id, rec.book_name);

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

    const pagesOut: RangePage[] = await Promise.all(
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
            };
        }),
    );
    const lastId = pageIds.length ? pageIds[pageIds.length - 1]! : args.start_page_id - 1;
    const out: GetPagesRangeOutput = {
        book_id: args.book_id,
        book_name: rec.book_name,
        author_name: catalog.mainAuthorName(rec),
        start_page_id: args.start_page_id,
        count: pagesOut.length,
        has_more: lastId < total,
        pages: pagesOut,
    };
    return renderResponse(out, args.response_format, (data) => {
        const lines = [header(1, `${data.book_name} — صفحات ${arabize(data.start_page_id)}+`)];
        if (data.author_name) lines.push(`*${data.author_name}*`);
        for (const p of data.pages) {
            lines.push("", header(3, `صفحة ${arabize(p.printed_page ?? p.page_id)}`));
            if (p.body) lines.push(p.body);
            if (p.foot) lines.push("", `_${p.foot}_`);
        }
        if (data.has_more) lines.push("", `*للمزيد، استخدم \`start_page_id=${lastId + 1}\`.*`);
        return lines.join("\n");
    });
}
