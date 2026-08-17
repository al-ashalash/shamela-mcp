/**
 * Building one book's verse→page index from its own chapter titles.
 *
 * IMPORTANT — how the book file may be read. Shamela's databases run in WAL
 * mode, and opening one with a real SQLite driver (node:sqlite, better-sqlite3)
 * creates `-wal` and `-shm` files beside it. That is a write into the user's
 * library, which this extension does not do under any circumstances; an earlier
 * experiment scattered over a thousand such files before it was caught. The
 * only permitted path is the one PageStore already uses: read the bytes and
 * hand them to sql.js, which keeps the whole thing in memory.
 *
 * The title TEXT does not live in SQLite — only ids and page numbers do — so
 * the text is fetched through the Java helper, which reads Shamela's Lucene
 * store. That has a consequence worth knowing: a book downloaded moments ago is
 * on disk and in the catalogue while the helper's readers have not seen it, and
 * its titles come back empty. Building an index from those would produce a
 * confident, empty answer, so an unusually empty result is treated as "not
 * ready" rather than "has no titles".
 */

import {
    AYA_INDEX_MIN_TITLE_TEXT_RATIO,
    AYA_INDEX_SCHEMA_VERSION,
    TITLES_BATCH_CHUNK,
    VERSION,
} from "../constants.js";
import type { Helper } from "../helper.js";
import type { PageStore } from "../pages.js";
import { ayatInSurah } from "../quran.js";
import {
    assignSurahRoots,
    gradeConfidence,
    matchSurahHead,
    parseF1,
    parseNumericTitle,
    validate,
    type Confidence,
    type Diagnostics,
    type Grammar,
    type IndexEntry,
    type RootCandidate,
} from "./parse.js";

/** Total ayat in the Qur'an; the index is one slot per verse. */
const TOTAL_AYAT = 6236;

export interface BookAyaIndex {
    schema: number;
    builder: string;
    book_id: number;
    source: { size: number; mtime_ms: number };
    built_at: number;
    grammar: Grammar;
    confidence: Confidence;
    coverage: { ayat: number; pct: number };
    diagnostics: Diagnostics;
    /** 6236 slots: the page for each verse, 0 where unknown. */
    pages: number[];
    /** Parallel: the title whose marker placed the verse, 0 where unknown. */
    titles: number[];
    /** Verse → the span its marker covered, when it covered several. */
    ranges: Record<string, [number, number]>;
    /** Surahs where markers are sparse enough that a hit means "somewhere in here". */
    granularity: Record<string, "group">;
    /** First and last page of each surah, for when a verse cannot be placed. */
    surah_pages: Array<[number, number] | null>;
}

/** Cumulative index of a verse in the 6236-slot arrays. */
function slotOf(surah: number, aya: number): number | null {
    let base = 0;
    for (let s = 1; s < surah; s++) {
        const n = ayatInSurah(s);
        if (n === null) return null;
        base += n;
    }
    const limit = ayatInSurah(surah);
    if (limit === null || aya < 1 || aya > limit) return null;
    return base + aya - 1;
}

interface TitleRow {
    title_id: number;
    page_id: number;
    parent_id: number;
}

/** Fetch title texts from the helper, in chunks it can digest. */
async function fetchTitleTexts(
    helper: Helper,
    bookId: number,
    ids: number[],
): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    for (let i = 0; i < ids.length; i += TITLES_BATCH_CHUNK) {
        const chunk = ids.slice(i, i + TITLES_BATCH_CHUNK);
        const res = await helper.request<{ results?: Array<{ title_id?: number; title_text?: string }> }>(
            "get_titles_batch",
            { book_id: bookId, title_ids: chunk },
        );
        for (const r of res.results ?? []) {
            if (typeof r.title_id === "number") out.set(r.title_id, r.title_text ?? "");
        }
    }
    return out;
}

export class TitlesNotReadyError extends Error {
    constructor(public readonly bookId: number) {
        super(`titles for book ${bookId} are not readable yet`);
    }
}

