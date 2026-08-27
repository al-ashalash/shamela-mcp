import type { Slice } from "../labels.js";

/** Wording for shamela_search_exact. Arabic first; English translates it. */
export const searchExactLabels: Slice<{
    /** The distinctions the search enforced, named in the heading. */
    diacritics: string;
    hamza: string;
    digits: string;
    /** Between the enforced distinctions. */
    joinFeatures: (parts: string[]) => string;
    /**
     * The candidate stage lost words to the engine's five-word cap. NOT the
     * shared dropped-words sentence: exactness re-verifies the whole text, so
     * the results here stay exact and only the pool they were read from
     * narrowed — the opposite direction of every other search.
     */
    candidatesTrimmed: (words: string[]) => string;
    heading: (features: string, query: string) => string;
    summary: (returned: string, scanned: string) => string;
    capNote: string;
    printedPage: (page: string) => string;
    bookDate: (year: string) => string;
    /** Prefix on a snippet whose only match was in the footnote. */
    footLabel: string;
    /** Said under a hit whose book file is missing (issue #47). Word for word
     *  the sentence search_pages uses: one library state, one answer. */
    unreadableHit: string;
}> = {
    ar: {
        diacritics: "التشكيل",
        hamza: "الهمزات",
        digits: "نظام الأرقام",
        joinFeatures: (parts) => parts.join(" و"),
        candidatesTrimmed: (words) =>
            `تنبيه: مرحلة الترشيح تقبل خمس كلمات، فرُشِّحت الصفحات بدون ${words.map((w) => `«${w}»`).join(" و")} — والفحص الحرفي طُبِّق على نصّك كاملًا، فما ظهر مطابقٌ له كلِّه. غير أن قلة المرشَّحين قد تُنقص النتائج لا تزيدها؛ فإن ظننت نقصًا فضيِّق بـ scope.`,
        heading: (features, query) => `بحث مطابق تمامًا (مع مراعاة ${features}): «${query}»`,
        summary: (returned, scanned) =>
            `**${returned}** صفحة مطابقة بالضبط (من ${scanned} صفحة مرشَّحة فُحصت).`,
        capNote:
            "*ملاحظة: عدد الصفحات المرشَّحة تجاوز سقف الفحص؛ ضيِّق النطاق (scope) لتغطية أشمل. (النتائج الظاهرة مؤكَّدة، لكن قد تفوت مطابقاتٌ خارج النافذة.)*",
        printedPage: (page) => ` (ص ${page})`,
        bookDate: (year) => ` — ${year}هـ`,
        footLabel: "_حاشية_: ",
        unreadableHit: "⚠️ ملف الكتاب غير موجود على القرص — لن تنجح قراءته",
    },
    en: {
        diacritics: "diacritics",
        hamza: "hamza forms",
        digits: "digit systems",
        joinFeatures: (parts) => listAnd(parts),
        candidatesTrimmed: (words) =>
            `Note: the candidate stage takes five words, so pages were shortlisted without ${words.map((w) => `"${w}"`).join(" and ")} — the letter-exact check was then applied to your FULL text, so every hit matches all of it. A thinner shortlist can only miss results, never add them; if something seems absent, narrow with scope.`,
        heading: (features, query) => `Exact search (preserving ${features}): "${query}"`,
        summary: (returned, scanned) =>
            `**${returned}** ${plural(returned, "page matches", "pages match")} exactly (out of ${scanned} candidate ${plural(scanned, "page", "pages")} examined).`,
        capNote:
            "*Note: the candidate page count exceeded the examination cap; narrow the `scope` for fuller coverage. (The results shown are confirmed, but matches outside that window may have been missed.)*",
        printedPage: (page) => ` (p. ${page})`,
        bookDate: (year) => ` — ${year} AH`,
        footLabel: "_hashiya_ (footnote): ",
        unreadableHit: "⚠️ the book's file is not on disk — reading it will fail",
    },
};

/** "a", "a and b", "a, b and c" — Arabic strings them with و, English needs the comma. */
function listAnd(parts: string[]): string {
    if (parts.length <= 1) return parts[0] ?? "";
    return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** English agrees the noun with the count; the Arabic counted noun does not move. */
function plural(count: string, one: string, many: string): string {
    return count === "1" ? one : many;
}
