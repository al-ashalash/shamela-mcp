import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { PAGE_BODY_BUDGET } from "../constants.js";
import { pageNotFound } from "../errors.js";
import type { Helper } from "../helper.js";
import { excerptAround } from "../excerpt.js";
import { getChunk } from "../longtext.js";
import type { PageStore, TocEntry } from "../pages.js";
import { ResponseFormatInput } from "../schemas.js";
import { formatShortCitation } from "../citation.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { getPageLabels } from "../i18n/tools/getPage.js";
import { requireDownloadedBook } from "../gate.js";

export const getPageInputShape = {
    book_id: z.number().int().positive().describe("The book id."),
    page_id: z.number().int().positive().describe("The page id (Lucene/SQLite internal id, not the printed page number)."),
    keep_html: z.boolean().default(false).describe("If true, preserve inline HTML markers (e.g. <span data-type='title'>). Default false strips them for plain Arabic display."),
    body_part: z
        .number()
        .int()
        .min(1)
        .default(1)
        .describe(
            `For long pages: when the body exceeds ~${PAGE_BODY_BUDGET} characters it is split into parts. Pass the 1-based part to read (default 1). The response reports body_part/body_total_parts/body_has_more; request the next part by incrementing. The footnote/comment are returned with part 1.`,
        ),
    around_phrase: z
        .string()
        .min(2)
        .optional()
        .describe(
            "Return only the window around this phrase instead of the page body — for when you already know the wording and want to read it in its sentence. Matching ignores diacritics, so the phrase may be typed bare. If the phrase is not on the page the body comes back as normal with a note saying so; nothing approximate is ever returned. Ignored when the page has no body. Example: shamela_get_page({book_id:9942, page_id:63, around_phrase:'الوضوء لا ينتقض'}).",
        ),
    around_radius: z
        .number()
        .int()
        .min(40)
        .max(2000)
        .default(300)
        .describe("Characters to keep either side of `around_phrase` (40–2000, default 300). Snapped outward to word boundaries."),
    ...ResponseFormatInput };
export const getPageInput = z.object(getPageInputShape).strict();

export interface ContainingTitle {
    title_id: number;
    title_text: string;
    page_id: number;
}

export interface GetPageOutput {
    book_id: number;
    book_name: string;
    author_name: string | null;
    page_id: number;
    printed_page: string | null;
    part: string | null;
    body: string;
    foot: string;
    comment: string;
    /** 1-based index of the body part returned (1 when the page is short). */
    body_part: number;
    /** Total number of parts the body was split into (1 when short). */
    body_total_parts: number;
    /** True when further body parts remain (fetch with body_part+1). */
    body_has_more: boolean;
    /**
     * Set when `around_phrase` was given: whether the phrase was located, and
     * — when it was — that `body` is a WINDOW, not the page. A reader who is
     * not told this would cite a partial page as though it were whole.
     */
    excerpt: {
        phrase: string;
        found: boolean;
        /** Field the phrase was found in; null when it was not found. */
        field: "body" | null;
        truncated_before: boolean;
        truncated_after: boolean;
    } | null;
    /** Display advice when the body is long enough to be split; null otherwise. */
    _display: string | null;
    prev_page_id: number | null;
    next_page_id: number | null;
    containing_titles: ContainingTitle[];
    category_path: string[];
    /**
     * A ready reference for this exact page, so quoting it does not require a
     * second call — and so the numbering caveat travels with the text rather
     * than being looked up separately, or not at all.
     */
    citation: string;
    /** True when the page number is Shamela's automatic count, not the print's. */
    citation_auto_numbered: boolean;
}

const HTML_TAG_RE = /<[^>]+>/g;