export async function buildBookIndex(
    helper: Helper,
    pages: PageStore,
    bookId: number,
    source: { size: number; mtime_ms: number },
): Promise<BookAyaIndex> {
    const rows: TitleRow[] = await pages.allTitleRows(bookId);
    const empty = (grammar: Grammar): BookAyaIndex => ({
        schema: AYA_INDEX_SCHEMA_VERSION,
        builder: VERSION,
        book_id: bookId,
        source,
        built_at: Date.now(),
        grammar,
        confidence: "low",
        coverage: { ayat: 0, pct: 0 },
        diagnostics: {
            v1_out_of_order: 0,
            v2_outside_surah: 0,
            dropped_v3: 0,
            dropped_v4: 0,
            surah_roots: 0,
            root_assignment: "none",
            titles_empty: 0,
        },
        pages: [],
        titles: [],
        ranges: {},
        granularity: {},
        surah_pages: new Array(114).fill(null),
    });

    if (!rows.length) return empty("none");

    const texts = await fetchTitleTexts(helper, bookId, rows.map((r) => r.title_id));
    const nonEmpty = rows.filter((r) => (texts.get(r.title_id) ?? "").trim().length > 0).length;
    if (nonEmpty / rows.length < AYA_INDEX_MIN_TITLE_TEXT_RATIO) {
        // Almost certainly a book the search engine has not read yet. Refusing
        // to build beats building an index that is empty for the wrong reason.
        throw new TitlesNotReadyError(bookId);
    }

    const entries: IndexEntry[] = [];
    const ranges: Record<string, [number, number]> = {};
    const push = (surah: number, from: number, to: number, row: TitleRow): void => {
        for (let a = from; a <= to; a++) {
            entries.push({ surah, aya: a, page_id: row.page_id, title_id: row.title_id });
        }
        if (to > from) ranges[`${surah}:${from}`] = [from, to];
    };

    // Pass one: self-contained markers. When a book uses them, nothing else is
    // needed — the surah number is inside the marker.
    let f1Count = 0;
    for (const row of rows) {
        const marker = parseF1(texts.get(row.title_id) ?? "");
        if (!marker) continue;
        f1Count++;
        push(marker.surah, marker.from, marker.to, row);
    }

    let grammar: Grammar = "none";
    let rootAssignment: Diagnostics["root_assignment"] = "none";
    let surahRoots = new Map<number, number>();

    if (f1Count >= 200 || (rows.length > 0 && f1Count / rows.length >= 0.05)) {
        grammar = "F1";
    } else {
        entries.length = 0;
        for (const k of Object.keys(ranges)) delete ranges[k];

        // Pass two: numbered titles under a surah heading. Which surah a heading
        // belongs to is decided by its position in the book.
        const candidates: RootCandidate[] = [];
        for (const row of rows) {
            const head = matchSurahHead(texts.get(row.title_id) ?? "");
            if (head) candidates.push({ title_id: row.title_id, page_id: row.page_id, named: head.surah });
        }
        surahRoots = assignSurahRoots(candidates);
        rootAssignment = surahRoots.size === 114 ? "ordinal" : surahRoots.size ? "by_name" : "none";

        if (surahRoots.size) {
            const byId = new Map(rows.map((r) => [r.title_id, r]));
            const surahOfTitle = (row: TitleRow): number | null => {
                // Walk up to the nearest heading; markers can sit under a
                // volume or a section, not only directly under the surah.
                let cur: TitleRow | undefined = row;
                for (let depth = 0; cur && depth < 8; depth++) {
                    const s = surahRoots.get(cur.title_id);
                    if (s) return s;
                    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
                }
                return null;
            };
            let numeric = 0;
            for (const row of rows) {
                if (surahRoots.has(row.title_id)) continue;
                const n = parseNumericTitle(texts.get(row.title_id) ?? "");
                if (n === null) continue;
                const surah = surahOfTitle(row);
                if (surah === null) continue;
                numeric++;
                push(surah, n, n, row);
            }
            grammar = numeric > 0 ? (rows.some((r) => /الآية/.test(texts.get(r.title_id) ?? "")) ? "F2" : "F3") : "none";
        }
    }

    const { kept, diagnostics } = validate(entries);

    const pagesArr = new Array<number>(TOTAL_AYAT).fill(0);
    const titlesArr = new Array<number>(TOTAL_AYAT).fill(0);
    for (const e of kept) {
        const slot = slotOf(e.surah, e.aya);
        if (slot === null) continue;
        pagesArr[slot] = e.page_id;
        titlesArr[slot] = e.title_id;
    }

    // Surah spans, both for reporting a range when a verse cannot be placed and
    // for saying so honestly when markers are too sparse to mean a verse.
    const surahPages: Array<[number, number] | null> = new Array(114).fill(null);
    const granularity: Record<string, "group"> = {};
    const bySurah = new Map<number, number[]>();
    for (const e of kept) {
        const bucket = bySurah.get(e.surah);
        if (bucket) bucket.push(e.page_id);
        else bySurah.set(e.surah, [e.page_id]);
    }
    for (const [surah, pageList] of bySurah) {
        surahPages[surah - 1] = [Math.min(...pageList), Math.max(...pageList)];
        const total = ayatInSurah(surah) ?? 0;
        const distinct = new Set(pageList).size;
        if (total > 0 && distinct / total < 0.2) granularity[String(surah)] = "group";
    }

    const covered = pagesArr.filter((p) => p > 0).length;
    const pct = Math.round((covered / TOTAL_AYAT) * 1000) / 10;
    const fullDiag: Diagnostics = {
        ...diagnostics,
        surah_roots: surahRoots.size,
        root_assignment: rootAssignment,
        titles_empty: rows.length - nonEmpty,
    };

    return {
        schema: AYA_INDEX_SCHEMA_VERSION,
        builder: VERSION,
        book_id: bookId,
        source,
        built_at: Date.now(),
        grammar,
        confidence: covered ? gradeConfidence(diagnostics, kept.length, pct) : "low",
        coverage: { ayat: covered, pct },
        diagnostics: fullDiag,
        pages: pagesArr,
        titles: titlesArr,
        ranges,
        granularity,
        surah_pages: surahPages,
    };
}

