import type { Slice } from "../labels.js";

/** Wording for shamela_search_quran. Arabic first; English translates it. */
export const searchQuranLabels: Slice<{
    heading: (query: string) => string;
    hits: (total: string, returned: string) => string;
    lowerBound: string;
    noResults: string;
    ayaHeading: (surahName: string, surah: string, aya: string) => string;
    more: (offset: string) => string;
    /**
     * Zero-result advice, also carried in `suggestions` for a caller to show.
     * The index holds whole surface forms, so a miss is usually the shape of
     * the query rather than the absence of the wording from the mushaf.
     */
    tryOneWord: (first: string, last: string) => string;
    /** `word` arrives already stripped of its «ال» by the caller. */
    tryWithoutAl: (word: string) => string;
    /** `word` arrives already carrying its «ال». */
    tryWithAl: (word: string) => string;
    tryAnotherForm: string;
    trySearchPages: string;
    normalizedAs: (tokens: string) => string;
    /** Between the normalised tokens listed by `normalizedAs`. */
    tokenSeparator: string;
}> = {
    ar: {
        heading: (query) => `نتائج البحث في القرآن: «${query}»`,
        hits: (total, returned) => `**${total}** آية موافقة، عرض ${returned}.`,
        lowerBound: "_العدد الإجمالي حدٌّ أدنى: تعذَّر استيفاء نتائج بعض صيغ الكلمة._",
        noResults: "**لا نتائج — جرّب:**",
        ayaHeading: (surahName, surah, aya) => `${surahName} ${surah}:${aya}`,
        more: (offset) => `*للمزيد، استخدم \`offset=${offset}\`.*`,
        tryOneWord: (first, last) =>
            `جرّب كلمة واحدة من العبارة («${first}» أو «${last}») — البحث في القرآن يطابق الكلمات لا العبارة المتصلة`,
        tryWithoutAl: (word) => `جرّبها بلا «ال» التعريف: «${word}»`,
        tryWithAl: (word) => `جرّبها بـ«ال» التعريف: «${word}»`,
        tryAnotherForm:
            "جرّب صيغة أخرى للكلمة (ماضيًا أو مضارعًا أو مصدرًا) — الفهرس يخزّن الكلمة بصورتها لا بجذرها",
        trySearchPages:
            "أو ابحث في كتب التفسير بدل نصّ المصحف عبر shamela_search_pages، فقد تكون العبارة تفسيرًا لا تلاوةً",
        normalizedAs: (tokens) => `صيغة البحث بعد التطبيع: ${tokens}`,
        tokenSeparator: "، ",
    },
    en: {
        heading: (query) => `Qur'an search results: "${query}"`,
        hits: (total, returned) =>
            `**${total}** ${plural(total, "aya (verse) matches", "ayat (verses) match")}, showing ${returned}.`,
        lowerBound: "_The total is a lower bound: results for some word forms could not be retrieved in full._",
        noResults: "**No results — try:**",
        ayaHeading: (surahName, surah, aya) => `${surahName} ${surah}:${aya}`,
        more: (offset) => `*For more, use \`offset=${offset}\`.*`,
        tryOneWord: (first, last) =>
            `Try a single word from the phrase ("${first}" or "${last}") — Qur'an search matches words, not a running phrase`,
        // i18n:arabic-intentional — the advice names the Arabic article itself.
        // "Without the definite article" alone would not say which one.
        tryWithoutAl: (word) => `Try it without the definite article ال: "${word}"`,
        // i18n:arabic-intentional — same reason.
        tryWithAl: (word) => `Try it with the definite article ال: "${word}"`,
        tryAnotherForm:
            "Try another form of the word (perfect, imperfect, or verbal noun) — the index stores the word as written, not its root",
        trySearchPages:
            "Or search the tafsir works rather than the mushaf text, with shamela_search_pages: the wording may be commentary and not recitation",
        normalizedAs: (tokens) => `The search after normalisation: ${tokens}`,
        tokenSeparator: ", ",
    },
};

/** English agrees the noun with the count; the Arabic counted noun does not move. */
function plural(count: string, one: string, many: string): string {
    return count === "1" ? one : many;
}
