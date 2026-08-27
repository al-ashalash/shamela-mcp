import type { Slice } from "../labels.js";

/** Wording for shamela_root_stats. Arabic first; English translates it. */
export const rootStatsLabels: Slice<{
    heading: (root: string) => string;
    summary: (hits: string, counted: string, books: string) => string;
    scope: (books: string) => string;
    cappedNote: (cap: string) => string;
    byCategory: string;
    byCentury: string;
    /** English names a century with an ordinal ("7th century AH"); Arabic with the bare numeral. */
    centuryLine: (century: string, count: string) => string;
    /**
     * The reader's name for the bucket of books with no date. `by_century[].name`
     * keeps UNDATED_CENTURY_LABEL for callers reading the structured output; only
     * the rendered line is translated, so the Arabic here must stay identical to
     * that constant.
     */
    undatedCentury: string;
    topBooks: string;
    /** Appended to a book's line when its record carries a composition year. */
    bookDate: (year: string) => string;
    topAuthors: string;
    /**
     * The two readings of `accuracy_note` — one for a distribution counted over
     * every match, one for a capped sample. `coverage_basis` is what a caller
     * branches on; these only say which happened to a reader.
     */
    accuracyNoteFull: string;
    accuracyNoteSample: string;
}> = {
    ar: {
        heading: (root) => `انتشار الجذر «${root}» في المكتبة المنزَّلة`,
        // Not «${counted} من ${books} كتابًا»: عددٌ يتبعه «من» يُقرأ نسبةً، وهذان
        // عددان من جنسين — صفحاتٌ احتُسبت، وكتبٌ وقعت فيها — فالنسبة التي يقولها
        // غير صحيحة أصلًا، وبسطها في العادة أكبر من مقامها («٢٤١٩ من ٣٨٢»).
        // الإنجليزية تفصل الجملتين بـ across، وهذا نظيرها.
        summary: (hits, counted, books) =>
            `**${hits}** صفحة موافقة (بحث صرفي)، احتُسب منها في التوزيع ${counted} صفحة، موزَّعةً على ${books} كتابًا.`,
        scope: (books) => `النطاق: ${books} كتاب.`,
        cappedNote: (cap) =>
            `> تنبيه: التوزيع عيّنة من أعلى ${cap} نتيجة (تجاوز الإجمالي الحدّ)، فالأعداد أدناه حدٌّ أدنى ونِسَبها تقريبية.`,
        byCategory: "حسب التصنيف",
        byCentury: "حسب القرن الهجري",
        centuryLine: (century, count) => `- القرن ${century}: ${count}`,
        undatedCentury: "غير مؤرَّخ",
        topBooks: "أكثر الكتب",
        bookDate: (year) => ` (${year}هـ)`,
        topAuthors: "أكثر المؤلفين",
        accuracyNoteFull:
            "المطابقة صرفية عبر محلّل الخليل (يشمل المشتقات)، ودقته على العربية التراثية نحو ٠٫٨٠؛ فاعدد الأعداد مؤشِّرًا على انتشار الجذر لا إحصاءً لفظيًّا دقيقًا. وإجمالي الصفحات (total_hits) دقيق، والتوزيع محسوب على كل الصفحات الموافقة لا على عيّنة منها.",
        accuracyNoteSample:
            "المطابقة صرفية عبر محلّل الخليل (يشمل المشتقات)، ودقته على العربية التراثية نحو ٠٫٨٠؛ فاعدد الأعداد مؤشِّرًا على انتشار الجذر لا إحصاءً لفظيًّا دقيقًا. وإجمالي الصفحات (total_hits) دقيق، أمّا التوزيع فتعذَّر حصره على كل النتائج فبُني من أعلى ٥٠٠٠ نتيجة (coverage_capped).",
    },
    en: {
        heading: (root) => `Spread of the root "${root}" across the downloaded library`,
        summary: (hits, counted, books) =>
            `**${hits}** matching ${plural(hits, "page", "pages")} (morphological search), of which ${counted} ${plural(counted, "was", "were")} counted in the distribution, across ${books} ${plural(books, "book", "books")}.`,
        scope: (books) => `Scope: ${books} ${plural(books, "book", "books")}.`,
        cappedNote: (cap) =>
            `> Note: the distribution is a sample of the top ${cap} results (the total exceeded the cap), so the counts below are floors and their shares approximate.`,
        byCategory: "By category",
        byCentury: "By Hijri century",
        centuryLine: (century, count) => `- ${ordinal(century)} century AH: ${count}`,
        undatedCentury: "Undated",
        topBooks: "Top books",
        bookDate: (year) => ` (${year} AH)`,
        topAuthors: "Top authors",
        accuracyNoteFull:
            "Matching is morphological, through the AlKhalil analyzer (derived forms included), and its accuracy on classical Arabic is about 0.80; read the counts as an indication of how far the root reaches, not as an exact lexical tally. The page total (total_hits) is exact, and the distribution is counted over every matching page, not over a sample of them.",
        accuracyNoteSample:
            "Matching is morphological, through the AlKhalil analyzer (derived forms included), and its accuracy on classical Arabic is about 0.80; read the counts as an indication of how far the root reaches, not as an exact lexical tally. The page total (total_hits) is exact, but the distribution could not be counted over every result, so it was built from the top 5000 results (coverage_capped).",
    },
};

/** English agrees the noun (and its verb) with the count; the Arabic counted noun does not move. */
function plural(count: string, one: string, many: string): string {
    return count === "1" ? one : many;
}

/** 1 → "1st", 4 → "4th": English names a century with an ordinal, Arabic does not. */
function ordinal(century: string): string {
    const n = Number(century);
    if (!Number.isInteger(n)) return century;
    const teens = n % 100;
    if (teens >= 11 && teens <= 13) return `${n}th`;
    switch (n % 10) {
        case 1:
            return `${n}st`;
        case 2:
            return `${n}nd`;
        case 3:
            return `${n}rd`;
        default:
            return `${n}th`;
    }
}
