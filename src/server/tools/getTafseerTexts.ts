import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { MULTIPAGE_CHAR_BUDGET, PAGE_BODY_BUDGET } from "../constants.js";
import { ayaNotFound, badArg } from "../errors.js";
import type { Helper } from "../helper.js";
import { getChunk } from "../longtext.js";
import type { PageStore } from "../pages.js";
import { ayaIdFromSurahAya, surahAyaFromId } from "../quran.js";
import { ResponseFormatInput } from "../schemas.js";
import type { ServiceStore } from "../services.js";
import { arabize, header, renderResponse, type RenderedResponse } from "../format.js";

/**
 * Fetch the actual tafsir texts for one aya across multiple sources (#18).
 *
 * Strictly index-driven: only pages the curated service/tafseer.db maps to
 * this aya are fetched. Requested book_ids absent from the index get an
 * explicit per-source status ("not_indexed" / "no_entry_for_this_aya") and
 * NO text — there is deliberately no text-search fallback (a prototype was
 * withdrawn for misattributing verses via shared phrases and the basmala).
 *
 * Each fetched source carries embedded attribution (book, author, death
 * year, printed page, page_id) plus the getPage continuation contract
 * (text_part/text_total_parts/text_has_more, next_page_id). The overall
 * response respects MULTIPAGE_CHAR_BUDGET like get_pages_range.
 */

export const getTafseerTextsInputShape = {
    aya_id: z.number().int().min(1).max(6236).optional().describe("Aya id 1..6236."),
    surah: z.number().int().min(1).max(114).optional().describe("Surah number, paired with `aya`."),
    aya: z.number().int().min(1).optional().describe("Aya within surah."),
    book_ids: z
        .array(z.number().int().positive())
        .optional()
        .describe(
            "Restrict to these tafsir books. Books not present in the curated index for this aya are reported with an explicit status instead of text. Use shamela_list_tafsirs_for_aya to see which books the index covers.",
        ),
    max_sources: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(5)
        .describe("Maximum number of sources to fetch text for (1-10, default 5)."),
    ...ResponseFormatInput,
};
export const getTafseerTextsInput = z.object(getTafseerTextsInputShape).strict();

export type TafseerSourceStatus = "ok" | "not_indexed" | "no_entry_for_this_aya" | "not_downloaded";

export interface TafseerSourceText {
    book_id: number;
    book_name: string;
    author_name: string | null;
    death_year: number | null;
    status: TafseerSourceStatus;
    page_id: number | null;
    printed_page: string | null;
    /** Following page id — continue long commentary with shamela_get_page. */
    next_page_id: number | null;
    /** First part of the page body (empty for non-ok statuses). */
    text: string;
    foot: string;
    text_part: number;
    text_total_parts: number;
    text_has_more: boolean;
    /** Arabic explanation for non-ok statuses or continuation advice. */
    note: string | null;
}

export interface GetTafseerTextsOutput {
    aya_id: number;
    surah: number;
    surah_name: string;
    aya: number;
    /** Distinct books the curated index maps to this aya. */
    total_indexed: number;
    /** Sources for which text was actually fetched. */
    fetched: number;
    sources: TafseerSourceText[];
    /** Indexed sources skipped by max_sources or the character budget — pass them as book_ids to continue. */
    remaining_book_ids: number[];
    /** Display advice when the response was cut to stay within the char budget. */
    _display: string | null;
    /** Honest coverage caveat: the index is curated and may omit downloaded tafsirs. */
    note: string;
}

const COVERAGE_NOTE =
    "النصوص أعلاه من الكتب التي يشملها فهرس التفسير المنتقى لهذه الآية فقط؛ فالتفاسير المنزَّلة غير المفهرسة لا تُجلب هنا وليس ذلك دليلًا على خلوّها من الكلام على الآية — استعرض التغطية بـ shamela_list_tafsirs_for_aya وتصفَّح غير المفهرس بفهرسه (shamela_get_toc).";

