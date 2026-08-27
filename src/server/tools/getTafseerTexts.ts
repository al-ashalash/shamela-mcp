import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { MULTIPAGE_CHAR_BUDGET, PAGE_BODY_BUDGET, VERSE_TAIL_MIN_CHARS } from "../constants.js";
import { ayaNotFound, ayaOutOfSurah, badArg } from "../errors.js";
import type { Helper } from "../helper.js";
import { getChunk } from "../longtext.js";
import type { PageStore } from "../pages.js";
import { ayaIdFromSurahAya, surahAyaFromId } from "../quran.js";
import { ResponseFormatInput } from "../schemas.js";
import { locateAya } from "../ayaIndex/build.js";
import { findVerseByQuotation, findVerseMarker, type PageTitle } from "../ayaIndex/slice.js";
import type { AyaIndexStore } from "../ayaIndex/store.js";
import type { ServiceStore } from "../services.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { getTafseerTextsLabels } from "../i18n/tools/getTafseerTexts.js";

/**
 * Fetch the actual tafsir texts for one aya across multiple sources (#18).
 *
 * A page is fetched only where the verse was actually PLACED, by one of two
 * indexes: Shamela's own service/tafseer.db, which is curated and answers for
 * a handful of books, or the verse→page index built from a book's own chapter
 * headings, which answers for most of a real downloaded shelf. With no
 * book_ids the whole shelf (categories 3, 4, 5) is swept, Shamela-placed books
 * first — their data about their own books outranks our reading of a title.
 *
 * There is deliberately no text-search fallback: a prototype was withdrawn for
 * misattributing verses via shared phrasing and the basmala. A book the verse
 * could not be placed in gets an explicit status and NO text, because a
 * plausible wrong page is the one failure this tool exists to prevent.
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
            "Restrict to these tafsir books. A book where the verse cannot be placed — by Shamela's index or by the book's own chapter headings — is reported with an explicit status instead of text. Omit to sweep the whole downloaded tafsir shelf. See shamela_list_tafsirs_for_aya for coverage.",
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

export type TafseerSourceStatus =
    /** Text fetched, located by Shamela's own table. */
    | "ok"
    /** Text fetched, located from the book's own chapter markers. */
    | "ok_titles"
    /** Located to a marker covering several verses, this one among them. */
    | "ok_group"
    /** Nothing places verses in this book. */
    | "not_indexed"
    /** Indexed, but nothing marks this particular verse. */
    | "no_entry_for_this_aya"
    /** The id is not in master.db at all — it names no book. */
    | "not_found"
    /** Its index has not been built yet; ask again. */
    | "index_pending"
    | "not_downloaded";

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
    /**
     * True when the text begins at the verse's own marker rather than at the
     * top of the page. False means no marker could be located on the page and
     * the whole page is returned — in which case some of it may precede the
     * verse, and the reader is told so.
     */
    text_starts_at_verse: boolean;
    /**
     * Set when the verse's marker sat at the foot of `page_id` and the text
     * runs on into the following page — so a citation drawn from the tail of
     * this text belongs to the next page, not this one.
     */
    continued_from_page_id: number | null;
    /** Which index placed this text: Shamela's table, or the book's own titles. */
    locus_source: "service" | "titles" | null;
    /** The chapter title that placed it, so the reader can check it directly. */
    title_id: number | null;
    /** How far the title index for this book may be trusted. */
    confidence: "high" | "medium" | null;
    /** Reader-facing explanation for non-ok statuses, or continuation advice. */
    note: string | null;
}

export interface GetTafseerTextsOutput {
    aya_id: number;
    surah: number;
    surah_name: string;
    aya: number;
    /**
     * Books whose commentary on this verse could be located, from either index.
     * Was the size of Shamela's curated table alone, which under-reported once
     * the books' own markers started answering too.
     */
    total_indexed: number;
    /** Of those, how many came from Shamela's own table. */
    total_from_service: number;
    /** Of those, how many were located from the books' chapter markers. */
    total_from_titles: number;
    /** Sources for which text was actually fetched. */
    fetched: number;
    sources: TafseerSourceText[];
    /** Indexed sources skipped by max_sources or the character budget — pass them as book_ids to continue. */
    remaining_book_ids: number[];
    /** Display advice when the response was cut to stay within the char budget. */
    _display: string | null;
    /** Honest coverage caveat: a verse not placed by either index is not fetched, which is not the same as absent. */
    note: string;
}

const HTML_TAG_RE = /<[^>]+>/g;

