import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { ayaNotFound, ayaOutOfSurah, badArg, serviceKeyNotFound } from "../errors.js";
import { ayaIdFromSurahAya, surahAyaFromId } from "../quran.js";
import { ResponseFormatInput } from "../schemas.js";
import type { ServiceStore } from "../services.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { getTafseerOfAyaLabels } from "../i18n/tools/getTafseerOfAya.js";

export const getTafseerOfAyaInputShape = {
    aya_id: z.number().int().min(1).max(6236).optional().describe("Aya id 1..6236."),
    surah: z.number().int().min(1).max(114).optional().describe("Surah number, paired with `aya`."),
    aya: z.number().int().min(1).optional().describe("Aya within surah."),
    downloaded_only: z.boolean().default(true).describe("If true (default), only return books the user has downloaded locally."),
    ...ResponseFormatInput,
};
export const getTafseerOfAyaInput = z.object(getTafseerOfAyaInputShape).strict();

export interface TafseerHit {
    book_id: number;
    book_name: string;
    author_name: string | null;
    /** Where the commentary sits — several when it runs across pages. */
    page_ids: number[];
    downloaded: boolean;
}

export interface GetTafseerOfAyaOutput {
    aya_id: number;
    surah: number;
    surah_name: string;
    aya: number;
    /** Distinct books, not index rows. */
    total: number;
    /** Rows behind that count; one book can span pages. */
    index_rows: number;
    returned: number;
    /** Honest coverage caveat: this index is curated and may omit downloaded tafsirs. */
    coverage_note: string;
    results: TafseerHit[];
}

export async function runGetTafseerOfAya(
    catalog: Catalog,
    services: ServiceStore,
    args: z.infer<typeof getTafseerOfAyaInput>,
): Promise<RenderedResponse<GetTafseerOfAyaOutput>> {
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
    if (hits.length === 0) throw serviceKeyNotFound("tafseer", resolvedId);
    // A book can appear several times for one verse — the table has a row per
    // page, and one commentary can run across pages. Counting rows and calling
    // them books reported thirteen commentaries where there were five.
    const distinctBooks = new Set(hits.map((h) => h.book_id)).size;

    const filtered = args.downloaded_only ? hits.filter((h) => catalog.isDownloaded(h.book_id)) : hits;
    // One entry per BOOK, its pages gathered and de-duplicated. Row-per-page
    // results made `returned` (rows) exceed `total` (distinct books) in one
    // response — 13 over 5 measured — and duplicate table rows repeated
    // identical entries, so the list overstated the coverage it presented.
    const byBook = new Map<number, TafseerHit>();
    for (const h of filtered) {
        const existing = byBook.get(h.book_id);
        if (existing) {
            if (!existing.page_ids.includes(h.page_id)) existing.page_ids.push(h.page_id);
            continue;
        }
        const rec = catalog.bookRecord(h.book_id);
        byBook.set(h.book_id, {
            book_id: h.book_id,
            book_name: rec?.book_name ?? `(unknown ${h.book_id})`,
            author_name: rec ? catalog.mainAuthorName(rec) : null,
            page_ids: [h.page_id],
            downloaded: catalog.isDownloaded(h.book_id),
        });
    }
    const results = [...byBook.values()];
    for (const r of results) r.page_ids.sort((a, b) => a - b);
    const L = pick(getTafseerOfAyaLabels);
    const out: GetTafseerOfAyaOutput = {
        aya_id: resolvedId,
        surah: sa.surah,
        surah_name: sa.surah_name,
        aya: sa.aya,
        total: distinctBooks,
        index_rows: hits.length,
        returned: results.length,
        coverage_note: L.coverageNote,
        results,
    };
    return renderResponse(out, args.response_format, (data) => {
        const lines = [
            header(1, L.heading(data.surah_name, num(data.surah), num(data.aya))),
            L.summary(num(data.total), num(data.returned)),
            "",
            `> *${L.coverageNote}*`,
            "",
        ];
        for (const r of data.results) {
            lines.push(
                L.bookLine(
                    r.book_name,
                    r.author_name ?? "",
                    r.page_ids.join(", "),
                    r.downloaded,
                ),
            );
        }
        return lines.join("\n");
    });
}
