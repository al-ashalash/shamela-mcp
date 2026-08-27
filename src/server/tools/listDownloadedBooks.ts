import { z } from "zod";

import type { Catalog } from "../catalog.js";
import type { PageStore } from "../pages.js";
import { ResponseFormatInput, PaginationInput } from "../schemas.js";
import { renderResponse, type RenderedResponse, header } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { listDownloadedBooksLabels } from "../i18n/tools/listDownloadedBooks.js";

export const listDownloadedBooksInputShape = {
    category_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
            "Optional: restrict to one category (use shamela_list_categories for IDs). Shamela is a multi-category library — e.g. tafsir spans category 3 (التفسير), 4 (علوم القرآن وأصول التفسير), and 5 (التجويد والقراءات).",
        ),
    ...PaginationInput,
    ...ResponseFormatInput,
};
export const listDownloadedBooksInput = z.object(listDownloadedBooksInputShape).strict();

export type ContentStatus = "readable" | "downloaded_no_pages";

export interface DownloadedBookRow {
    book_id: number;
    book_name: string;
    author_name: string | null;
    category_id: number | null;
    category: string | null;
    book_date: number | null;
    /** "readable" = per-book DB has pages; "downloaded_no_pages" = flagged but text not openable. */
    content_status: ContentStatus;
}

export interface CategoryTally {
    category_id: number;
    category_name: string;
    count: number;
}

export interface ListDownloadedBooksOutput {
    total: number;
    returned: number;
    offset: number;
    has_more: boolean;
    next_offset?: number;
    filtered_category_id: number | null;
    /** Distribution of the WHOLE downloaded library across categories (registry view). */
    library_by_category: CategoryTally[];
    books: DownloadedBookRow[];
}

export async function runListDownloadedBooks(
    catalog: Catalog,
    pages: PageStore,
    args: z.infer<typeof listDownloadedBooksInput>,
): Promise<RenderedResponse<ListDownloadedBooksOutput>> {
    const allIds = Array.from(catalog.downloadedBookIds());

    // Whole-library distribution across categories (the "registry" overview),
    // computed before any category filter so the model always sees the landscape.
    const tally = new Map<number, number>();
    for (const id of allIds) {
        const rec = catalog.bookRecord(id);
        const cid = rec?.book_category ?? -1;
        tally.set(cid, (tally.get(cid) ?? 0) + 1);
    }
    const libraryByCategory: CategoryTally[] = Array.from(tally.entries())
        .map(([cid, count]) => ({
            category_id: cid,
            category_name:
                cid >= 0
                    ? catalog.category(cid)?.category_name ?? `(${cid})`
                    : pick(listDownloadedBooksLabels).uncategorised,
            count,
        }))
        .sort((a, b) => b.count - a.count);

    let ids = allIds;
    if (args.category_id !== undefined) {
        ids = ids.filter((id) => catalog.bookRecord(id)?.book_category === args.category_id);
    }
    ids.sort((a, b) => a - b);

    const slice = ids.slice(args.offset, args.offset + args.limit);
    // Sequential on purpose: bookHasContent opens the per-book sql.js DB
    // (whole file in WASM memory). A concurrent Promise.all over a large
    // slice holds up to `limit` DBs in flight at once and can exhaust the
    // WASM heap ("INTERNAL: out of memory") on big libraries.
    const books: DownloadedBookRow[] = [];
    for (const id of slice) {
        const rec = catalog.bookRecord(id);
        const hasContent = await pages.bookHasContent(id);
        books.push({
            book_id: id,
            book_name: rec?.book_name ?? `(unknown ${id})`,
            author_name: rec ? catalog.mainAuthorName(rec) : null,
            category_id: rec?.book_category ?? null,
            category: rec ? catalog.categoryPath(rec.book_category)[0] ?? null : null,
            book_date: rec?.book_date ?? null,
            content_status: hasContent ? "readable" : "downloaded_no_pages",
        });
    }
    const hasMore = args.offset + slice.length < ids.length;
    const out: ListDownloadedBooksOutput = {
        total: ids.length,
        returned: books.length,
        offset: args.offset,
        has_more: hasMore,
        ...(hasMore ? { next_offset: args.offset + slice.length } : {}),
        filtered_category_id: args.category_id ?? null,
        library_by_category: libraryByCategory,
        books,
    };
    return renderResponse(out, args.response_format, (data) => {
        const L = pick(listDownloadedBooksLabels);
        const category = data.filtered_category_id !== null
            ? String(catalog.category(data.filtered_category_id)?.category_name ?? data.filtered_category_id)
            : null;
        const lines = [
            header(1, L.heading(category, num(data.total))),
            L.counts(num(data.returned), num(data.total), num(data.offset)),
            "",
        ];
        if (data.filtered_category_id === null && data.library_by_category.length) {
            lines.push(header(3, L.byCategoryHeading));
            for (const t of data.library_by_category.slice(0, 12)) {
                // Real category names come from the catalog and stay as they are
                // in every language; only the synthetic "no category" bucket
                // (category_id < 0, the one this file invents) is translated.
                const name = t.category_id < 0 ? L.uncategorized : t.category_name;
                lines.push(`- ${name}: ${num(t.count)}`);
            }
            lines.push("");
        }
        for (const b of data.books) {
            lines.push(`## ${b.book_name} (id=${String(b.book_id)})`);
            // Under the name, not inside it — a heading is what a reader copies
            // when they refer to the book, and a caveat welded to it travels
            // wherever the name goes.
            if (b.content_status !== "readable") lines.push(`**${L.noPagesWarning}**`);
            if (b.author_name) lines.push(`- ${L.author}: ${b.author_name}`);
            if (b.category) lines.push(`- ${L.category}: ${b.category} (id=${String(b.category_id)})`);
            if (b.book_date) lines.push(`- ${L.composedYear}: ${L.hijri(num(b.book_date))}`);
            lines.push("");
        }
        if (data.has_more) lines.push(L.more(String(data.next_offset)));
        return lines.join("\n");
    });
}
