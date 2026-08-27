/**
 * Reaching an Arabic name through its Latin spelling.
 *
 * Every index in this extension is Arabic. A reader who knows the book as
 * «Mughni» or the author as «Ibn Qudama» — and there are many, including
 * anyone reading a Western bibliography — types that, gets a clean zero, and
 * has no way to tell whether the book is absent or the alphabet is.
 *
 * There is no transliteration table to import and nothing to download: the
 * names are already in master.db. What is missing is a comparison that both
 * spellings survive. So both sides are reduced to a sequence of CONSONANT
 * CLASSES and aligned:
 *
 *   المغني  → m g n y        Mughni → m g n
 *   قدامة   → k z ' m h      Qudama → k z m
 *
 * The reduction is deliberately lossy in exactly the places transliteration is
 * unreliable, and nowhere else:
 *
 *   - short vowels are not written in Arabic at all, so Latin vowels go
 *   - ا ء ع, the alif/hamza/ayn family, are dropped or apostrophised at every
 *     writer's discretion («Ma'ad», «Maad», «Maʿād») → one weak class, skippable
 *   - و and ي are long vowels as often as consonants («Nawawi» keeps both w's
 *     and loses the final ي) → weak, skippable
 *   - emphatics lose their dots in ordinary typing: ت ط, س ص, د ض ظ ذ ز → merged
 *   - ة is «a», «ah» or «at» depending on where it stands → all three
 *   - ال is written, hyphenated, assimilated, or left off → both forms indexed
 *
 * What it does NOT do is guess. A class char in the Arabic name that the query
 * has no letter for is a mismatch, not a skip: «الطبري» does not answer
 * «Tabrizi». The alignment consumes both strings whole.
 *
 * Nothing here reaches the Lucene index or the JVM — it is a comparison
 * between two strings we already hold.
 */

/**
 * Classes a letter can carry. One char each, so a key is a plain string and
 * alignment is character work.
 *
 *   '  ا آ أ إ ٱ ى ء ؤ ئ ع     — alif, hamza, ayn: the class writers drop
 *   h  ه ة ح                   — every letter romanised «h»
 *   w  و        y  ي           — consonant or long vowel, never predictable
 *   t  ت ث ط    z  د ذ ض ظ ز   — emphatics and their undotted spellings
 *   s  س ش ص    k  ق ك         — «sh»/«s», «q»/«k»
 */
const AR_CLASS: Record<string, string> = {
    "ا": "'", "آ": "'", "أ": "'", "إ": "'", "ٱ": "'", "ى": "'",
    "ء": "'", "ؤ": "'", "ئ": "'", "ع": "'",
    "ه": "h", "ة": "h", "ح": "h",
    "و": "w",
    "ي": "y", "ی": "y",
    "ب": "b", "پ": "b",
    "ت": "t", "ث": "t", "ط": "t",
    "ج": "j", "چ": "j",
    "خ": "x",
    "د": "z", "ذ": "z", "ض": "z", "ظ": "z", "ز": "z",
    "ر": "r",
    "س": "s", "ش": "s", "ص": "s",
    "غ": "g",
    "ف": "f",
    "ق": "k", "ك": "k", "ک": "k", "گ": "k",
    "ل": "l",
    "م": "m",
    "ن": "n",
};

/**
 * Classes an aligner may skip in the name without the query naming them.
 *
 * Not «unimportant»: unwritten. A romanisation that keeps them and one that
 * drops them are both correct, so neither may be required. Every other class
 * must be matched by an identical class in the query — that is the whole
 * precision guard.
 */
const WEAK = new Set(["'", "w", "y"]);

/** Bit index per class char, for the subset prefilter. */
const CLASS_CHARS = "'hwybtjxzrsgfklmn";

