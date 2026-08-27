import type { Slice } from "../labels.js";

/** Wording for shamela_get_page. Arabic first; English translates it. */
export const getPageLabels: Slice<{
    /** Appended to the heading, in parentheses, when the print's page number is known. */
    printedPage: (page: string) => string;
    /** The chain of containing chapter titles. */
    path: string;
    matn: string;
    matnPart: (part: string, total: string) => string;
    /**
     * The advice that travels with a long body split across parts. Prose, so it
     * follows the reader's language even though it rides in structuredContent.
     * `nextPart` is a value the user types back, so it stays in Latin digits.
     *
     * `n` is the part count as a number: the Arabic counted noun changes shape
     * with it, and cannot be read back out of «١٢».
     */
    /** `nextPart` is null on the LAST part — there is nothing to fetch next. */
    longBody: (totalParts: string, part: string, nextPart: string | null, n: number) => string;
    hashiya: string;
    /** Said when `around_phrase` cut the body to a window around the phrase. */
    excerptFound: (phrase: string) => string;
    /** Said when the phrase was asked for and is not on this page. */
    excerptMissing: (phrase: string) => string;
    comment: string;
    citation: string;
    /** Shown when the page number is Shamela's own count, not the print's. */
    autoNumbered: string;
}> = {
    ar: {
        printedPage: (page) => `ص ${page}`,
        path: "المسار",
        matn: "المتن",
        matnPart: (part, total) => `المتن (جزء ${part}/${total})`,
        // الأجزاء اثنان فأكثر دائمًا (لا يُقسَّم النص إلا إذا زاد)، فلا حاجة إلى
        // صورة الواحد؛ لكن «أجزاء» جمعٌ لا يصح تمييزًا إلا من ٣ إلى ١٠، فالاثنان
        // مثنًّى وما فوق العشرة مفردٌ منصوب.
        longBody: (totalParts, part, nextPart, n) => {
            const count =
                n === 2 ? "جزأين" : n <= 10 ? `${totalParts} أجزاء` : `${totalParts} جزءًا`;
            const head = `النص طويل، قُسِّم إلى ${count} (هذا الجزء ${part}${nextPart === null ? " وهو الأخير" : ""}). اعرض المعروض كاملًا حرفيًّا أو اسأل المستخدم عن طريقة العرض`;
            return nextPart === null
                ? `${head}. (الحاشية والتعليق ظهرا مع الجزء الأول.)`
                : `${head}؛ ولجلب التالي استخدم body_part=${nextPart}. (الحاشية والتعليق يظهران مع الجزء الأول.)`;
        },
        hashiya: "الحاشية",
        excerptFound: (phrase) =>
            `هذا **مقتطعٌ حول عبارة «${phrase}»** لا الصفحة كاملة؛ فإن نقلتَ منه فاعلم أنّ قبله وبعده كلامًا. ولقراءة الصفحة كلها أعد الطلب بلا around_phrase.`,
        excerptMissing: (phrase) =>
            `لم تُوجد عبارة «${phrase}» في متن هذه الصفحة، فعُرض المتن كاملًا. وقد يكون اللفظ في الحاشية، أو مختلفًا عمّا كُتب — والمطابقة تتجاوز التشكيل لا الألفاظ.`,
        comment: "التعليق",
        citation: "الإحالة",
        autoNumbered: "_رقم الصفحة بترقيم الشاملة الآلي لا بترقيم المطبوع._",
    },
    en: {
        printedPage: (page) => `p. ${page}`,
        path: "Path",
        matn: "Matn (main text)",
        matnPart: (part, total) => `Matn (main text) — part ${part}/${total}`,
        longBody: (totalParts, part, nextPart) => {
            const head = `This page is long, so it was split into ${totalParts} parts (this is part ${part}${nextPart === null ? ", the last" : ""}). Show what you have in full and verbatim, or ask the user how they would like it presented`;
            return nextPart === null
                ? `${head}. (The hashiya and the comment came with part 1.)`
                : `${head}; to fetch the next part use body_part=${nextPart}. (The hashiya and the comment come with part 1.)`;
        },
        hashiya: "Hashiya (footnote)",
        excerptFound: (phrase) =>
            `This is an **excerpt around «${phrase}»**, not the whole page; there is text before and after it. To read the full page, ask again without around_phrase.`,
        excerptMissing: (phrase) =>
            `«${phrase}» was not found in this page's body, so the whole body is shown. The wording may be in the footnote, or may differ from what was typed — matching ignores diacritics, not different words.`,
        comment: "Comment",
        citation: "Citation",
        autoNumbered: "_Page number is Shamela's automatic count, not the printed edition's._",
    },
};
