import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { bookNotDownloaded, bookNotFound } from "../errors.js";
import type { BookPart, PageStore } from "../pages.js";
import { ResponseFormatInput } from "../schemas.js";
import { arabize, header, renderResponse, type RenderedResponse } from "../format.js";

export const getBookPartsInputShape = {
    book_id: z.number().int().positive().describe("The book id."),
    ...ResponseFormatInput,
};
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
    const book = catalog.bookRecord(args.book_id);
    if (!book) throw bookNotFound(args.book_id);
    if (book.major_ondisk === 0) throw bookNotDownloaded(args.book_id, book.book_name);
    const parts = await pages.getBookParts(args.book_id);
    const total = await pages.pageCount(args.book_id);
    const out: GetBookPartsOutput = {
        book_id: args.book_id,
        book_name: book.book_name,
        is_multi_volume: parts.length > 0,
        total_pages: total,
        parts,
    };
    return renderResponse(out, args.response_format, (data) => {
        const lines = [header(1, `أجزاء «${data.book_name}»`)];
        lines.push(`- **مجلَّد متعدِّد الأجزاء؟** ${data.is_multi_volume ? "نعم" : "لا"}`);
        lines.push(`- **عدد الصفحات الإجمالي**: ${arabize(data.total_pages)}`);
        if (data.parts.length) {
            lines.push("", header(2, "الأجزاء"));
            for (const p of data.parts) {
                lines.push(
                    `- **${p.part}**: ${arabize(p.page_count)} صفحة (page_id ${arabize(p.first_page_id)}–${arabize(p.last_page_id)})`,
                );
            }
        } else {
            lines.push("", "_هذا الكتاب من جزء واحد._");
        }
        return lines.join("\n");
    });
}