/**
 * Vowels are not dropped — they are demoted.
 *
 * Dropping them outright is what a first version does, and it costs the whole
 * ranking: «Shafii» and «Sifa» both reduce to «s·f», so «صفة الجنة» came back
 * above «الشافعي», and «Qudama» reduced to «k·z·m» matched «أكاديمية» as
 * squarely as it matched «قدامة». A Latin vowel is unreliable evidence about
 * WHICH Arabic letter stands there; it is excellent evidence that SOMETHING
 * does. So each becomes the weak class it would most likely have been written
 * with — skippable, so it can never refuse a match, but counted when the
 * alignment is scored, which is where the two readings finally part.
 */
const LATIN_SINGLE: Record<string, string> = {
    a: "'", "'": "'", "ʿ": "'", "ʾ": "'", "’": "'", "‘": "'", "`": "'", "´": "'",
    i: "y", e: "y",
    u: "w", o: "w",
    b: "b", p: "b",
    t: "t",
    j: "j",
    h: "h",
    x: "x",
    d: "z", z: "z", "ð": "z",
    r: "r",
    s: "s", c: "k",
    g: "g",
    f: "f",
    k: "k", q: "k",
    l: "l",
    m: "m",
    n: "n",
    w: "w", v: "w",
    y: "y",
};

/**
 * Two-letter spellings, and what else they could have been.
 *
 * «sh» is ش — except in «Ishaq», where it is س followed by ح. «th» is ث —
 * except where it is ت followed by ه. Rather than pick, the query branches:
 * both readings are tried, and a name only has to answer one. The name side
 * never branches on this, so the cost is bounded by the length of what was
 * typed.
 */
const LATIN_DIGRAPH: Record<string, { joint: string; split: boolean }> = {
    kh: { joint: "x", split: true },
    gh: { joint: "g", split: false },
    sh: { joint: "s", split: true },
    ch: { joint: "s", split: true },
    th: { joint: "t", split: true },
    dh: { joint: "z", split: true },
    ph: { joint: "f", split: false },
    ck: { joint: "k", split: false },
    dj: { joint: "j", split: false },
};

/** Branching is per token and per ambiguous digraph; this bounds the product. */
const MAX_VARIANTS = 12;

/**
 * Words that are grammar, not name: the article in every spelling it takes
 * («al-», «ar-Rahman», «ash-Shafii»), and the English glue a citation carries.
 * Left in, they would demand a matching word in the Arabic title, which the
 * article never is — it is glued to the noun.
 */
const LATIN_STOPWORDS = new Set([
    "al", "el", "ul", "ad", "ar", "as", "at", "an", "az", "ash", "ath", "adh",
    "the", "of", "and", "in", "on", "by", "fi", "li", "wa",
]);

