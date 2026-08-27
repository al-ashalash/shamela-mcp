import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { ayaNotFound, ayaOutOfSurah, badArg } from "../errors.js";
import type { PageStore } from "../pages.js";
import { ayaIdFromSurahAya, surahAyaFromId } from "../quran.js";
import type { AyaIndexStore } from "../ayaIndex/store.js";
import { locateAya } from "../ayaIndex/build.js";
import type { Helper } from "../helper.js";
import { ResponseFormatInput } from "../schemas.js";
import type { ServiceStore } from "../services.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { listTafsirsForAyaLabels } from "../i18n/tools/listTafsirsForAya.js";

/**
 * Per-aya tafsir coverage report (#18).
 *
 * Cross-references the DOWNLOADED tafsir shelves (TAFSIR_CATEGORY_IDS) against
 * two indexes — Shamela's curated service/tafseer.db and the index built from
 * each book's own chapter headings — and reports an honest state per book:
 *
 *   indexed_covers                — Shamela's table places the verse on a page.
 *   title_index                   — the book's own headings place it.
 *   title_index_group             — placed, but by a heading covering a range of
 *                                   verses rather than this one alone.
 *   covered_no_locus              — we indexed the book; it carries no marker for
 *                                   this verse.
 *   indexed_no_entry_for_this_aya — in Shamela's table with no entry for this
 *                                   verse, and its headings place none either.
 *   index_pending                 — not indexed yet: this call's build budget ran
 *                                   out, or the search engine has not read the
 *                                   book's titles. Calling again continues.
 *   not_indexed_coverage_unknown  — nothing places verses in this book at all.
 *                                   Explicitly NOT evidence that it lacks
 *                                   commentary on the verse.
 *
 * No text-search fallback: a text scan was prototyped and withdrawn for
 * misattributing verses (shared phrases, basmala). A verse that cannot be
 * placed stays unplaced, and the report says so rather than guessing.
 */

/**
 * Shamela files tafsir across three categories, not two: commentary proper,
 * Qur'anic sciences, and recitation. Leaving 5 out silently hid part of the
 * shelf from every coverage answer.
 */
const TAFSIR_CATEGORY_IDS = [3, 4, 5] as const;

export const listTafsirsForAyaInputShape = {
    aya_id: z.number().int().min(1).max(6236).optional().describe("Aya id 1..6236."),
    surah: z.number().int().min(1).max(114).optional().describe("Surah number, paired with `aya`."),
    aya: z.number().int().min(1).optional().describe("Aya within surah."),
    // This tool reports one row per book on every downloaded tafsir shelf, and
    // that is the point — an empty row is evidence. But it shipped with no way
    // to page, so on a full library it returned 738 rows unconditionally and
    // overran the response budget every time. The larger the reader's library,
    // the more certainly the tool failed. `totals` still counts every book, so
    // paging costs nothing that matters: the coverage claim is carried by the
    // counts, and `books` is the readable slice of it.
    limit: z.number().int().min(1).max(200).default(50).describe("Rows to return (1–200, default 50). `totals` always counts the whole shelf, not just this page."),
    offset: z.number().int().min(0).default(0).describe("Rows to skip, for paging through the full list."),
    ...ResponseFormatInput,
};
export const listTafsirsForAyaInput = z.object(listTafsirsForAyaInputShape).strict();

export type TafsirCoverageStatus =
    /** Shamela's own curated table places this verse on a page. */
    | "indexed_covers"
    /** Located from the book's own chapter titles. */
    | "title_index"
    /** Located, but the marker covers a group of verses rather than this one. */
    | "title_index_group"
    /** In Shamela's table, but with no entry for this verse. */
    | "indexed_no_entry_for_this_aya"
    /** We indexed the book and it has no marker for this verse. */
    | "covered_no_locus"
    /** The book has not been indexed yet; its search index was not ready. */
    | "index_pending"
    /** Nothing places verses in this book — it is not arranged by verse. */
    | "not_indexed_coverage_unknown";

export interface TafsirCoverageRow {
    book_id: number;
    book_name: string;
    author_name: string | null;
    death_year: number | null;
    category_id: number | null;
    category_name: string | null;
    /** True when the book sits in the tafsir categories (3, 4 or 5). Index hits from other shelves (e.g. mawsuʿat) are included with false. */
    in_tafsir_categories: boolean;
    downloaded: boolean;
    status: TafsirCoverageStatus;
    /** Page carrying the tafsir of this aya — only when a status locates one. */
    page_id: number | null;
    printed_page: string | null;
    /** Which index placed it: Shamela's table, or the book's own titles. */
    locus_source: "service" | "titles" | null;
    /** The chapter title that placed it, so the reader can verify it directly. */
    title_id: number | null;
    /** How far the title index for this book may be trusted. */
    confidence: "high" | "medium" | null;
}

