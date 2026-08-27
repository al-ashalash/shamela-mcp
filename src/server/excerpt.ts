/**
 * The window around a phrase inside a page, instead of the page.
 *
 * A researcher who already knows the wording wants to see it in its sentence,
 * not to page through a long body hunting for it. Without this the only way in
 * was `body_part`, which walks fixed slices of the page and may put the phrase
 * at the seam between two of them — the reader then reads both parts to
 * reassemble a sentence the tool could have handed over whole.
 *
 * Matching is normalised, so a phrase typed without diacritics finds the
 * vocalised text — but the OFFSETS stay in the original string, because that
 * is what gets returned and quoted. Same discipline as ayaIndex/slice.ts: a
 * line-by-line normalised comparison, never a normalised haystack whose
 * indices no longer address the text the reader will see.
 */

import { normalizeArabic } from "./arabic.js";

export interface Excerpt {
    /** The window, cut on word boundaries where possible. */
    text: string;
    /** Offset in the ORIGINAL body where the window starts. */
    start: number;
    /** True when text was dropped before / after the window. */
    truncated_before: boolean;
    truncated_after: boolean;
}

/** Normalised, whitespace-free — the same key shape the verse slicer uses. */
function key(s: string): string {
    return normalizeArabic(s).replace(/\s+/g, "");
}

/**
 * Where `phrase` sits in `body`, as an offset into `body` itself.
 *
 * Walks the original string one character at a time, keeping a parallel count
 * of how many normalised characters have been emitted, so a match found in
 * normalised space can be mapped back to a real offset. Returns null when the
 * phrase is not there — never an approximate position, because an approximate
 * excerpt is a misquotation waiting to happen.
 */
export function findPhraseOffset(body: string, phrase: string): number | null {
    const needle = key(phrase);
    if (!body || needle.length < 2) return null;

    // Normalisation is NOT per-character: «يء» becomes «ئ» and then «ي», a rule
    // spanning two characters, so normalising one character at a time and
    // concatenating gives a different string than normalising the whole. An
    // earlier draft did exactly that and missed real phrases — the same trap
    // ayaIndex/slice.ts documents.
    //
    // So the scan walks the ORIGINAL string and normalises a bounded slice at
    // each candidate position. Two things keep it both correct and cheap:
    //
    //  - Only WORD STARTS are tried. The phrase a reader types begins with a
    //    word, so a match must too — which prunes the scan to roughly the word
    //    count, and fixes a subtler bug: because `key` drops whitespace, the
    //    space BEFORE a phrase also produced a key starting with the needle,
    //    so the offset came back one character early and the excerpt opened
    //    with a stray space.
    //  - Lines are NOT the unit. An earlier draft narrowed to the line holding
    //    the needle, which silently missed every phrase spanning a line break —
    //    and Shamela's page bodies break lines mid-sentence constantly.
    //
    // The window is generous because normalisation only ever shrinks: every
    // replacement in the table is no longer than its key.
    const window = needle.length * 3 + 16;
    for (let i = 0; i < body.length; i++) {
        if (/\s/.test(body[i]!)) continue;
        if (i > 0 && !/\s/.test(body[i - 1]!)) continue; // mid-word
        if (key(body.slice(i, i + window)).startsWith(needle)) return i;
    }
    return null;
}

/**
 * Cut `radius` characters either side of the phrase, snapped outward to
 * whitespace so the excerpt does not open or close mid-word.
 */
export function excerptAround(body: string, phrase: string, radius: number): Excerpt | null {
    const at = findPhraseOffset(body, phrase);
    if (at === null) return null;

    let start = Math.max(0, at - radius);
    let end = Math.min(body.length, at + phrase.length + radius);
    // Snap to word boundaries — a window that begins «...لصلاة» reads as a
    // different word than the one on the page.
    while (start > 0 && !/\s/.test(body[start - 1]!)) start--;
    while (end < body.length && !/\s/.test(body[end]!)) end++;

    return {
        text: body.slice(start, end).trim(),
        start,
        truncated_before: start > 0,
        truncated_after: end < body.length,
    };
}
