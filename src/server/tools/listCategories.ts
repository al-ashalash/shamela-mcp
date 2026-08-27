import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { ResponseFormatInput } from "../schemas.js";
import { renderResponse, type RenderedResponse, header } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { listCategoriesLabels } from "../i18n/tools/listCategories.js";

export const listCategoriesInputShape = {
    include_counts: z
        .boolean()
        .default(true)
        .describe("If true (default), include book_count for each category. Costs nothing — counts are precomputed."),
    downloaded_only: z
        .boolean()
        .default(false)
        .describe(
            "If true, list only categories where the user has at least one book downloaded locally. Useful to see where this install's library is concentrated across the 41 categories.",
        ),
    ...ResponseFormatInput,
};
export const listCategoriesInput = z.object(listCategoriesInputShape).strict();

export interface CategoryRow {
    category_id: number;
    category_name: string;
    /** null when include_counts=false: "not counted", never "zero books". */
    book_count: number | null;
    /** How many books in this category are downloaded on this machine. */
    downloaded_count: number;
}

export interface ListCategoriesOutput {
    total: number;
    downloaded_total: number;
    categories: CategoryRow[];
}

export function runListCategories(
    catalog: Catalog,
    args: z.infer<typeof listCategoriesInput>,
): RenderedResponse<ListCategoriesOutput> {
    const downloaded = catalog.downloadedBookIds();
    const downloadedInCategory = (categoryId: number): number => {
        let n = 0;
        for (const b of catalog.booksInCategory(categoryId)) if (downloaded.has(b)) n++;
        return n;
    };

    const cats = catalog.listCategories();
    let rows: CategoryRow[] = cats.map((c) => ({
        category_id: c.category_id,
        category_name: c.category_name,
        book_count: args.include_counts ? catalog.booksInCategory(c.category_id).length : null,
        downloaded_count: downloadedInCategory(c.category_id),
    }));
    if (args.downloaded_only) rows = rows.filter((r) => r.downloaded_count > 0);

    const out: ListCategoriesOutput = {
        total: rows.length,
        downloaded_total: downloaded.size,
        categories: rows,
    };
    return renderResponse(out, args.response_format, (data) => {
        const L = pick(listCategoriesLabels);
        const lines = [
            header(1, L.heading(num(data.total))),
            L.downloadedTotal(num(data.downloaded_total)),
            "",
        ];
        for (const c of data.categories) {
            const counts = args.include_counts ? L.bookCount(num(c.book_count)) : "";
            const dl = c.downloaded_count > 0 ? L.downloadedCount(num(c.downloaded_count)) : "";
            lines.push(L.categoryLine(c.category_name, String(c.category_id), counts, dl));
        }
        return lines.join("\n");
    });
}