export interface ListTafsirsForAyaOutput {
    aya_id: number;
    surah: number;
    surah_name: string;
    aya: number;
    /** One count per state. Summing them into a single number would hide
     *  the difference between a located verse and a book we could not place. */
    totals: Record<string, number>;
    /** How many books were left unindexed because this call's build budget ran out. */
    index_pending_count: number;
    /**
     * A sample of those books, capped. The full list ran to 587 ids on a real
     * library and was the single largest thing in the payload — a raw id array
     * nobody could act on, crowding out the rows that carry meaning. The count
     * above is the answer to "how many"; these are enough to recognise which.
     */
    index_pending_book_ids: number[];
    /** Rows matching this aya across the shelf, before `limit`/`offset`. */
    total: number;
    /** Rows in this response. */
    returned: number;
    offset: number;
    has_more: boolean;
    /** Honest coverage caveat: a book neither index places may well comment on the verse. */
    note: string;
    books: TafsirCoverageRow[];
}

const STATUS_ORDER: Record<TafsirCoverageStatus, number> = {
    indexed_covers: 0,
    title_index: 1,
    title_index_group: 2,
    indexed_no_entry_for_this_aya: 3,
    covered_no_locus: 4,
    index_pending: 5,
    not_indexed_coverage_unknown: 6,
};