const HTML_TAG_RE = /<[^>]+>/g;

export async function runGetTafseerTexts(
    helper: Helper,
    catalog: Catalog,
    services: ServiceStore,
    pages: PageStore,
    args: z.infer<typeof getTafseerTextsInput>,
): Promise<RenderedResponse<GetTafseerTextsOutput>> {
    let resolvedId: number;
    if (args.aya_id !== undefined) resolvedId = args.aya_id;
    else if (args.surah !== undefined && args.aya !== undefined) {
        const id = ayaIdFromSurahAya(args.surah, args.aya);
        if (id === null) throw ayaNotFound(`surah=${args.surah} aya=${args.aya}`);
        resolvedId = id;
    } else throw badArg("Provide either aya_id or both surah and aya.");
    const sa = surahAyaFromId(resolvedId);
    if (!sa) throw ayaNotFound(String(resolvedId));

    const hits = await services.getBooksForKey("tafseer", resolvedId);
    const hitPageByBook = new Map<number, number>();
    for (const h of hits) if (!hitPageByBook.has(h.book_id)) hitPageByBook.set(h.book_id, h.page_id);
    const inService = new Set(await services.listInService("tafseer"));

    const bookMeta = (bookId: number) => {
        const rec = catalog.bookRecord(bookId);
        const authorRec =
            rec && rec.main_author !== null ? catalog.authorRecord(rec.main_author) : undefined;
        return {
            book_name: rec?.book_name ?? `(unknown ${bookId})`,
            author_name: rec ? catalog.mainAuthorName(rec) : null,
            death_year: authorRec?.death_year ?? null,
        };
    };

    const statusRow = (bookId: number, status: TafseerSourceStatus, note: string): TafseerSourceText => ({
        book_id: bookId,
        ...bookMeta(bookId),
        status,
        page_id: hitPageByBook.get(bookId) ?? null,
        printed_page: null,
        next_page_id: null,
        text: "",
        foot: "",
        text_part: 1,
        text_total_parts: 1,
        text_has_more: false,
        note,
    });

    const sources: TafseerSourceText[] = [];
    // Fetch candidates: indexed hits, filtered to book_ids when provided,
    // downloaded books only (text lives on this machine).
    const fetchQueue: number[] = [];
    if (args.book_ids?.length) {
        for (const id of args.book_ids) {
            if (!hitPageByBook.has(id)) {
                if (inService.has(id)) {
                    sources.push(
                        statusRow(
                            id,
                            "no_entry_for_this_aya",
                            "الكتاب مشارك في فهرس التفسير لكن لا مدخل له لهذه الآية؛ لا يُجلب نص بلا فهرسة تفاديًا للنسبة الخاطئة.",
                        ),
                    );
                } else {
                    sources.push(
                        statusRow(
                            id,
                            "not_indexed",
                            "الكتاب غير مشمول بفهرس التفسير المنتقى فلا يمكن تحديد موضع الآية فيه؛ وليس ذلك دليلًا على خلوّه من تفسيرها — تصفَّحه بـ shamela_get_toc.",
                        ),
                    );
                }
            } else if (!catalog.isDownloaded(id)) {
                sources.push(
                    statusRow(id, "not_downloaded", "الكتاب مفهرس لهذه الآية لكنه غير منزَّل محليًّا فلا يمكن قراءة نصه."),
                );
            } else {
                fetchQueue.push(id);
            }
        }
    } else {
        for (const id of hitPageByBook.keys()) {
            if (catalog.isDownloaded(id)) fetchQueue.push(id);
        }
    }

    const capped = fetchQueue.slice(0, args.max_sources);
    const remaining: number[] = fetchQueue.slice(args.max_sources);

    // Fetch each source's page, paginate the body, respect the overall budget.
    let budgetUsed = 0;
    let budgetCut = false;
    let fetched = 0;
    for (let i = 0; i < capped.length; i++) {
        const bookId = capped[i]!;
        const pageId = hitPageByBook.get(bookId)!;
        if (fetched >= 1 && budgetUsed >= MULTIPAGE_CHAR_BUDGET) {
            budgetCut = true;
            remaining.unshift(...capped.slice(i));
            break;
        }
        const batch = await helper.request<{
            book_id: number;
            results: Array<{ page_id: number; found: boolean; body: string; foot: string; comment: string }>;
        }>("get_pages_batch", { book_id: bookId, page_ids: [pageId] });
        const content = batch.results[0];
        const strip = (s: string) => s.replace(HTML_TAG_RE, "").replace(/\r/g, "\n");
        const fullBody = strip(content?.body ?? "");
        const foot = strip(content?.foot ?? "");
        const chunk = getChunk(fullBody, 1, PAGE_BODY_BUDGET);
        const printed = await pages.printedPage(bookId, pageId);
        const totalPages = await pages.pageCount(bookId);
        const nextPageId = pageId < totalPages ? pageId + 1 : null;
        const contNote =
            chunk.has_more || nextPageId !== null
                ? `التفسير قد يمتد؛ ${chunk.has_more ? `لبقية هذه الصفحة استخدم shamela_get_page(book_id=${bookId}, page_id=${pageId}, body_part=2)` : ""}${chunk.has_more && nextPageId !== null ? "، و" : ""}${nextPageId !== null ? `للصفحة التالية next_page_id=${nextPageId}` : ""}.`
                : null;
        sources.push({
            book_id: bookId,
            ...bookMeta(bookId),
            status: "ok",
            page_id: pageId,
            printed_page: printed,
            next_page_id: nextPageId,
            text: chunk.text,
            foot,
            text_part: chunk.part,
            text_total_parts: chunk.total_parts,
            text_has_more: chunk.has_more,
            note: contNote,
        });
        budgetUsed += chunk.text.length + foot.length;
        fetched++;
    }

    const display =
        budgetCut || remaining.length
            ? `اقتُصِر على ${arabize(fetched)} مصدرًا${budgetCut ? " لضبط الحجم" : ""}؛ لبقية المصادر أعد الاستدعاء بـ book_ids=[${remaining.join("، ")}].`
            : null;

    const out: GetTafseerTextsOutput = {
        aya_id: resolvedId,
        surah: sa.surah,
        surah_name: sa.surah_name,
        aya: sa.aya,
        total_indexed: hitPageByBook.size,
        fetched,
        sources,
        remaining_book_ids: remaining,
        _display: display,
        note: COVERAGE_NOTE,
    };
    return renderResponse(out, args.response_format, (data) => {
        const lines = [
            header(1, `نصوص تفسير الآية ${data.surah_name} ${arabize(data.surah)}:${arabize(data.aya)}`),
            `في الفهرس **${arabize(data.total_indexed)}** كتابًا لهذه الآية، جُلِب نص ${arabize(data.fetched)} منها.`,
            "",
            `> *${data.note}*`,
        ];
        for (const s of data.sources) {
            const attribution = `${s.author_name ?? ""}${s.death_year ? ` (ت ${arabize(s.death_year)}هـ)` : ""}`;
            lines.push("", header(2, s.book_name));
            if (attribution.trim()) lines.push(`*${attribution.trim()}*`);
            if (s.status === "ok") {
                lines.push(
                    `${s.printed_page ? `ص ${arabize(s.printed_page)}، ` : ""}page_id=${s.page_id}${s.next_page_id !== null ? `، next_page_id=${s.next_page_id}` : ""}`,
                    "",
                    s.text,
                );
                if (s.foot) lines.push("", `_${s.foot}_`);
                if (s.note) lines.push("", `> *${s.note}*`);
            } else if (s.note) {
                lines.push(`> *${s.note}*`);
            }
        }
        if (data._display) lines.push("", `> *${data._display}*`);
        return lines.join("\n");
    });
}
