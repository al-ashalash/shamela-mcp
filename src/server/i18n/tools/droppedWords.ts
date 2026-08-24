import { pick, type Slice } from "../labels.js";

/**
 * The sentence every search owes a reader whose query was longer than the
 * engine takes.
 *
 * Shamela's search panel is five words wide, and this engine is the one the
 * program ships, so five words is the width of the question that can be asked.
 * What was wrong was not the cap but the silence: the overflow used to be glued
 * onto the fifth word, producing a term with a space in it that no index can
 * hold, so a six-word search returned a confident zero with nothing to say for
 * itself. Now the overflow is dropped — which searches for LESS and can only
 * return too much — and this line names the words that were left out, because a
 * result set that is wider than the question is only honest if the reader knows
 * the question was narrowed.
 *
 * It lives here rather than in each tool's slice because eleven tools owe it,
 * and a reader who learns what it means in one has learned it in all of them.
 */
export const droppedWordsLabels: Slice<{
    note: (words: string[], kept: string) => string;
}> = {
    ar: {
        note: (words, kept) =>
            `تنبيه: محرّك الشاملة يقبل خمس كلمات في البحث الواحد، فبُحث عن أول ${kept} منها وأُسقط ${words.map((w) => `«${w}»`).join(" و")}. فالنتائج أوسعُ مما طلبتَ لا أضيق — والتضييق بأدلّ خمس كلماتٍ في العبارة، أو بـ shamela_search_phrase إن كان المراد تتابعها.`,
    },
    en: {
        note: (words, kept) =>
            `Note: Shamela's engine takes five words per search, so the first ${kept} were used and ${words.map((w) => `"${w}"`).join(" and ")} dropped. The results are therefore wider than what you asked for, not narrower — narrow it yourself by choosing the five most distinctive words, or use shamela_search_phrase if the words must be consecutive.`,
    },
};

/**
 * The line for a raw envelope, or null when the engine took the whole query.
 *
 * Reads the engine's own report rather than re-counting the words here: the
 * splitting and the cap are the engine's, and a second implementation of them
 * in Node would drift from it silently.
 */
export function droppedNote(raw: { dropped_tokens?: string[]; normalized_tokens?: string[] }): string | null {
    const dropped = raw.dropped_tokens ?? [];
    if (!dropped.length) return null;
    return pick(droppedWordsLabels).note(dropped, String(raw.normalized_tokens?.length ?? 5));
}
