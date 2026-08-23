import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { pageNotFound } from "../errors.js";
import type { PageStore } from "../pages.js";
import { ResponseFormatInput } from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { pick } from "../i18n/labels.js";
import { getPageServicesLabels } from "../i18n/tools/getPageServices.js";
import { requireDownloadedBook } from "../gate.js";

export const getPageServicesInputShape = {
    book_id: z.number().int().positive().describe("The book id."),
    page_id: z.number().int().positive().describe("The page id."),
    ...ResponseFormatInput };
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
    // Served from the per-book SQLite file, so a book downloaded during
    // this session works right away — no Lucene reader involved.
    // Called for the throw, not the record: this is the gate that refuses a
    // book the user does not have.
    requireDownloadedBook(catalog, args.book_id, { needsTextIndex: false });
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
        raw: services?.raw ?? null };
    return renderResponse(out, args.response_format, (data) => {
        const L = pick(getPageServicesLabels);
        // Ids and counts alike stay in Western digits: the ids are typed back into
        // other tools, and the counts were never arabized here — num() would change
        // the Arabic this refactor has to leave untouched.
        const lines = [header(1, L.heading(String(data.page_id), String(data.book_id)))];
        if (!data.has_services) {
            lines.push("", L.none);
            return lines.join("\n");
        }
        if (data.ayat.length) lines.push(L.ayat(String(data.ayat.length), data.ayat.join(", ")));
        if (data.hadeeth.length) lines.push(L.hadeeth(String(data.hadeeth.length), data.hadeeth.join(", ")));
        if (data.esnad.length) lines.push(L.esnad(String(data.esnad.length)));
        // Name the opaque field for what it is, beside the data drawn from it.
        // Half-parsing it into something that looks authoritative would be
        // worse than handing it over whole and saying what it is.
        if (data.raw !== null && data.raw !== undefined) lines.push("", L.rawNote);
        return lines.join("\n");
    });
}
