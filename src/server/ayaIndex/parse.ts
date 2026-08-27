/**
 * Reading a verse's location out of a tafsir book's own chapter titles.
 *
 * The problem this solves: Shamela ships a prebuilt table linking verses to
 * tafsir pages, but it is curated and covers a fraction of what a researcher
 * actually has downloaded — so asking for a verse's commentary returned one
 * book while four sat unused on disk.
 *
 * The obvious alternative, searching each book for the verse's text, was tried
 * and measured and rejected. Scoped to the surah it still misattributed a
 * quarter of the verses, and — worse than the rate — the failures were confident
 * ones: a repeated phrase lands on its first occurrence, so «فبأي آلاء ربكما
 * تكذبان» resolves to the same page whichever of its thirty-one positions was
 * asked for. A wrong page delivered with no hint of doubt is a worse outcome
 * than admitting the location is unknown.
 *
 * What the books themselves already carry is unambiguous. Tafsir authors mark
 * where each verse's commentary begins, in one of three shapes:
 *
 *   F1  [سورة البقرة (٢): آية ٢٥٥]        — carries the surah number outright
 *   F2  الآية: ٢٥٥                        — a numbered child of a surah heading
 *   F3  ٢٥٥                               — a bare numeral, same idea
 *
 * F1 needs nothing else. F2 and F3 need to know which surah their parent
 * heading is, and that is decided by POSITION in the book, never by the
 * heading's text: one library titles al-Kawthar «سورة التكوير», and trusting
 * the name there would shift a surah and everything after it.
 *
 * Everything here is pure — no files, no database, no helper — so the grammar
 * can be tested against real observed titles without a Shamela install.
 */

import { normalizeArabic } from "../arabic.js";
import { ayatInSurah, surahFromTitleName } from "../quran.js";

/** One verse-range marker found in a title. */
export interface AyaMarker {
    surah: number;
    from: number;
    to: number;
}

export type Grammar = "F1" | "F2" | "F3" | "none";

/** Convert Arabic-Indic digits and read an integer, or null. */
function toInt(raw: string | undefined): number | null {
    if (!raw) return null;
    const western = raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    if (!/^\d{1,4}$/.test(western)) return null;
    const n = Number(western);
    return Number.isFinite(n) ? n : null;
}

const DIGITS = "[\\d٠-٩]";

/**
 * F1: a self-contained marker naming the surah and the verse(s).
 *
 * Observed spellings vary more than one would guess — the space before the
 * colon comes and goes, «إلى» appears with and without its hamza, and the
 * marker may sit inside a longer sentence («القول في تأويل قوله تعالى: [...]»)
 * — so the pattern is deliberately tolerant about the wrapper and strict about
 * the numbers.
 */
const F1_RE = new RegExp(
    "\\[\\s*سوره\\s+[^\\]\\(]*\\(\\s*(" + DIGITS + "+)\\s*\\)\\s*:?\\s*" +
        "(?:ايه|الايات|ايات)\\s*(" + DIGITS + "+)" +
        "(?:\\s*(?:الي|إلى|الى|-|–)\\s*(" + DIGITS + "+))?",
);

export function parseF1(text: string): AyaMarker | null {
    if (!text) return null;
    const m = F1_RE.exec(normalizeArabic(text));
    if (!m) return null;
    const surah = toInt(m[1]);
    const from = toInt(m[2]);
    if (surah === null || from === null) return null;
    if (surah < 1 || surah > 114) return null;
    const to = toInt(m[3]) ?? from;
    if (to < from) return null;
    const limit = ayatInSurah(surah);
    if (limit === null || from < 1 || from > limit) return null;
    return { surah, from, to: Math.min(to, limit) };
}

/**
 * F2/F3: a verse number with no surah, valid only under a surah heading.
 *
 * Accepts «الآية: ٢٥٥», a bare «٢٥٥», and «٢٥٥ - قوله تعالى…». Rejects
 * anything where the number is not the title's subject — a year, a section
 * name, an ordinal in prose — because a false positive here attaches a verse
 * to a page that is not about it.
 */
