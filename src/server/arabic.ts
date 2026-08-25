/**
 * Arabic text utilities.
 *
 * Node-side normalization + tokenization that mirrors (closely enough) the
 * Java helper's Normalize so we can do two-stage post-filtering (phrase /
 * proximity) and query-side prefix expansion without touching the Lucene index.
 *
 * Both the query and the page text are passed through the SAME normalizer, so
 * matching is internally consistent regardless of small differences from the
 * Java side.
 */

// Tashkeel, tatweel, dagger-alef, Quranic annotation marks, and the honorific
// ligatures → removed. Mirrors Normalize.isDropped on the Java side.
const DIACRITICS_RE = /[ؐ-ًؚ-ٰٟۖ-ۭـ﵀-﵏﷏ﷺﷻ﷽-﷿]/g;

/**
 * Ordered passes mirroring Shamela's chained MappingCharFilters. Each pass walks
 * left-to-right and NEVER re-scans its own output; that output then feeds the
 * next pass. The ordering is load-bearing: «يء» becomes «ئ» in P5 before P8 turns
 * every «ئ» into «ي», which is why «شيء» is indexed as «شي».
 *
 * Every replacement is no longer than its key. The Java side relies on that to
 * carry snippet offsets through the passes, so keep it true.
 *
 * NOTE: JavaScript alternation takes the FIRST match, not the longest. No key
 * below is a prefix of another, so the order within each pattern is safe —
 * re-check that before adding any rule.
 */
const P5_RE = /ءا|يء/g;
const P5: Record<string, string> = { "ءا": "ء", "يء": "ئ" };
const P6_AYA_RE = /ائ/g; // the aya index only
const P7_RE =
    /سماعيل|سماوات|اولائك|براهام|رحمان|اسحاق|هاذين|مائه|مائت|هاذا|ئو|ءو/g;
const P7: Record<string, string> = {
    "سماعيل": "سمعيل",
    "سماوات": "سموات",
    "اولائك": "اولئك",
    "براهام": "براهيم",
    "رحمان": "رحمن",
    "اسحاق": "اسحق",
    "هاذين": "هذين",
    "مائه": "مئه",
    "مائت": "مئت",
    "هاذا": "هذا",
    "ئو": "وو",
    "ءو": "وو",
};
const P8_RE = /داوود|طاووس|ئ/g;
const P8: Record<string, string> = {
    "داوود": "داود",
    "طاووس": "طاوس",
    "ئ": "ي",
};
const P9_RE = /سفرايين/g;

/** Character folding: drop marks, then map orthographic variants one-for-one. */
function foldChars(input: string): string {
    return input
        .normalize("NFC")
        .replace(DIACRITICS_RE, "")
        .replace(/[آأإٱ]/g, "ا") // آأإٱ → ا
        .replace(/ى/g, "ي") // ى → ي
        .replace(/ة/g, "ه") // ة → ه
        .replace(/ؤ/g, "و") // ؤ → و
        .replace(/گ/g, "ك") // Persian gaf, in Shamela's basic map
        .replace(/پ/g, "ب")
        .replace(/چ/g, "ج");
    // NOT folded, deliberately: ک (U+06A9) and ی (U+06CC) — Shamela's tables
    // leave them alone, and the index does hold terms containing ک.
}

function runPasses(s: string, aya: boolean): string {
    s = s.replace(P5_RE, (m) => P5[m]!);
    if (aya) s = s.replace(P6_AYA_RE, "اا");
    s = s.replace(P7_RE, (m) => P7[m]!);
    s = s.replace(P8_RE, (m) => P8[m]!);
    return s.replace(P9_RE, "سفراين");
}

/**
 * Normalize an Arabic string the way Shamela built its page/title index.
 *
 * A standalone «ء» is KEPT: the live index holds 15,205 terms containing it
 * («الوضوء», «جزء», «الفقهاء»), so stripping it silently zeroes those searches.
 * Only the pairs «ءا» and «يء» are rewritten. The Persian «ک» (U+06A9) is
 * likewise left alone — Shamela indexes it verbatim.
 */
export function normalizeArabic(input: string): string {
    if (!input) return "";
    return runPasses(foldChars(input), false);
}

/**
 * Same, for Shamela's `aya` index, which adds one rule the page index lacks:
 * «ائ» → «اا» (so «خائفين» is stored as «خاافين»). Using the page table for
 * Quran searches silently returns zero for any word containing «ائ».
 */
export function normalizeArabicAya(input: string): string {
    if (!input) return "";
    return runPasses(foldChars(input), true);
}

/**
 * Words in a query whose hamza the index DISSOLVES, merging them with a
 * different word.
 *
 * «يء» → «ئ» → «ي» loses a letter, so «بريء» and «بريّ» are one term in
 * Shamela's index and «شيء» and «شي» are another. Measured: a search for
 * «بريء» reports 9,714 hits and returns «الهِنْدباء: نبات بري معمّر» among
 * them — a page where «بريء» does not occur at all.
 *
 * This is NOT ours to correct. `normalizeArabic` mirrors the analyzer Shamela
 * built its indexes with, and the fold happens on THEIR side: the term in the
 * index is «بري». Keeping the hamza in our query would ask for a term that
 * does not exist there and return a clean, confident zero for a load-bearing
 * fiqh word — the precise failure decisions.md §4 records twice already.
 *
 * What is ours is to stop presenting a contaminated count as an exact one. The
 * caller surfaces this so the reader can reach for shamela_search_exact, which
 * re-reads the raw page text and does separate them.
 *
 * Only «يء» is reported. «ئ» → «ي» inside a word («المسائل» → «المسايل») keeps
 * a letter in place and lands on a form that is not itself a word, so it
 * merges nothing.
 */
