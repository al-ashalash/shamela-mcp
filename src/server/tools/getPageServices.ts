import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { bookNotDownloaded, bookNotFound, pageNotFound } from "../errors.js";
import type { PageStore } from "../pages.js";
import { ResponseFormatInput } from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";

export const getPageServicesInputShape = {
    book_id: z.number().int().positive().describe("The book id."),
    page_id: z.number().int().positive().describe("The page id."),
    ...ResponseFormatInput,
};
export const getPageServicesInput = z.object(getPageServicesInputShape).strict();

export interface GetPageServicesOutput {
    book_id: number;
    page_id: number;
    has_services: boolean;
    ayat: number[];
    hadeeth: number[];
    esnad: string[];
    raw: unknown;
}

export async function runGetPageServices(
    catalog: Catalog,
    pages: PageStore,
    args: z.infer<typeof getPageServicesInput>,
): Promise<RenderedResponse<GetPageServicesOutput>> {
    const book = catalog.bookRecord(args.book_id);
    if (!book) throw bookNotFound(args.book_id);
    if (book.major_ondisk === 0) throw bookNotDownloaded(args.book_id, book.book_name);
    const row = await pages.getPageRow(args.book_id, args.page_id);
    if (!row) throw pageNotFound(args.book_id, args.page_id);
    const services = await pages.getPageServices(args.book_id, args.page_id);
    const out: GetPageServicesOutput = {
        book_id: args.book_id,
        page_id: args.page_id,
        has_services: services !== null,
        ayat: services?.ayat ?? [],
        hadeeth: services?.hadeeth ?? [],
        esnad: services?.esnad ?? [],
        raw: services?.raw ?? null,
    };
    return renderResponse(out, args.response_format, (data) => {
        const lines = [header(1, `إشارات الصفحة ${data.page_id} في الكتاب ${data.book_id}`)];
        if (!data.has_services) {
            lines.push("", "_لا توجد إشارات (آيات / أحاديث / إسناد) في هذه الصفحة._");
            return lines.join("\n");
        }
        if (data.ayat.length) lines.push(`- **آيات قرآنية**: ${data.ayat.length} (aya_id: ${data.ayat.join(", ")})`);
        if (data.hadeeth.length) lines.push(`- **أحاديث**: ${data.hadeeth.length} (key: ${data.hadeeth.join(", ")})`);
        if (data.esnad.length) lines.push(`- **أسانيد**: ${data.esnad.length}`);
        return lines.join("\n");
    });
}