const NUMERIC_TITLE_RE = new RegExp(
    "^\\s*(?:الايه|ايه|الايات|ايات)?\\s*:?\\s*(" + DIGITS + "{1,3})\\s*(?:[-–—:].*)?$",
);

export function parseNumericTitle(text: string): number | null {
    if (!text) return null;
    const t = normalizeArabic(text).trim();
    // A year, a page reference, anything with a unit attached is not a verse.
    if (/[ء-ي]{2,}\s*$/.test(t) && !/^\s*(?:الايه|ايه|الايات|ايات)/.test(t)) {
        if (!/^[\s\d٠-٩]*[-–—:]/.test(t)) return null;
    }
    const m = NUMERIC_TITLE_RE.exec(t);
    if (!m) return null;
    const n = toInt(m[1]);
    return n !== null && n >= 1 && n <= 286 ? n : null;
}

/** A title that heads a surah, with whether the name was recognised. */
export interface SurahHead {
    surah: number;
    byName: boolean;
}

/**
 * Is this title a surah heading?
 *
 * Returns the surah its NAME suggests when that name is recognised, but the
 * caller must treat it as a hint: assignment happens by position.
 */
export function matchSurahHead(text: string): SurahHead | null {
    if (!text) return null;
    const t = normalizeArabic(text).trim();
    if (parseF1(text)) return null; // a verse marker, not a heading
    const named = surahFromTitleName(text);
    if (named !== null) return { surah: named, byName: true };
    // Headings whose name we do not recognise still count as headings, so the
    // ordinal assignment can place them; surah 0 means "unknown name".
    // A word boundary is defined on Latin word characters, so it never fires
    // between an Arabic letter and a space — match the boundary explicitly.
    if (/^(?:[\d٠-٩]+\s*[-–—:]?\s*)?(?:تفسير\s+)?سوره(?=\s|$)/.test(t)) return { surah: 0, byName: false };
    return null;
}

/**
 * Longest strictly increasing subsequence, by value, returning the indices kept.
 *
 * Books put a table of contents at the back, which repeats every surah heading
 * with a page number lower than where the commentary actually is. Keeping only
 * the longest run whose pages increase discards that tail without needing to
 * know it exists.
 */
export function longestIncreasing(values: number[]): number[] {
    if (!values.length) return [];
    const tailIdx: number[] = [];
    const prev: number[] = new Array(values.length).fill(-1);
    for (let i = 0; i < values.length; i++) {
        let lo = 0;
        let hi = tailIdx.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (values[tailIdx[mid]!]! < values[i]!) lo = mid + 1;
            else hi = mid;
        }
        if (lo > 0) prev[i] = tailIdx[lo - 1]!;
        tailIdx[lo] = i;
        if (lo === tailIdx.length - 1) tailIdx.length = lo + 1;
    }
    const out: number[] = [];
    let k = tailIdx[tailIdx.length - 1] ?? -1;
    while (k >= 0) {
        out.push(k);
        k = prev[k]!;
    }
    return out.reverse();
}

export interface RootCandidate {
    title_id: number;
    page_id: number;
    /** The surah its name suggests, or 0 when unrecognised. */
    named: number;
}

/**
 * Decide which surah each heading belongs to.
 *
 * Position decides. A complete tafsir has its 114 headings in order, so the
 * k-th surviving heading is surah k — and that holds even where the title text
 * is wrong, which it demonstrably is. When a book covers only part of the
 * Qur'an the ordinal rule has nothing to anchor to, so recognised names take
 * over, with the requirement that the numbers keep increasing; a heading that
 * breaks the order is dropped rather than guessed at.
 */
export function assignSurahRoots(candidates: RootCandidate[]): Map<number, number> {
    const out = new Map<number, number>();
    if (!candidates.length) return out;

    const ordered = [...candidates].sort((a, b) => a.title_id - b.title_id);
    const keep = longestIncreasing(ordered.map((c) => c.page_id)).map((i) => ordered[i]!);

    if (keep.length === 114) {
        keep.forEach((c, i) => out.set(c.title_id, i + 1));
        return out;
    }

    let last = 0;
    for (const c of keep) {
        if (c.named > last && c.named <= 114) {
            out.set(c.title_id, c.named);
            last = c.named;
        }
    }
    return out;
}