/** Fold accents and dots: ṭ→t, ḥ→h, š→s, ġ→g, ā→a — ordinary typing loses them anyway. */
function foldLatin(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** True when the string carries an Arabic letter. */
export function hasArabic(s: string): boolean {
    return /[ؠ-يٮ-ۓ]/.test(s);
}

/**
 * A query written in Latin letters — the case this whole file exists for.
 *
 * Mixed input is NOT Latin: if any Arabic is present the Arabic indexes can
 * answer it directly, and they answer it better.
 */
export function isLatinQuery(s: string): boolean {
    return /[a-z]/i.test(foldLatin(s)) && !hasArabic(s);
}

/** Class key of one Arabic word, letters only, unknown characters ignored. */
function arabicKey(token: string): string {
    let out = "";
    for (const ch of token) {
        const c = AR_CLASS[ch];
        if (c) out += c;
    }
    return out;
}

/**
 * Letters Arabic writes joined to the next word, which a Latin citation drops:
 * «المغني لابن قدامة» is cited as «Ibn Qudama, al-Mughni». Without these the
 * catalogue's own preferred title form is unreachable from the usual citation.
 */
const PROCLITICS = ["ل", "و", "ب", "ف"];

/** The word, less its article, less a proclitic, less both. */
function articleAndProcliticForms(bare: string): Set<string> {
    const forms = new Set<string>([bare]);
    const stripArticle = (w: string) => {
        if (w.startsWith("ال") && w.length > 3) forms.add(w.slice(2));
    };
    stripArticle(bare);
    if (bare.startsWith("لل") && bare.length > 4) forms.add(bare.slice(2));
    else if (PROCLITICS.includes(bare[0]!) && bare.length > 3) {
        const rest = bare.slice(1);
        forms.add(rest);
        stripArticle(rest);
    }
    return forms;
}

/**
 * Every key one Arabic word may legitimately be spelled as.
 *
 * All of it written variation, none of it guesswork: the article present or
 * absent, a proclitic letter present or absent, and a final ta marbuta read
 * as «-ah», as «-at» (the construct state, «Bidayat al-mujtahid»), or as the
 * bare «-a» most writers use.
 */
export function arabicKeys(token: string): string[] {
    const bare = token.replace(/[ً-ٰٟـ]/g, "");
    if (!bare) return [];
    const forms = articleAndProcliticForms(bare);
    const out = new Set<string>();
    for (const form of forms) {
        const key = arabicKey(form);
        if (key.length < 2) continue;
        out.add(key);
        if (form.endsWith("ة")) {
            out.add(key.slice(0, -1) + "t");
            if (key.length > 2) out.add(key.slice(0, -1));
        } else if (form.endsWith("ه") && key.length > 2) {
            out.add(key.slice(0, -1));
        }
    }
    return Array.from(out);
}

/** Every key one Latin word may have been a spelling of. */
export function latinKeys(token: string): string[] {
    const s = foldLatin(token).replace(/[^a-z'ʿʾ’‘`´]/g, "");
    if (!s) return [];
    let variants: string[] = [""];
    for (let i = 0; i < s.length; ) {
        const two = s.slice(i, i + 2);
        const digraph = two.length === 2 ? LATIN_DIGRAPH[two] : undefined;
        if (digraph) {
            const split = digraph.split ? (LATIN_SINGLE[s[i]!] ?? "") + (LATIN_SINGLE[s[i + 1]!] ?? "") : null;
            const next: string[] = [];
            for (const v of variants) {
                next.push(v + digraph.joint);
                if (split !== null && split !== digraph.joint) next.push(v + split);
            }
            variants = next.slice(0, MAX_VARIANTS);
            i += 2;
            continue;
        }
        const ch = s[i]!;
        i += 1;
        const c = LATIN_SINGLE[ch];
        if (!c) continue;
        variants = variants.map((v) => v + c);
    }
    return Array.from(new Set(variants.filter((v) => v.length >= 2)));
}

/** Bitmask of the classes present in a key. */
function charMask(key: string): number {
    let m = 0;
    for (const ch of key) {
        const i = CLASS_CHARS.indexOf(ch);
        if (i >= 0) m |= 1 << i;
    }
    return m;
}

/** Bitmask of the classes the query MUST supply — the skippable ones excluded. */
function strongMask(key: string): number {
    let m = 0;
    for (const ch of key) {
        if (WEAK.has(ch)) continue;
        const i = CLASS_CHARS.indexOf(ch);
        if (i >= 0) m |= 1 << i;
    }
    return m;
}

export interface Alignment {
    /** Class positions the two keys agreed on, letter for letter. */
    aligned: number;
    /** How many of those were a class no writer may drop. */
    strong: number;
    /**
     * Letters of the NAME the spelling never accounted for.
     *
     * Only the name's side is counted. The query's leftovers are the vowels
     * Arabic does not write and the doubled letters it writes with a shadda —
     * they are expected, and charging for them would refuse «Muqaddima» for
     * «المقدمة». What is not expected is Arabic letters nobody spelled.
     */
    skipped: number;
    /** The two keys were identical — the strongest evidence there is. */
    exact: boolean;
}

/**
 * Align a query key onto a name key, consuming both.
 *
 * Permitted, and only these:
 *   - a class in the name the query never wrote, if the class is weak
 *   - a class in the query the name never wrote, if the class is weak
 *   - a doubled class in the query — «Wahhab», «Muqaddima», «Taymiyya»:
 *     gemination is a shadda in Arabic, which is not a letter
 *
 * Everything else must match. Consuming both strings whole is what keeps
 * «Mughni» off «المغنيات»: the leftover ت is a class the query never named.
 */
export function alignKeys(q: string, n: string): Alignment | null {
    if (q.length < 2 || n.length < 2) return null;
    if ((strongMask(n) & ~charMask(q)) !== 0) return null;
    const W = n.length + 1;
    // Best score reachable at (i, j), or -1. Score ranks strong agreement
    // first, then total agreement, so the reported numbers describe the best
    // reading of an ambiguous pair rather than the first one found.
    const best = new Int32Array((q.length + 1) * W).fill(-1);
    best[0] = 0;
    for (let i = 0; i <= q.length; i++) {
        for (let j = 0; j <= n.length; j++) {
            const v = best[i * W + j]!;
            if (v < 0) continue;
            const put = (ii: number, jj: number, add: number) => {
                const k = ii * W + jj;
                if (best[k]! < v + add) best[k] = v + add;
            };
            if (i < q.length && j < n.length && q[i] === n[j]) {
                put(i + 1, j + 1, WEAK.has(n[j]!) ? 1 : 1024);
            }
            if (j < n.length && WEAK.has(n[j]!)) put(i, j + 1, 0);
            if (i < q.length && WEAK.has(q[i]!)) put(i + 1, j, 0);
            if (i > 0 && i < q.length && q[i] === q[i - 1]) put(i + 1, j, 0);
        }
    }
    const score = best[q.length * W + n.length]!;
    if (score < 0) return null;
    const strong = Math.floor(score / 1024);
    const aligned = strong + (score % 1024);
    const skipped = n.length - aligned;
    // Two agreements, one of them a class that had to be there. Below that the
    // "match" is an accident of two weak letters, and it would fire on
    // hundreds of names.
    if (strong < 1 || aligned < 2) return null;
    // And the name has to be more accounted for than not. This is the rule
    // that separates a reading from a coincidence: «Qudama» against «قدامة»
    // agrees on four of its four letters, where against «أكاديمية» it agrees
    // on k·z·m and leaves three letters that nothing in the query spelled.
    if (skipped >= aligned) return null;
    return { aligned, strong, skipped, exact: q === n };
}

/** Which of two readings of the same pair of words is the better one. */
function better(a: Alignment, b: Alignment | null): boolean {
    if (!b) return true;
    return (
        a.aligned > b.aligned ||
        (a.aligned === b.aligned &&
            (a.skipped < b.skipped ||
                (a.skipped === b.skipped &&
                    (a.strong > b.strong || (a.strong === b.strong && a.exact && !b.exact)))))
    );
}

/** Best alignment between any spelling of a query word and any of a name word. */
export function alignTokens(qKeys: string[], nKeys: string[]): Alignment | null {
    let best: Alignment | null = null;
    for (const q of qKeys) {
        for (const n of nKeys) {
            const a = alignKeys(q, n);
            if (a && better(a, best)) best = a;
        }
    }
    return best;
}

/** Consonant classes in a key — all a word can actually identify a name by. */
function strongCount(key: string): number {
    let n = 0;
    for (const ch of key) if (!WEAK.has(ch)) n++;
    return n;
}

/**
 * A word too thin to have named anything.
 *
 * «Ali» is one consonant once its vowels are demoted, and «Abu» is one: asked
 * of 8,598 titles they answer hundreds apiece, none of them because the reader
 * meant that book. Length can stand in for consonants where a name really is
 * built of weak letters — «Nawawi» is one ن and four vowel-letters, and it is
 * nobody else's name.
 */
function namesSomething(key: string): boolean {
    return strongCount(key) >= 2 || key.length >= 4;
}

/** Words of a Latin query, as key sets; grammar and thin fragments dropped. */
export function latinQueryTokens(query: string): string[][] {
    const out: string[][] = [];
    for (const word of foldLatin(query).split(/[^a-z'ʿʾ’‘`´]+/)) {
        if (!word || LATIN_STOPWORDS.has(word.replace(/['ʿʾ’‘`´]/g, ""))) continue;
        const keys = latinKeys(word).filter(namesSomething);
        if (keys.length) out.push(keys);
    }
    return out;
}

/** Words of an Arabic name, as key sets. Shamela's « - » edition suffix is cut. */
export function arabicNameTokens(name: string): string[][] {
    const base = name.split(" - ")[0]!;
    const out: string[][] = [];
    for (const word of base.split(/[^ؠ-يٮ-ۓٰـ]+/)) {
        if (!word) continue;
        const keys = arabicKeys(word);
        if (keys.length) out.push(keys);
    }
    return out;
}

export interface NameMatch {
    /** Query words that matched a name word letter for letter. */
    exact: number;
    /** Class agreements summed over the matched words — how much was actually shared. */
    aligned: number;
    /** Classes neither spelling accounted for, summed over those same words. */
    skipped: number;
    /** How many of the agreements were on a class no writer may drop. */
    strong: number;
    /** Sum of the matched words' positions in the name: earlier reads as more central. */
    span: number;
    /** Name words the query never named. */
    extra: number;
}

/**
 * Match every word of the query against a distinct word of the name.
 *
 * All of them, or nothing: a two-word query that only lands one word has not
 * identified anything — «Sahih Muslim» must not answer with «صحيح البخاري».
 * Name words the query never mentions are allowed (an author's name is long,
 * a title has an edition), but they are counted and they cost ranking.
 */
export function matchName(queryTokens: string[][], nameTokens: string[][]): NameMatch | null {
    if (!queryTokens.length || !nameTokens.length) return null;
    const used = new Array<boolean>(nameTokens.length).fill(false);
    let exact = 0;
    let aligned = 0;
    let skipped = 0;
    let strong = 0;
    let span = 0;
    for (const q of queryTokens) {
        let bestIdx = -1;
        let best: Alignment | null = null;
        for (let j = 0; j < nameTokens.length; j++) {
            if (used[j]) continue;
            const a = alignTokens(q, nameTokens[j]!);
            if (a && better(a, best)) {
                best = a;
                bestIdx = j;
            }
        }
        if (!best) return null;
        used[bestIdx] = true;
        if (best.exact) exact++;
        aligned += best.aligned;
        skipped += best.skipped;
        strong += best.strong;
        span += bestIdx;
    }
    return { exact, aligned, skipped, strong, span, extra: nameTokens.length - queryTokens.length };
}

/**
 * Order two matches, best first.
 *
 * Coverage leads: the name that accounts for more of what was typed.
 *
 * Then — before any finer reading of the letters — the name that says least
 * BESIDE what was asked for. This is what keeps «تطور الصحافة المصرية» off the
 * top of «Shafii»: undotted and unvowelled, «الصحافة» is as good a reading of
 * those letters as «الشافعي» is, and no comparison of letters will ever
 * separate them. What separates them is that one is the whole name and the
 * other is one word of a title about something else.
 *
 * Exactness comes last of the evidence, not first: it rewards the accident of
 * a name written without its alif («بن» over «ابن»), which says nothing about
 * whether this is the right man.
 */
export function compareMatches(a: NameMatch, b: NameMatch): number {
    return (
        b.aligned - a.aligned ||
        a.extra - b.extra ||
        a.skipped - b.skipped ||
        b.strong - a.strong ||
        b.exact - a.exact ||
        a.span - b.span
    );
}
