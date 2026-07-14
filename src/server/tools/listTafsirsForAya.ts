import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { ayaNotFound, badArg } from "../errors.js";
import type { PageStore } from "../pages.js";
import { ayaIdFromSurahAya, surahAyaFromId } from "../quran.js";
import { ResponseFormatInput } from "../schemas.js";
import type { ServiceStore } from "../services.js";
import { arabize, header, renderResponse, type RenderedResponse } from "../format.js";

/**
 * Per-aya tafsir coverage report (#18).
 *
 * Cross-references the DOWNLOADED tafsir shelves (categories 3 + 4 — tafsir
 * spans both) against the curated service/tafseer.db index and reports an
 * honest tri-state per book:
 *
 *   indexed_covers                — the index has an entry for this aya in this book.
 *   indexed_no_entry_for_this_aya — the book participates in the index but has
 *                                   no entry for this aya.
 *   not_indexed_coverage_unknown  — the book is absent from the curated index,
 *                                   so coverage CANNOT be determined. This is
 *                                   explicitly NOT evidence the book lacks
 *                                   commentary on the verse.
 *
 * No text-search fallback: a text scan was prototyped and withdrawn for
 * misattributing verses (shared phrases, basmala). The unknown state stays
 * unknown until a per-book ayah→page index exists.
 */

/** Shamela categories that hold tafsir books (tafsir spans BOTH 3 and 4). */
const TAFSIR_CATEGORY_IDS = [3, 4] as const;

export const listTafsirsForAyaInputShape = {
    aya_id: z.number().int().min(1).max(6236).optional().describe("Aya id 1..6236."),
    surah: z.number().int().min(1).max(114).optional().describe("Surah number, paired with `aya`."),
    aya: z.number().int().min(1).optional().describe("Aya within surah."),
    ...ResponseFormatInput,
};
export const listTafsirsForAyaInput = z.object(listTafsirsForAyaInputShape).strict();

export type TafsirCoverageStatus =
    | "indexed_covers"
    | "indexed_no_entry_for_this_aya"
    | "not_indexed_coverage_unknown";

export interface TafsirCoverageRow {
    book_id: number;
    book_name: string;
    author_name: string | null;
    death_year: number | null;
    category_id: number | null;
    category_name: string | null;
    /** True when the book sits in the tafsir categories (3 or 4). Index hits from other shelves (e.g. mawsuʿat) are included with false. */
    in_tafsir_categories: boolean;
    downloaded: boolean;
    status: TafsirCoverageStatus;
    /** Page carrying the tafsir of this aya — only when status is indexed_covers. */
    page_id: number | null;
    printed_page: string | null;
}

export interface ListTafsirsForAyaOutput {
    aya_id: number;
    surah: number;
    surah_name: string;
    aya: number;
    totals: {
        indexed_covers: number;
        indexed_no_entry_for_this_aya: number;
        not_indexed_coverage_unknown: number;
    };
    /** Honest coverage caveat: the index is curated; unknown-status books may well comment on the verse. */
    note: string;
    books: TafsirCoverageRow[];
}

const COVERAGE_NOTE =
    "فهرس التفسير (service/tafseer.db) فهرسٌ منتقًى لا يشمل كل الكتب؛ فالكتب التي حالتها «غير مفهرس — التغطية غير معلومة» قد تتضمن تفسيرًا للآية فعلًا ولا سبيل للجزم من الفهرس، وليس غيابها منه دليلًا على خلوّها من الكلام عليها. للوصول إليها تصفَّح فهارسها بـ shamela_get_toc أو shamela_get_book_section.";

const STATUS_ORDER: Record<TafsirCoverageStatus, number> = {
    indexed_covers: 0,
    indexed_no_entry_for_this_aya: 1,
    not_indexed_coverage_unknown: 2,
};

const STATUS_LABEL: Record<TafsirCoverageStatus, string> = {
    indexed_covers: "يشمل الآية في الفهرس",
    indexed_no_entry_for_this_aya: "مشارك في الفهرس ولا مدخل له لهذه الآية",
    not_indexed_coverage_unknown: "غير مفهرس — التغطية غير معلومة",
};

