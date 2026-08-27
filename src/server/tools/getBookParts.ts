import { z } from "zod";

import type { Catalog } from "../catalog.js";
import type { BookPart, PageStore } from "../pages.js";
import { ResponseFormatInput } from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { getBookPartsLabels } from "../i18n/tools/getBookParts.js";
import { requireDownloadedBook } from "../gate.js";

export const getBookPartsInputShape = {
    book_id: z.number().int().positive().describe("The book id."),
    ...ResponseFormatInput };
export const getBookPartsInput = z.object(getBookPartsInputShape).strict();

export interface GetBookPartsOutput {
    book_id: number;
    book_name: string;
    is_multi_volume: boolean;
    total_pages: number;
    parts: BookPart[];
}

export async function runGetBookParts(
    catalog: Catalog,
    pages: PageStore,
    args: z.infer<typeof getBookPartsInput>,
): Promise<RenderedResponse<GetBookPartsOutput>> {
    // Served from the per-book SQLite file, so a book downloaded during
    // this session works right away — no Lucene reader involved.
    const book = requireDownloadedBook(catalog, args.book_id, { needsTextIndex: false });
    const parts = await pages.getBookParts(args.book_id);
    const total = await pages.pageCount(args.book_id);
    const out: GetBookPartsOutput = {
        book_id: args.book_id,
        book_name: book.book_name,
        is_multi_volume: parts.length > 0,
        total_pages: total,
        parts };
    return renderResponse(out, args.response_format, (data) => {
        const L = pick(getBookPartsLabels);
        const lines = [header(1, L.heading(data.book_name))];
        lines.push(`- **${L.multiVolume}** ${data.is_multi_volume ? L.yes : L.no}`);
        lines.push(`- **${L.totalPages}**: ${num(data.total_pages)}`);
        if (data.parts.length) {
            lines.push("", header(2, L.partsHeading));
            for (const p of data.parts) {
                lines.push(
                    L.partLine(p.part, num(p.page_count), String(p.first_page_id), String(p.last_page_id)),
                );
            }
        } else {
            lines.push("", L.singleVolume);
        }
        return lines.join("\n");
    });
}
