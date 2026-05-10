import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { serviceKeyNotFound } from "../errors.js";
import type { ServiceStore } from "../services.js";
import { ResponseFormatInput } from "../schemas.js";
import { arabize, header, renderResponse, type RenderedResponse } from "../format.js";

export const getBooksForHadithInputShape = {
    hadith_key: z
        .number()
        .int()
        .positive()
        .describe(
            "Numeric hadith key (the normalized identifier Shamela uses across collections — e.g. 1234). Different collections of the same hadith share this key.",
        ),
    downloaded_only: z.boolean().default(true).describe("If true (default), only return books actually downloaded on this machine."),
    ...ResponseFormatInput,
};
export const getBooksForHadithInput = z.object(getBooksForHadithInputShape).strict();

export interface HadithHit {
    book_id: number;
    book_name: string;
    author_name: string | null;
    page_id: number;
    downloaded: boolean;
}

export interface GetBooksForHadithOutput {
    hadith_key: number;
    total: number;
    returned: number;
    results: HadithHit[];
}

export async function runGetBooksForHadith(
    catalog: Catalog,
    services: ServiceStore,
    args: z.infer<typeof getBooksForHadithInput>,
): Promise<RenderedResponse<GetBooksForHadithOutput>> {
    const hits = await services.getBooksForKey("hadeeth", args.hadith_key);
    if (hits.length === 0) throw serviceKeyNotFound("hadeeth", args.hadith_key);
    const filtered = args.downloaded_only ? hits.filter((h) => catalog.isDownloaded(h.book_id)) : hits;
    const results: HadithHit[] = filtered.map((h) => {
        const rec = catalog.bookRecord(h.book_id);
        return {
            book_id: h.book_id,
            book_name: rec?.book_name ?? `(unknown ${h.book_id})`,
            author_name: rec ? catalog.mainAuthorName(rec) : null,
            page_id: h.page_id,
            downloaded: catalog.isDownloaded(h.book_id),
        };
    });
    const out: GetBooksForHadithOutput = {
        hadith_key: args.hadith_key,
        total: hits.length,
        returned: results.length,
        results,
    };
    return renderResponse(out, args.response_format, (data) => {
        const lines = [
            header(1, `كتب تتضمَّن الحديث ذو المفتاح ${arabize(data.hadith_key)}`),
            `**${arabize(data.total)}** كتاب، منها ${arabize(data.returned)} ضمن النطاق الحالي.`,
            "",
        ];
        for (const r of data.results) {
            lines.push(`- **${r.book_name}**${r.author_name ? ` — ${r.author_name}` : ""} (page_id=${r.page_id}${r.downloaded ? ", منزَّل" : ""})`);
        }
        return lines.join("\n");
    });
}
