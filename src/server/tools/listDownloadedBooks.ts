import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { ResponseFormatInput, PaginationInput } from "../schemas.js";
import { renderResponse, type RenderedResponse, header, arabize } from "../format.js";

export const listDownloadedBooksInputShape = {
    ...PaginationInput,
    ...ResponseFormatInput,
};
export const listDownloadedBooksInput = z.object(listDownloadedBooksInputShape).strict();

export interface DownloadedBookRow {
    book_id: number;
    book_name: string;
    author_name: string | null;
    category: string | null;
    book_date: number | null;
}

export interface ListDownloadedBooksOutput {
    total: number;
    returned: number;
    offset: number;
    has_more: boolean;
    next_offset?: number;
    books: DownloadedBookRow[];
}

export function runListDownloadedBooks(
    catalog: Catalog,
    args: z.infer<typeof listDownloadedBooksInput>,
): RenderedResponse<ListDownloadedBooksOutput> {
    const ids = Array.from(catalog.downloadedBookIds()).sort((a, b) => a - b);
    const slice = ids.slice(args.offset, args.offset + args.limit);
    const books: DownloadedBookRow[] = slice.map((id) => {
        const rec = catalog.bookRecord(id);
        return {
            book_id: id,
            book_name: rec?.book_name ?? `(unknown ${id})`,
            author_name: rec ? catalog.mainAuthorName(rec) : null,
            category: rec ? catalog.categoryPath(rec.book_category)[0] ?? null : null,
            book_date: rec?.book_date ?? null,
        };
    });
    const hasMore = args.offset + slice.length < ids.length;
    const out: ListDownloadedBooksOutput = {
        total: ids.length,
        returned: books.length,
        offset: args.offset,
        has_more: hasMore,
        ...(hasMore ? { next_offset: args.offset + slice.length } : {}),
        books,
    };
    return renderResponse(out, args.response_format, (data) => {
        const lines = [
            header(1, `الكتب المنزَّلة محليًّا (${arabize(data.total)})`),
            `عرض ${arabize(data.returned)} من ${arabize(data.total)} ابتداءً من ${arabize(data.offset)}`,
            "",
        ];
        for (const b of data.books) {
            lines.push(`## ${b.book_name} (id=${b.book_id})`);
            if (b.author_name) lines.push(`- المؤلف: ${b.author_name}`);
            if (b.category) lines.push(`- التصنيف: ${b.category}`);
            if (b.book_date) lines.push(`- سنة التأليف: ${arabize(b.book_date)}هـ`);
            lines.push("");
        }
        if (data.has_more) lines.push(`*للمزيد، استخدم \`offset=${data.next_offset}\`.*`);
        return lines.join("\n");
    });
}