export interface IndexEntry {
    surah: number;
    aya: number;
    page_id: number;
    title_id: number;
    /** Set when one marker covers a span of verses. */
    range?: [number, number];
}

export interface Diagnostics {
    /** Page numbers going backwards as verse numbers go forwards. */
    v1_out_of_order: number;
    /** A verse placed outside its surah's page span. */
    v2_outside_surah: number;
    /** Verse numbers past the end of their surah. */
    dropped_v3: number;
    /** The same verse claimed by two distant pages. */
    dropped_v4: number;
    surah_roots: number;
    root_assignment: "ordinal" | "by_name" | "none";
    titles_empty: number;
}

export type Confidence = "high" | "medium" | "low";

/** Run the checks that decide whether this index may be used at all. */
export function validate(entries: IndexEntry[]): {
    kept: IndexEntry[];
    diagnostics: Pick<Diagnostics, "v1_out_of_order" | "v2_outside_surah" | "dropped_v3" | "dropped_v4">;
} {
    const diag = { v1_out_of_order: 0, v2_outside_surah: 0, dropped_v3: 0, dropped_v4: 0 };

    // V3: a verse number past the end of its surah means the heading was
    // assigned to the wrong surah, or the number was never a verse.
    const withinSurah = entries.filter((e) => {
        const limit = ayatInSurah(e.surah);
        if (limit === null || e.aya < 1 || e.aya > limit) {
            diag.dropped_v3++;
            return false;
        }
        return true;
    });

    // V4: the same verse from two titles far apart — one of them is wrong and
    // there is no way to tell which, so neither is kept.
    const byKey = new Map<string, IndexEntry[]>();
    for (const e of withinSurah) {
        const k = `${e.surah}:${e.aya}`;
        const bucket = byKey.get(k);
        if (bucket) bucket.push(e);
        else byKey.set(k, [e]);
    }
    const kept: IndexEntry[] = [];
    for (const bucket of byKey.values()) {
        if (bucket.length === 1) {
            kept.push(bucket[0]!);
            continue;
        }
        const pages = bucket.map((e) => e.page_id);
        if (Math.max(...pages) - Math.min(...pages) > 3) {
            diag.dropped_v4 += bucket.length;
            continue;
        }
        kept.push(bucket[0]!);
    }

    // V1: within a surah, later verses must not sit on earlier pages.
    const bySurah = new Map<number, IndexEntry[]>();
    for (const e of kept) {
        const bucket = bySurah.get(e.surah);
        if (bucket) bucket.push(e);
        else bySurah.set(e.surah, [e]);
    }
    const spans = new Map<number, [number, number]>();
    for (const [surah, list] of bySurah) {
        list.sort((a, b) => a.aya - b.aya);
        for (let i = 1; i < list.length; i++) {
            if (list[i]!.page_id < list[i - 1]!.page_id) diag.v1_out_of_order++;
        }
        const pages = list.map((e) => e.page_id);
        spans.set(surah, [Math.min(...pages), Math.max(...pages)]);
    }

    // V2: surahs must not overlap on the page — an overlap means a heading was
    // placed in the wrong part of the book.
    const ordered = [...spans.entries()].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < ordered.length; i++) {
        if (ordered[i]![1][0] < ordered[i - 1]![1][1]) diag.v2_outside_surah++;
    }

    return { kept, diagnostics: diag };
}

/**
 * How far this index may be trusted.
 *
 * `low` is not a weaker answer — it means the index is kept for diagnosis and
 * never used to return a page, because a location offered without warrant is
 * the failure this whole approach exists to avoid.
 */
export function gradeConfidence(
    diag: Pick<Diagnostics, "v1_out_of_order" | "v2_outside_surah">,
    entryCount: number,
    coveragePct: number,
): Confidence {
    const violations = diag.v1_out_of_order + diag.v2_outside_surah;
    if (violations === 0 && coveragePct >= 90) return "high";
    if (entryCount > 0 && violations <= entryCount * 0.005 && coveragePct >= 30) return "medium";
    return "low";
}