export async function runGetPage(
    helper: Helper,
    catalog: Catalog,
    pages: PageStore,
    args: z.infer<typeof getPageInput>,
): Promise<RenderedResponse<GetPageOutput>> {
    const rec = requireDownloadedBook(catalog, args.book_id);

    const row = await pages.getPageRow(args.book_id, args.page_id);
    if (!row) throw pageNotFound(args.book_id, args.page_id);

    const batch = await helper.request<{
        book_id: number;
        results: Array<{ page_id: number; found: boolean; body: string; foot: string; comment: string }>;
    }>("get_pages_batch", { book_id: args.book_id, page_ids: [args.page_id] });
    const content = batch.results[0];

    const totalPages = await pages.pageCount(args.book_id);
    const ancestor = await pages.getAncestorChain(args.book_id, args.page_id);

    // Get title_text for each ancestor.
    const titleIds = ancestor.map((a) => a.title_id);
    let titleMap: Map<number, string> = new Map();
    if (titleIds.length > 0) {
        const titles = await helper.request<{
            results: Array<{ title_id: number; title_text: string }>;
        }>("get_titles_batch", { book_id: args.book_id, title_ids: titleIds });
        titleMap = new Map(titles.results.map((t) => [t.title_id, t.title_text]));
    }

    const stripIfHtml = (s: string) => (args.keep_html ? s : s.replace(HTML_TAG_RE, "").replace(/\r/g, "\n"));

    const fullBody = stripIfHtml(content?.body ?? "");
    const fullFoot = stripIfHtml(content?.foot ?? "");
    const fullComment = stripIfHtml(content?.comment ?? "");

    // A phrase the reader already knows: hand back its sentence rather than
    // making them walk fixed slices of the page hunting for it — and worse,
    // possibly finding it split across the seam between two of them.
    //
    // A phrase that is NOT on the page falls through to the whole body with
    // found:false. Returning an approximate window instead would be a
    // misquotation with a page number attached.
    let excerpt: GetPageOutput["excerpt"] = null;
    let bodyForChunking = fullBody;
    if (args.around_phrase && fullBody) {
        const ex = excerptAround(fullBody, args.around_phrase, args.around_radius);
        excerpt = ex
            ? {
                  phrase: args.around_phrase,
                  found: true,
                  field: "body",
                  truncated_before: ex.truncated_before,
                  truncated_after: ex.truncated_after,
              }
            : { phrase: args.around_phrase, found: false, field: null, truncated_before: false, truncated_after: false };
        if (ex) bodyForChunking = ex.text;
    }

    // #16 — paginate a long page body so the model never dumps a huge
    // page in one shot. Short pages stay a single part (no _display advice).
    const chunk = getChunk(bodyForChunking, args.body_part, PAGE_BODY_BUDGET);
    const onFirst = chunk.part === 1;
    // Prose, not a machine field: it says the same thing in whichever language
    // the reader is being answered in. The part to ask for next stays in Latin
    // digits — the user types it straight back as body_part.
    // null on the last part. It used to fall back to the CURRENT part, so the
    // advice read «ولجلب التالي استخدم body_part=2» while you were on part 2 —
    // an instruction that returns the same page for ever.
    const nextBodyPart = chunk.part < chunk.total_parts ? chunk.part + 1 : null;
    const display =
        chunk.total_parts > 1
            ? pick(getPageLabels).longBody(
                  num(chunk.total_parts),
                  num(chunk.part),
                  nextBodyPart === null ? null : String(nextBodyPart),
                  chunk.total_parts,
              )
            : null;

    const printed = await pages.printedPage(args.book_id, args.page_id);
    const out: GetPageOutput = {
        book_id: args.book_id,
        book_name: rec.book_name,
        author_name: catalog.mainAuthorName(rec),
        page_id: args.page_id,
        printed_page: printed,
        part: row.part,
        body: chunk.text,
        foot: onFirst ? fullFoot : "",
        comment: onFirst ? fullComment : "",
        body_part: chunk.part,
        body_total_parts: chunk.total_parts,
        body_has_more: chunk.has_more,
        excerpt,
        _display: display,
        prev_page_id: args.page_id > 1 ? args.page_id - 1 : null,
        next_page_id: args.page_id < totalPages ? args.page_id + 1 : null,
        containing_titles: ancestor.map((a: TocEntry) => ({
            title_id: a.title_id,
            title_text: titleMap.get(a.title_id) ?? "",
            page_id: a.page_id })),
        category_path: catalog.categoryPath(rec.book_category),
        citation: formatShortCitation(rec, catalog.bookAuthors(rec)[0] ?? null, {
            page_id: args.page_id,
            part: row?.part ?? null,
            page: row?.page ?? null,
        }),
        citation_auto_numbered: rec.printed !== 1 };
    return renderResponse(out, args.response_format, (data) => {
        const L = pick(getPageLabels);
        const lines: string[] = [];
        lines.push(header(1, `${data.book_name}${data.printed_page ? ` (${L.printedPage(num(data.printed_page))})` : ""}`));
        if (data.author_name) lines.push(`*${data.author_name}*`);
        if (data.containing_titles.length) {
            lines.push("", header(3, L.path));
            lines.push(data.containing_titles.map((t) => t.title_text).filter(Boolean).join(" › "));
        }
        if (data.body) {
            lines.push("", header(3, data.body_total_parts > 1 ? L.matnPart(num(data.body_part), num(data.body_total_parts)) : L.matn));
            lines.push(data.body);
        }
        // Before the paging advice: a reader must know the body is a WINDOW
        // before they are told how to page through it.
        if (data.excerpt) {
            lines.push(
                "",
                `> *${data.excerpt.found ? L.excerptFound(data.excerpt.phrase) : L.excerptMissing(data.excerpt.phrase)}*`,
            );
        }
        if (data._display) lines.push("", `> *${data._display}*`);
        if (data.foot) {
            lines.push("", header(3, L.hashiya));
            lines.push(data.foot);
        }
        if (data.comment) {
            lines.push("", header(3, L.comment));
            lines.push(data.comment);
        }
        lines.push("", header(3, L.citation));
        lines.push(data.citation);
        if (data.citation_auto_numbered) {
            lines.push(L.autoNumbered);
        }
        return lines.join("\n");
    });
}