export async function runListTafsirsForAya(
    catalog: Catalog,
    services: ServiceStore,
    pages: PageStore,
    args: z.infer<typeof listTafsirsForAyaInput>,
): Promise<RenderedResponse<ListTafsirsForAyaOutput>> {
    let resolvedId: number;
    if (args.aya_id !== undefined) resolvedId = args.aya_id;
    else if (args.surah !== undefined && args.aya !== undefined) {
        const id = ayaIdFromSurahAya(args.surah, args.aya);
        if (id === null) throw ayaNotFound(`surah=${args.surah} aya=${args.aya}`);
        resolvedId = id;
    } else throw badArg("Provide either aya_id or both surah and aya.");
    const sa = surahAyaFromId(resolvedId);
    if (!sa) throw ayaNotFound(String(resolvedId));

    // Curated index: hits for this aya (deduped per book, first page kept) +
    // the set of books participating in the index at all.
    const hits = await services.getBooksForKey("tafseer", resolvedId);
    const hitPageByBook = new Map<number, number>();
    for (const h of hits) if (!hitPageByBook.has(h.book_id)) hitPageByBook.set(h.book_id, h.page_id);
    const inService = new Set(await services.listInService("tafseer"));

    // Downloaded tafsir shelves — categories 3 AND 4 (never assume one bucket).
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
        if (hitPageByBook.has(bookId)) {
            status = "indexed_covers";
            pageId = hitPageByBook.get(bookId)!;
        } else if (inService.has(bookId)) {
            status = "indexed_no_entry_for_this_aya";
        } else {
            status = "not_indexed_coverage_unknown";
        }
        const printed =
            status === "indexed_covers" && downloaded && pageId !== null
                ? await pages.printedPage(bookId, pageId)
                : null;
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

    const totals = {
        indexed_covers: rows.filter((r) => r.status === "indexed_covers").length,
        indexed_no_entry_for_this_aya: rows.filter((r) => r.status === "indexed_no_entry_for_this_aya").length,
        not_indexed_coverage_unknown: rows.filter((r) => r.status === "not_indexed_coverage_unknown").length,
    };

    const out: ListTafsirsForAyaOutput = {
        aya_id: resolvedId,
        surah: sa.surah,
        surah_name: sa.surah_name,
        aya: sa.aya,
        totals,
        note: COVERAGE_NOTE,
        books: rows,
    };
    return renderResponse(out, args.response_format, (data) => {
        const lines = [
            header(1, `تغطية تفاسير الآية ${data.surah_name} ${arabize(data.surah)}:${arabize(data.aya)}`),
            `في الفهرس لهذه الآية: **${arabize(data.totals.indexed_covers)}**، مشارك في الفهرس بلا مدخل لها: **${arabize(data.totals.indexed_no_entry_for_this_aya)}**، غير مفهرس (التغطية غير معلومة): **${arabize(data.totals.not_indexed_coverage_unknown)}**.`,
            "",
            `> *${data.note}*`,
        ];
        for (const status of Object.keys(STATUS_ORDER) as TafsirCoverageStatus[]) {
            const group = data.books.filter((r) => r.status === status);
            if (!group.length) continue;
            lines.push("", header(3, STATUS_LABEL[status]));
            for (const r of group) {
                const bits: string[] = [];
                if (r.author_name) bits.push(`${r.author_name}${r.death_year ? ` (ت ${arabize(r.death_year)}هـ)` : ""}`);
                if (r.status === "indexed_covers" && r.page_id !== null) {
                    bits.push(`page_id=${r.page_id}${r.printed_page ? `، ص ${arabize(r.printed_page)}` : ""}`);
                }
                if (!r.in_tafsir_categories && r.category_name) bits.push(`من تصنيف: ${r.category_name}`);
                if (!r.downloaded) bits.push("غير منزَّل");
                lines.push(`- **${r.book_name}**${bits.length ? ` — ${bits.join("؛ ")}` : ""}`);
            }
        }
        return lines.join("\n");
    });
}
