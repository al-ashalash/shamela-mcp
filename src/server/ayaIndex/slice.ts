/**
 * Where on the page the verse's own commentary begins.
 *
 * The index says WHICH page comments on a verse. It never said WHERE on it,
 * and the tool returned the page from its first character — so when a verse's
 * section started near the foot of the page, the reader was handed the
 * commentary on the PREVIOUS passage under this verse's heading, with
 * confidence "high" and nothing to warn them.
 *
 * Measured, 15 Aug 2026: `get_tafseer_texts({surah:108, aya:2})` returned from
 * ابن كثير a page (8/471) whose every word is the commentary on سورة الماعون,
 * ending «آخر تفسير سورة الماعون ولله الحمد والمنة» followed by the bare
 * heading of سورة الكوثر. Not one word of الكوثر commentary — that begins on
 * the next page. The same shape came out of Shamela's own curated table:
 * 2:255 from الطبري returned a page that is the tafsir of 2:254 and ends at
 * the heading «القولُ في تأويل قولِ اللهِ… ﴿اللَّهُ لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ﴾».
 *
 * The fix is not to label the misattribution — it is to stop returning the
 * text above the marker. This module finds the marker; the caller slices from
 * it and, when what remains is too short to be the commentary, continues onto
 * the next page.
 *
 * Matching is line-based and normalised. The title text and the page text both
 * come out of Shamela's own Lucene indexes, but not always spelled the same —
 * diacritics and spacing drift between the two — and normalising a whole page
 * would move every offset in it. Comparing line by line keeps the offsets in
 * the ORIGINAL string, which is what the caller has to slice.
 */

import { normalizeArabic } from "../arabic.js";
import { parseF1 } from "./parse.js";

/** A chapter title that starts on the page being read. */
export interface PageTitle {
    title_id: number;
    text: string;
}

export interface MarkerHit {
    /** Offset into the ORIGINAL body where the marker's line starts. */
    offset: number;
    /** The title that marked it. */
    title_id: number;
    /** How the title was chosen. */
    via: "title_id" | "parsed_marker" | "quoted_verse";
}

/**
 * Normalised, whitespace-FREE form used for comparison only.
 *
 * Whitespace is dropped rather than collapsed because the drift between the
 * title index and the page index includes spacing around punctuation —
 * «(١٠٨) : الآيات» against «(١٠٨): الآيات» — which a collapse leaves
 * different and a containment test then misses.
 */
function key(s: string): string {
    return normalizeArabic(s).replace(/\s+/g, "");
}

/**
 * Find where `title` sits in `body`, as an offset into `body` itself.
 *
 * Returns the start of the LINE carrying the title, not the match inside it,
 * because a heading is a line and slicing mid-line would behead it.
 */
export function offsetOfTitle(body: string, title: string): number | null {
    const needle = key(title);
    if (needle.length < 4) return null; // too short to identify anything
    let cursor = 0;
    for (const line of body.split("\n")) {
        const k = key(line);
        if (k.length >= 4 && (k.includes(needle) || needle.includes(k))) return cursor;
        cursor += line.length + 1; // + the newline that split consumed
    }
    return null;
}

/**
 * Pick the title on this page that marks the verse, and say where it starts.
 *
 * `preferredTitleId` is the title the index itself used, when the locus came
 * from the book's own markers. When it came from Shamela's curated table there
 * is no title id, so the titles on the page are parsed and the one whose verse
 * range covers this verse wins — the same grammar the index is built from, so
 * a page the table placed and a page the titles placed are treated alike.
 */
export function findVerseMarker(
    body: string,
    titles: PageTitle[],
    surah: number,
    aya: number,
    preferredTitleId: number | null,
    verseText?: string | null,
): MarkerHit | null {
    if (!body || !titles.length) return null;

    if (preferredTitleId) {
        const exact = titles.find((t) => t.title_id === preferredTitleId);
        if (exact) {
            const offset = offsetOfTitle(body, exact.text);
            if (offset !== null) return { offset, title_id: exact.title_id, via: "title_id" };
        }
    }

    // No usable title id: read the markers the way the index reader does.
    // Later titles win a tie — within one page the last marker covering the
    // verse is the one its section starts at.
    let best: MarkerHit | null = null;
    for (const t of titles) {
        const m = parseF1(t.text);
        if (!m || m.surah !== surah || aya < m.from || aya > m.to) continue;
        const offset = offsetOfTitle(body, t.text);
        if (offset === null) continue;
        if (!best || offset > best.offset) {
            best = { offset, title_id: t.title_id, via: "parsed_marker" };
        }
    }
    if (best) return best;

    return best;
}

/**
 * Last resort, for books that mark a section by QUOTING the verse.
 *
 * الطبري heads every section this way — «القولُ في تأويل قولِ اللهِ جلّ ثناؤه:
 * ﴿اللَّهُ لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ﴾» — and, measured on this machine, his
 * page 2936 carries **no rows at all** in the book's `title` table. So there is
 * no heading to anchor to and parseF1 has nothing to read: 2:255 came back as
 * the whole tafsir of 2:254 with the marker sitting in the last line.
 *
 * The line scan is deliberately narrow:
 *
 *  - It needs a contiguous run of the verse's OPENING (18 normalised
 *    characters). The commentary quotes verses in fragments — ﴿اللَّهُ﴾ alone,
 *    then ﴿لَا إِلَهَ إِلَّا هُوَ﴾ — and no fragment satisfies a contiguous opening
 *    run, so ordinary quotation inside prose does not trigger a cut.
 *  - Short verses get no fallback at all: «مدهامتان» would match half the
 *    library.
 *  - It takes the FIRST match, not the last. Cutting too early keeps a little
 *    of the previous passage; cutting too late would throw away the verse's
 *    own commentary, and losing the answer is worse than padding it.
 */
export function findVerseByQuotation(body: string, verseText: string | null): number | null {
    if (!body || !verseText) return null;
    const k = key(verseText);
    if (k.length < MIN_VERSE_KEY_CHARS) return null;
    const opening = k.slice(0, MIN_VERSE_KEY_CHARS);
    let cursor = 0;
    for (const line of body.split("\n")) {
        if (key(line).includes(opening)) return cursor;
        cursor += line.length + 1;
    }
    return null;
}

/**
 * Normalised characters of a verse's opening needed before the quotation
 * fallback will act on it. Below this a verse is not evidence of anything:
 * «مدهامتان» and «والفجر» occur inside other prose constantly, and a page
 * returned whole with `text_starts_at_verse: false` is honest, where a
 * confident cut in the wrong place is not.
 */
const MIN_VERSE_KEY_CHARS = 18;