export async function runGetTafseerTexts(
    helper: Helper,
    catalog: Catalog,
    services: ServiceStore,
    pages: PageStore,
    ayaIndex: AyaIndexStore | null,
    args: z.infer<typeof getTafseerTextsInput>,
): Promise<RenderedResponse<GetTafseerTextsOutput>> {
    // The reader's language, for every sentence below — the notes travel in
    // structuredContent but they are prose, not fields.
    const L = pick(getTafseerTextsLabels);
    let resolvedId: number;
    if (args.aya_id !== undefined) resolvedId = args.aya_id;
    else if (args.surah !== undefined && args.aya !== undefined) {
        const id = ayaIdFromSurahAya(args.surah, args.aya);
        if (id === null) throw ayaOutOfSurah(args.surah!, args.aya!);
        resolvedId = id;
    } else throw badArg("Provide either aya_id or both surah and aya.");
    const sa = surahAyaFromId(resolvedId);
    if (!sa) throw ayaNotFound(String(resolvedId));

    const hits = await services.getBooksForKey("tafseer", resolvedId);
    const hitPageByBook = new Map<number, number>();
    for (const h of hits) if (!hitPageByBook.has(h.book_id)) hitPageByBook.set(h.book_id, h.page_id);
    const inService = new Set(await services.listInService("tafseer"));

    /**
     * Where this verse's commentary starts in a given book.
     *
     * Shamela's own table answers first — it is their data about their books —
     * and the index built from the book's chapter markers covers the rest of
     * the shelf, which that table never did.
     */
    interface Locus {
        page_id: number;
        source: "service" | "titles";
        title_id: number | null;
        confidence: "high" | "medium" | null;
        group: boolean;
    }
    const locusCache = new Map<number, Locus | "pending" | null>();
    const findLocus = async (bookId: number): Promise<Locus | "pending" | null> => {
        const cached = locusCache.get(bookId);
        if (cached !== undefined) return cached;
        let result: Locus | "pending" | null = null;
        const fromService = hitPageByBook.get(bookId);
        if (fromService !== undefined) {
            result = { page_id: fromService, source: "service", title_id: null, confidence: null, group: false };
        } else if (ayaIndex && catalog.isDownloaded(bookId)) {
            const availability = await ayaIndex.get(helper, bookId);
            if (availability.state === "ready") {
                const found = locateAya(availability.index, sa.surah, sa.aya);
                if (found) {
                    result = {
                        page_id: found.page_id,
                        source: "titles",
                        title_id: found.title_id || null,
                        confidence: availability.index.confidence === "low" ? null : availability.index.confidence,
                        group: found.group,
                    };
                }
            } else if (availability.state === "pending" || availability.state === "not_built") {
                result = "pending";
            }
        }
        locusCache.set(bookId, result);
        return result;
    };

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
        locus_source: null,
        title_id: null,
        confidence: null,
        page_id: hitPageByBook.get(bookId) ?? null,
        printed_page: null,
        next_page_id: null,
        text: "",
        foot: "",
        text_part: 1,
        text_total_parts: 1,
        text_has_more: false,
        // No text was fetched, so there is nothing to have started at a verse.
        text_starts_at_verse: false,
        continued_from_page_id: null,
        note,
    });

    const sources: TafseerSourceText[] = [];
    // Fetch candidates: indexed hits, filtered to book_ids when provided,
    // downloaded books only (text lives on this machine).
    const fetchQueue: number[] = [];
    const locusFor = new Map<number, Locus>();
    ayaIndex?.resetBudget();

    if (args.book_ids?.length) {
        for (const id of args.book_ids) {
            // An id master.db has never heard of is not "unindexed" — it is not
            // a book. It used to come back as a source named «(unknown 99999)»
            // under the note «وليس ذلك دليلًا على خلوّه من تفسيرها، فتصفَّحه بـ
            // shamela_get_toc» — prose asserting that a work which does not
            // exist may still comment on the verse, and sending the reader to
            // a call that can only raise BOOK_NOT_FOUND.
            if (!catalog.bookRecord(id)) {
                sources.push(statusRow(id, "not_found", L.statusNote.notFound));
                continue;
            }
            const locus = await findLocus(id);
            if (locus === "pending") {
                sources.push(statusRow(id, "index_pending", L.statusNote.indexPending));
            } else if (locus === null) {
                sources.push(
                    statusRow(
                        id,
                        inService.has(id) ? "no_entry_for_this_aya" : "not_indexed",
                        inService.has(id)
                            ? L.statusNote.noEntryForThisAya
                            : L.statusNote.notIndexed,
                    ),
                );
            } else if (!catalog.isDownloaded(id)) {
                sources.push(statusRow(id, "not_downloaded", L.statusNote.notDownloaded));
            } else {
                locusFor.set(id, locus);
                fetchQueue.push(id);
            }
        }
    } else {
        // Everything on the shelf that can be placed, not just the books
        // Shamela's own table happens to cover.
        const candidates = new Set<number>(hitPageByBook.keys());
        for (const cid of [3, 4, 5]) {
            for (const id of catalog.booksInCategory(cid)) {
                if (catalog.isDownloaded(id)) candidates.add(id);
            }
        }
        for (const id of candidates) {
            if (!catalog.isDownloaded(id)) continue;
            const locus = await findLocus(id);
            if (locus === "pending" || locus === null) continue;
            locusFor.set(id, locus);
            fetchQueue.push(id);
        }
        // Books Shamela's table places come first: their locations are its own
        // data rather than our reading of a chapter title.
        fetchQueue.sort((a, b) => {
            const rank = (id: number) => (locusFor.get(id)!.source === "service" ? 0 : 1);
            return rank(a) - rank(b) || a - b;
        });
    }

    const capped = fetchQueue.slice(0, args.max_sources);
    const remaining: number[] = fetchQueue.slice(args.max_sources);

    /**
     * The chapter titles that start on one page, with their text.
     *
     * Cached per book: allTitleRows reads the book's SQLite once, and the
     * helper round-trip is only for the handful of titles on this page.
     */
    const titleRowsCache = new Map<number, Array<{ title_id: number; page_id: number }>>();

    /**
     * The verse's own words, for the books that head a section by quoting the
     * verse instead of by the bracketed marker grammar (الطبري does this
     * throughout). Fetched at most once per call, and never fatal: without it
     * those pages simply come back whole and say so.
     */
    let verseTextOnce: string | null | undefined;
    const verseText = async (): Promise<string | null> => {
        if (verseTextOnce !== undefined) return verseTextOnce;
        try {
            const r = await helper.request<{ found: boolean; body: string | null }>("get_aya", {
                aya_id: resolvedId,
            });
            verseTextOnce = r.found ? r.body : null;
        } catch {
            verseTextOnce = null;
        }
        return verseTextOnce;
    };

    const findMarker = async (
        bookId: number,
        pageId: number,
        body: string,
    ): Promise<{ offset: number } | null> => {
        if (!body.trim()) return null;
        // Failing to locate the marker is a degraded answer, not a failed one:
        // the page comes back whole and `text_starts_at_verse` says false, so
        // the reader knows the text may open before the verse. Losing the
        // whole tafsir fetch because a title lookup faltered would be worse.
        try {
            let rows = titleRowsCache.get(bookId);
            if (!rows) {
                rows = await pages.allTitleRows(bookId);
                titleRowsCache.set(bookId, rows);
            }
            const ids = rows.filter((r) => r.page_id === pageId).map((r) => r.title_id);
            let titles: PageTitle[] = [];
            if (ids.length) {
                const res = await helper.request<{
                    results?: Array<{ title_id?: number; title_text?: string }>;
                }>("get_titles_batch", { book_id: bookId, title_ids: ids });
                titles = (res.results ?? [])
                    .filter((r) => r.title_id && r.title_text)
                    .map((r) => ({ title_id: r.title_id as number, text: r.title_text as string }));
            }
            const locus = locusFor.get(bookId);
            const byTitle = findVerseMarker(body, titles, sa.surah, sa.aya, locus?.title_id ?? null);
            if (byTitle) return byTitle;
            // Some books carry no title rows at all on the page that holds the
            // verse — الطبري's 2936 is one — so the marker has to be read off
            // the page itself.
            const offset = findVerseByQuotation(body, await verseText());
            return offset === null ? null : { offset };
        } catch {
            return null;
        }
    };

    // Fetch each source's page, paginate the body, respect the overall budget.
    let budgetUsed = 0;
    let budgetCut = false;
    let fetched = 0;
    for (let i = 0; i < capped.length; i++) {
        const bookId = capped[i]!;
        const locus = locusFor.get(bookId)!;
        const pageId = locus.page_id;
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
        const pageBody = strip(content?.body ?? "");
        const foot = strip(content?.foot ?? "");
        const printed = await pages.printedPage(bookId, pageId);
        const totalPages = await pages.pageCount(bookId);
        const nextPageId = pageId < totalPages ? pageId + 1 : null;

        // Cut the page down to the verse's own section. The index names the
        // page, never the offset in it, so a section starting near the foot
        // used to arrive under a whole page of the PREVIOUS passage's tafsir.
        const marker = await findMarker(bookId, pageId, pageBody);
        let fullBody = pageBody;
        let slicedAt: number | null = null;
        let continuedOnto: number | null = null;
        if (marker && marker.offset > 0) {
            fullBody = pageBody.slice(marker.offset);
            slicedAt = marker.offset;
            // A marker at the very foot means the commentary itself is on the
            // next page: a heading and three verses are not an answer.
            if (fullBody.trim().length < VERSE_TAIL_MIN_CHARS && nextPageId !== null) {
                const nextBatch = await helper.request<{
                    results: Array<{ page_id: number; body: string }>;
                }>("get_pages_batch", { book_id: bookId, page_ids: [nextPageId] });
                const nextBody = strip(nextBatch.results[0]?.body ?? "");
                if (nextBody.trim()) {
                    fullBody = `${fullBody.trimEnd()}\n\n${nextBody}`;
                    continuedOnto = nextPageId;
                }
            }
        }
        const chunk = getChunk(fullBody, 1, PAGE_BODY_BUDGET);
        const contNote =
            chunk.has_more || nextPageId !== null
                ? L.continuation(
                      String(bookId),
                      String(pageId),
                      chunk.has_more,
                      nextPageId === null ? null : String(nextPageId),
                  )
                : null;
        const groupNote = locus.group ? L.groupNote : null;
        sources.push({
            book_id: bookId,
            ...bookMeta(bookId),
            status: locus.source === "service" ? "ok" : locus.group ? "ok_group" : "ok_titles",
            locus_source: locus.source,
            title_id: locus.title_id,
            confidence: locus.confidence,
            page_id: pageId,
            printed_page: printed,
            next_page_id: nextPageId,
            text: chunk.text,
            foot,
            text_part: chunk.part,
            text_total_parts: chunk.total_parts,
            text_has_more: chunk.has_more,
            /** True when the text begins at the verse's own marker, not at the top of the page. */
            text_starts_at_verse: slicedAt !== null,
            /** Set when the verse's section began at the page's foot and the text runs on. */
            continued_from_page_id: continuedOnto === null ? null : pageId,
            note:
                [slicedAt !== null ? L.slicedToVerse(String(continuedOnto ?? "")) : null, groupNote, contNote]
                    .filter(Boolean)
                    .join(" ") || null,
        });
        budgetUsed += chunk.text.length + foot.length;
        fetched++;
    }

    const display =
        budgetCut || remaining.length
            ? L.trimmed(num(fetched), budgetCut, remaining.map(String))
            : null;

    const out: GetTafseerTextsOutput = {
        aya_id: resolvedId,
        surah: sa.surah,
        surah_name: sa.surah_name,
        aya: sa.aya,
        total_indexed: locusFor.size + sources.filter((s) => s.status === "not_downloaded").length,
        total_from_service: [...locusFor.values()].filter((l) => l.source === "service").length,
        total_from_titles: [...locusFor.values()].filter((l) => l.source === "titles").length,
        fetched,
        sources,
        remaining_book_ids: remaining,
        _display: display,
        note: L.coverageNote,
    };
    return renderResponse(out, args.response_format, (data) => {
        const lines = [
            header(1, L.heading(data.surah_name, num(data.surah), num(data.aya))),
            L.summary(
                num(data.total_indexed),
                num(data.total_from_service),
                num(data.total_from_titles),
                num(data.fetched),
            ),
            "",
            `> *${data.note}*`,
        ];
        for (const s of data.sources) {
            const attribution = `${s.author_name ?? ""}${s.death_year ? ` ${L.died(num(s.death_year))}` : ""}`;
            lines.push("", header(2, s.book_name));
            if (attribution.trim()) lines.push(`*${attribution.trim()}*`);
            // Three statuses mean the text was fetched, not one. `ok` is a
            // page Shamela's own table placed; `ok_titles` and `ok_group` are
            // pages the book's own chapter headings placed — which is the
            // whole of what this release added, and which reaches most of a
            // real shelf where the curated table reached a handful. Rendering
            // only `ok` printed those books as a heading, an author line and a
            // note, with the commentary itself dropped on the floor: the
            // structured output carried it, the reader never saw it.
            if (s.status === "ok" || s.status === "ok_titles" || s.status === "ok_group") {
                lines.push(
                    `${s.printed_page ? `${L.printedPage(num(s.printed_page))}${L.sep}` : ""}page_id=${s.page_id}${s.next_page_id !== null ? `${L.sep}next_page_id=${s.next_page_id}` : ""}`,
                    // Which index placed this text, on the surface the reader
                    // actually reads. It lived only in structuredContent, so a
                    // curated-table placement and a medium-confidence one read
                    // off a book's own headings arrived byte-identical — and
                    // the release notes promise that every text says which
                    // index placed it. A placement the reader cannot weigh is
                    // a placement taken on trust.
                    L.provenance(s.locus_source, s.confidence, s.status === "ok_group"),
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
