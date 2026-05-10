import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { ResponseFormatInput } from "../schemas.js";
import { renderResponse, type RenderedResponse, header, meta, arabize } from "../format.js";

export const listCategoriesInputShape = {
    include_counts: z
        .boolean()
        .default(true)
        .describe("If true (default), include book_count for each category. Costs nothing — counts are precomputed."),
    ...ResponseFormatInput,
};
export const listCategoriesInput = z.object(listCategoriesInputShape).strict();

export interface CategoryRow {
    category_id: number;
    category_name: string;
    book_count: number;
}

export interface ListCategoriesOutput {
    total: number;
    categories: CategoryRow[];
}

export function runListCategories(
    catalog: Catalog,
    args: z.infer<typeof listCategoriesInput>,
): RenderedResponse<ListCategoriesOutput> {
    const cats = catalog.listCategories();
    const out: ListCategoriesOutput = {
        total: cats.length,
        categories: cats.map((c) => ({
            category_id: c.category_id,
            category_name: c.category_name,
            book_count: args.include_counts ? catalog.booksInCategory(c.category_id).length : 0,
        })),
    };
    return renderResponse(out, args.response_format, (data) => {
        const lines = [header(1, `تصنيفات المكتبة الشاملة (${arabize(data.total)})`), ""];
        for (const c of data.categories) {
            lines.push(`- **${c.category_name}** (id=${c.category_id})${args.include_counts ? `  —  ${arabize(c.book_count)} كتاب` : ""}`);
        }
        return lines.join("\n");
    });
}