export async function runListTafsirsForAya(
    catalog: Catalog,
    services: ServiceStore,
    pages: PageStore,
    helper: Helper | null,
    ayaIndex: AyaIndexStore | null,
    args: z.infer<typeof listTafsirsForAyaInput>,
): Promise<RenderedResponse<ListTafsirsForAyaOutput>> {
    let resolvedId: number;
    if (args.aya_id !== undefined) resolvedId = args.aya_id;
    else if (args.surah !== undefined && args.aya !== undefined) {
        const id = ayaIdFromSurahAya(args.surah, args.aya);
        if (id === null) throw ayaOutOfSurah(args.surah!, args.aya!);
        resolvedId = id;
    } else throw badArg("Provide either aya_id or both surah and aya.");
    const sa = surahAyaFromId(resolvedId);
    if (!sa) throw ayaNotFound(String(resolvedId));
    const surah = sa.surah;
    const ayaInSurahNumber = sa.aya;
    const pendingIds: number[] = [];
    ayaIndex?.resetBudget();

    // Curated index: hits for this aya (deduped per book, first page kept) +
    // the set of books participating in the index at all.
    const hits = await services.getBooksForKey("tafseer", resolvedId);
    const hitPageByBook = new Map<number, number>();
    for (const h of hits) if (!hitPageByBook.has(h.book_id)) hitPageByBook.set(h.book_id, h.page_id);
    const inService = new Set(await services.listInService("tafseer"));

    // Downloaded tafsir shelves — all three of them (never assume one bucket).
    const shelfBookIds = new Set<number>();
    for (const cid of TAFSIR_CATEGORY_IDS) {
        for (const id of catalog.booksInCategory(cid)) {
            if (catalog.isDownloaded(id)) shelfBookIds.add(id);
        }
    }

    const buildRow = async (bookId: number): Promise<TafsirCoverageRow> => {
        const rec = catalog.bookRecord(bookId);
        const authorRec =
            rec && rec.main_author !== null ? catalog.authorRecord(rec.main_author) : undefined;
        const categoryId = rec?.book_category ?? null;
        const downloaded = catalog.isDownloaded(bookId);
        let status: TafsirCoverageStatus;
        let pageId: number | null = null;
        let locusSource: "service" | "titles" | null = null;
        let titleId: number | null = null;
        let confidence: "high" | "medium" | null = null;

        if (hitPageByBook.has(bookId)) {
            // Shamela's own table wins when it has an answer: it is their data
            // about their books.
            status = "indexed_covers";
            pageId = hitPageByBook.get(bookId)!;
            locusSource = "service";
        } else if (downloaded && ayaIndex && helper) {
            // Their table is curated and covers a fraction of a real shelf, so
            // fall back to what the book itself says in its chapter titles.
            const availability = await ayaIndex.get(helper, bookId);
            if (availability.state === "ready") {
                const idx = availability.index;
                const found = locateAya(idx, surah, ayaInSurahNumber);
                if (found) {
                    status = found.group ? "title_index_group" : "title_index";
                    pageId = found.page_id;
                    titleId = found.title_id || null;
                    locusSource = "titles";
                    confidence = idx.confidence === "low" ? null : idx.confidence;
                } else if (idx.coverage.ayat > 0) {
                    status = "covered_no_locus";
                } else {
                    status = inService.has(bookId)
                        ? "indexed_no_entry_for_this_aya"
                        : "not_indexed_coverage_unknown";
                }
            } else if (availability.state === "pending" || availability.state === "not_built") {
                status = "index_pending";
                pendingIds.push(bookId);
            } else {
                status = inService.has(bookId)
                    ? "indexed_no_entry_for_this_aya"
                    : "not_indexed_coverage_unknown";
            }
        } else if (inService.has(bookId)) {
            status = "indexed_no_entry_for_this_aya";
        } else {
            status = "not_indexed_coverage_unknown";
        }

        const printed =
            pageId !== null && downloaded ? await pages.printedPage(bookId, pageId) : null;
        return {
            book_id: bookId,
            book_name: rec?.book_name ?? `(unknown ${bookId})`,
            author_name: rec ? catalog.mainAuthorName(rec) : null,
            death_year: authorRec?.death_year ?? null,
            category_id: categoryId,
            category_name: categoryId !== null ? catalog.category(categoryId)?.category_name ?? null : null,
            in_tafsir_categories:
                categoryId !== null && (TAFSIR_CATEGORY_IDS as readonly number[]).includes(categoryId),
            downloaded,
            status,
            page_id: pageId,
            printed_page: printed,
            locus_source: locusSource,
            title_id: titleId,
            confidence,
        };
    };

    // Union: every downloaded tafsir-shelf book + every index hit for this aya
    // (hits outside categories 3/4 — e.g. mawsuʿat — are included, marked).
    const allIds = new Set<number>(shelfBookIds);
    for (const id of hitPageByBook.keys()) allIds.add(id);

    const rows: TafsirCoverageRow[] = [];
    for (const id of allIds) rows.push(await buildRow(id));
    rows.sort((a, b) => {
        const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        if (s !== 0) return s;
        if (a.downloaded !== b.downloaded) return a.downloaded ? -1 : 1;
        return a.book_id - b.book_id;
    });

    // Counted per state on purpose. Collapsing these into one number would
    // put "we found the verse" and "we could not place it" under one heading.
    const totals: Record<string, number> = {};
    for (const key of Object.keys(STATUS_ORDER)) {
        totals[key] = rows.filter((r) => r.status === key).length;
    }

    // `totals` is computed over every row above, and stays that way: paging
    // must not shrink the coverage claim, only the slice being read.
    const page = rows.slice(args.offset, args.offset + args.limit);
    const PENDING_SAMPLE = 50;

    const out: ListTafsirsForAyaOutput = {
        aya_id: resolvedId,
        surah: sa.surah,
        surah_name: sa.surah_name,
        aya: sa.aya,
        totals,
        index_pending_count: pendingIds.length,
        index_pending_book_ids: pendingIds.slice(0, PENDING_SAMPLE),
        total: rows.length,
        returned: page.length,
        offset: args.offset,
        has_more: args.offset + page.length < rows.length,
        // A caveat written for a reader, not a value a caller branches on, so
        // it follows the reader's language even though it rides in
        // structuredContent alongside the ids and the counts.
        note: pick(listTafsirsForAyaLabels).note,
        books: page,
    };
    return renderResponse(out, args.response_format, (data) => {
        const L = pick(listTafsirsForAyaLabels);
        const located =
            (data.totals.indexed_covers ?? 0) +
            (data.totals.title_index ?? 0) +
            (data.totals.title_index_group ?? 0);
        const unlocated =
            (data.totals.covered_no_locus ?? 0) +
            (data.totals.indexed_no_entry_for_this_aya ?? 0) +
            (data.totals.not_indexed_coverage_unknown ?? 0);
        const lines = [
            header(1, L.heading(data.surah_name, num(data.surah), num(data.aya))),
            L.summary(
                located,
                unlocated,
                data.index_pending_book_ids.length
                    ? L.pendingClause(data.index_pending_book_ids.length)
                    : "",
            ),
            "",
            `> *${data.note}*`,
        ];
        for (const status of Object.keys(STATUS_ORDER) as TafsirCoverageStatus[]) {
            const group = data.books.filter((r) => r.status === status);
            if (!group.length) continue;
            lines.push("", header(3, L.statusLabel[status]));
            for (const r of group) {
                const bits: string[] = [];
                if (r.author_name) {
                    bits.push(`${r.author_name}${r.death_year ? L.deathYear(num(r.death_year)) : ""}`);
                }
                if (r.page_id !== null) {
                    bits.push(L.pageBit(String(r.page_id), r.printed_page ? num(r.printed_page) : ""));
                }
                if (!r.in_tafsir_categories && r.category_name) bits.push(L.fromCategory(r.category_name));
                if (!r.downloaded) bits.push(L.notDownloaded);
                lines.push(L.bookLine(r.book_name, bits.join(L.bitSeparator)));
            }
        }
        return lines.join("\n");
    });
}