export function hamzaCollisionWords(query: string): string[] {
    if (!query) return [];
    const out: string[] = [];
    for (const word of query.split(/[\s،,؛;.:!؟?()«»"']+/)) {
        if (word && word.includes("يء") && !out.includes(word)) out.push(word);
    }
    return out;
}

/** Strip inline HTML tags (e.g. <span data-type='title'>) before tokenizing. */
function stripHtml(s: string): string {
    return s.replace(/<[^>]*>/g, " ");
}

/**
 * Arabic punctuation, which sits INSIDE the Arabic Unicode block and therefore
 * inside a naive «Arabic run» regex.
 *
 * The comma U+060C, semicolon U+061B, triple dot U+061E, question mark U+061F,
 * the star U+066D and the full stop U+06D4. Left in, a comma glued to a word
 * — «حكم،» — rides along as part of the token, and a token carrying it exists
 * in no Lucene index and equals no page word: Shamela's tokenizer splits on
 * punctuation, so the index holds «حكم» alone. Measured: a quotation lifted
 * verbatim from a fixture page flipped from «verbatim» to a confident
 * «not_found» on the strength of one editor's comma.
 *
 * Replaced with a space, never deleted: each mark is one character, so every
 * offset into the original string survives, which quoteWords relies on.
 *
 * The numeric separators U+066B/U+066C are deliberately NOT here — dropping
 * them would fuse «٣٫٥» into «٣٥», a different number.
 */
export const ARABIC_PUNCT_RE = /[،؛؞؟٭۔]/g;

/**
 * Tokenize Arabic text into normalized tokens (runs of Arabic letters).
 * Applies the same "ابن" → "بن" rule the helper uses so phrase matching lines up.
 */
export function tokenizeArabic(input: string): string[] {
    const normalized = normalizeArabic(stripHtml(input).replace(ARABIC_PUNCT_RE, " "));
    const matches = normalized.match(/[؀-ۿ]+/g);
    if (!matches) return [];
    return matches.map((t) => (t === "ابن" ? "بن" : t)); // ابن → بن
}

/** True if `needle` token sequence appears contiguously inside `hay` tokens. */
export function containsPhrase(hay: string[], needle: string[]): boolean {
    if (needle.length === 0 || needle.length > hay.length) return false;
    for (let i = 0; i + needle.length <= hay.length; i++) {
        let ok = true;
        for (let j = 0; j < needle.length; j++) {
            if (hay[i + j] !== needle[j]) {
                ok = false;
                break;
            }
        }
        if (ok) return true;
    }
    return false;
}

/**
 * True if every needed token occurs within a window of `distance` tokens
 * (unordered). Minimum-window-cover over the positions of the needed tokens.
 */
export function withinProximity(hay: string[], needed: string[], distance: number): boolean {
    const need = new Set(needed);
    if (need.size === 0) return false;
    const events: Array<[number, string]> = [];
    hay.forEach((t, pos) => {
        if (need.has(t)) events.push([pos, t]);
    });
    if (events.length < need.size) return false;
    const count = new Map<string, number>();
    let have = 0;
    let left = 0;
    for (let right = 0; right < events.length; right++) {
        const t = events[right]![1];
        count.set(t, (count.get(t) ?? 0) + 1);
        if (count.get(t) === 1) have++;
        while (have === need.size) {
            const span = events[right]![0] - events[left]![0];
            if (span <= distance) return true;
            const lt = events[left]![1];
            count.set(lt, count.get(lt)! - 1);
            if (count.get(lt) === 0) have--;
            left++;
        }
    }
    return false;
}

const PROCLITICS = ["", "و", "ف", "ب", "ك", "ل"]; // "", و, ف, ب, ك, ل

/**
 * Expand a single normalized token into surface variants that differ only by a
 * leading proclitic / definite article — so a Quran search for "الصبر" also
 * matches the indexed token "بالصبر". The Quran Lucene index stores whole
 * words, so this is the cheapest way to get prefix-insensitive matching without
 * re-indexing.
 */
export function expandPrefixVariants(token: string): string[] {
    // Its only caller is the Quran search, which queries the `aya` index.
    const t = normalizeArabicAya(token);
    if (t.length < 2) return [t];
    const core = t.startsWith("ال") ? t.slice(2) : t; // strip leading ال
    const withAl = t.startsWith("ال") ? t : "ال" + t;
    const bases = Array.from(new Set([t, withAl, core]));
    const out = new Set<string>();
    for (const b of bases) {
        for (const p of PROCLITICS) {
            // ل + ال contracts to لل in Arabic orthography — the raw
            // concatenation (e.g. «لالصبر») never occurs in written text.
            if (p === "ل" && b.startsWith("ال")) continue;
            out.add(p + b);
        }
    }
    out.add("لل" + core); // لل + core (the contracted form)
    return Array.from(out).filter((s) => s.length >= 2);
}
