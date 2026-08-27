import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { MULTIPAGE_CHAR_BUDGET } from "../constants.js";
import { titleNotFound } from "../errors.js";
import type { Helper } from "../helper.js";
import { trimPagesByBudget } from "../longtext.js";
import type { PageStore } from "../pages.js";
import { ResponseFormatInput } from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { getBookSectionLabels } from "../i18n/tools/getBookSection.js";
import { requireDownloadedBook } from "../gate.js";

export const getBookSectionInputShape = {
    book_id: z.number().int().positive().describe("The book id."),
    title_id: z.number().int().positive().describe("The title id of the chapter / section to fetch (use shamela_get_toc to find IDs)."),
    max_pages: z.number().int().min(1).max(100).default(30).describe("Cap on pages to read (1–100, default 30). Sections longer than this are truncated with a flag."),
    keep_html: z.boolean().default(false).describe("Preserve inline HTML markers."),
    ...ResponseFormatInput };
export const getBookSectionInput = z.object(getBookSectionInputShape).strict();

export interface SectionPage {
    page_id: number;
    printed_page: string | null;
    part: string | null;
    body: string;
    foot: string;
    comment: string;
}

export interface GetBookSectionOutput {
    book_id: number;
    book_name: string;
    author_name: string | null;
    title_id: number;
    title_text: string;
    start_page_id: number;
    end_page_id: number;
    total_pages_in_section: number;
    truncated: boolean;
    next_start_page_id: number | null;
    /** Display advice when the section was cut short (by max_pages or char budget). */
    _display: string | null;
    pages: SectionPage[];
}

const HTML_TAG_RE = /<[^>]+>/g;

export async function runGetBookSection(
    helper: Helper,
    catalog: Catalog,
    pages: PageStore,
    args: z.infer<typeof getBookSectionInput>,
): Promise<RenderedResponse<GetBookSectionOutput>> {
    const rec = requireDownloadedBook(catalog, args.book_id);

    const section = await pages.getSection(args.book_id, args.title_id);
    if (!section) throw titleNotFound(args.book_id, args.title_id);

    const titleBatch = await helper.request<{
        results: Array<{ title_id: number; title_text: string }>;
    }>("get_titles_batch", { book_id: args.book_id, title_ids: [args.title_id] });
    const titleText = titleBatch.results[0]?.title_text ?? "";

    const max = Math.min(args.max_pages, section.total_pages);
    const rows = await pages.getPagesRange(args.book_id, section.start_page_id, max);
    const pageIds = rows.map((r) => r.page_id);
    const batch = pageIds.length
        ? await helper.request<{
              results: Array<{ page_id: number; body: string; foot: string; comment: string }>;
          }>("get_pages_batch", { book_id: args.book_id, page_ids: pageIds })
        : { results: [] };
    const contentMap = new Map(batch.results.map((r) => [r.page_id, r]));

    const stripIfHtml = (s: string) => (args.keep_html ? s : s.replace(HTML_TAG_RE, "").replace(/\r/g, "\n"));

    const allPages: SectionPage[] = await Promise.all(
        rows.map(async (r) => {
            const c = contentMap.get(r.page_id) ?? { body: "", foot: "", comment: "" };
            const printed = await pages.printedPage(args.book_id, r.page_id);
            return {
                page_id: r.page_id,
                printed_page: printed,
                part: r.part,
                body: stripIfHtml(c.body),
                foot: stripIfHtml(c.foot),
                comment: stripIfHtml(c.comment) };
        }),
    );

    // #16 — stop early when bodies are large, even within max_pages, so a
    // long chapter doesn't dump in one response.
    const { kept: pagesOut, trimmed: budgetTrimmed } = trimPagesByBudget(allPages, MULTIPAGE_CHAR_BUDGET);
    const lastId = pagesOut.length ? pagesOut[pagesOut.length - 1]!.page_id : section.start_page_id - 1;
    const truncated = pagesOut.length < section.total_pages;
    const moreInSection = lastId < section.end_page_id;
    // `_display` is prose the reader reads, not a field a caller parses, so it
    // follows the reader's language like every other label does.
    const L = pick(getBookSectionLabels);
    const display = truncated
        ? (budgetTrimmed
              ? L.trimmedByBudget(num(pagesOut.length), num(section.total_pages), String(lastId + 1))
              : L.trimmedByMaxPages(num(pagesOut.length), num(section.total_pages), String(lastId + 1)))
        : null;

    const out: GetBookSectionOutput = {
        book_id: args.book_id,
        book_name: rec.book_name,
        author_name: catalog.mainAuthorName(rec),
        title_id: args.title_id,
        title_text: titleText,
        start_page_id: section.start_page_id,
        end_page_id: section.end_page_id,
        total_pages_in_section: section.total_pages,
        truncated,
        next_start_page_id: moreInSection ? lastId + 1 : null,
        _display: display,
        pages: pagesOut };
    return renderResponse(out, args.response_format, (data) => {
        const lines = [
            header(1, `${data.book_name} — ${data.title_text || L.untitled}`),
            data.author_name ? `*${data.author_name}*` : "",
            // The span is in page_ids — Latin, per the id rule in i18n/labels.ts
            // — while the count of pages is prose and follows the language.
            L.range(String(data.start_page_id), String(data.end_page_id), num(data.total_pages_in_section)),
        ].filter(Boolean);
        for (const p of data.pages) {
            // Two numbers, two jobs. The printed page is prose a reader quotes,
            // so it follows the language; the page_id is what the next call is
            // built from and stays Latin. One slot used to hold whichever of the
            // two existed, which is how a range of ids ended up above pages
            // labelled by their printed numbers — six of six outside the range
            // it stated.
            lines.push(
                "",
                header(3, L.page(p.printed_page !== null ? num(p.printed_page) : null, String(p.page_id))),
            );
            if (p.body) lines.push(p.body);
            if (p.foot) lines.push("", `_${p.foot}_`);
        }
        if (data._display) lines.push("", `> *${data._display}*`);
        return lines.join("\n");
    });
}