/**
 * Is this verse's placement a group placement — a marker covering several
 * verses, of which this is one?
 *
 * Two ways to be one, and for a long time only the second was consulted:
 *
 *  - **The marker itself covered a span.** `ranges` has recorded this since the
 *    index was first built and nothing ever read it. Its key is the span's
 *    FIRST verse, so membership is a containment test, not a lookup.
 *  - **The surah's markers are too sparse to mean a verse**, which the 0.2
 *    density rule catches.
 *
 * The density rule alone cannot fire for a short surah: with `total <= 5`,
 * `distinct >= 1` forces `distinct / total >= 0.2`. So سورة الكوثر, headed in
 * ابن كثير and البغوي by «[سورة الكوثر (١٠٨): الآيات ١ إلى ٣]» — the textbook
 * group marker — reported every one of its verses as an exact placement at
 * confidence "high", and the warning that says otherwise was withheld exactly
 * where it was true. Surahs 103, 105, 106, 108, 110, 111, 112 and 113 were all
 * unreachable by that rule.
 */
function isGroupPlacement(index: BookAyaIndex, surah: number, aya: number): boolean {
    if (index.granularity?.[String(surah)] === "group") return true;
    // A cache read off disk can be older or half-written; a missing field is
    // "no range information", not a crash in the middle of answering.
    const ranges = index.ranges ?? {};
    const prefix = `${surah}:`;
    for (const key of Object.keys(ranges)) {
        if (!key.startsWith(prefix)) continue;
        const span = ranges[key];
        if (span && aya >= span[0] && aya <= span[1]) return true;
    }
    return false;
}

/** Look one verse up in a built index. */
export function locateAya(
    index: BookAyaIndex,
    surah: number,
    aya: number,
): { page_id: number; title_id: number; group: boolean } | null {
    // A low-confidence index is kept for diagnosis and never used to answer.
    if (index.confidence === "low") return null;
    const slot = slotOf(surah, aya);
    if (slot === null) return null;
    const page = index.pages[slot] ?? 0;
    if (!page) return null;
    return {
        page_id: page,
        title_id: index.titles[slot] ?? 0,
        group: isGroupPlacement(index, surah, aya),
    };
}

/** The page span of a surah, for when a verse itself cannot be placed. */
export function surahSpan(index: BookAyaIndex, surah: number): [number, number] | null {
    if (surah < 1 || surah > 114) return null;
    return index.surah_pages[surah - 1] ?? null;
}
