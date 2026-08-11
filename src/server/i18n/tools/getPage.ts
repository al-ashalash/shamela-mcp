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
     */
    longBody: (totalParts: string, part: string, nextPart: string) => string;
    hashiya: string;
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
        longBody: (totalParts, part, nextPart) =>
            `النص طويل، قُسِّم إلى ${totalParts} أجزاء (هذا الجزء ${part}). اعرض المعروض كاملًا حرفيًّا أو اسأل المستخدم عن طريقة العرض؛ ولجلب التالي استخدم body_part=${nextPart}. (الحاشية والتعليق يظهران مع الجزء الأول.)`,
        hashiya: "الحاشية",
        comment: "التعليق",
        citation: "الإحالة",
        autoNumbered: "_رقم الصفحة بترقيم الشاملة الآلي لا بترقيم المطبوع._",
    },
    en: {
        printedPage: (page) => `p. ${page}`,
        path: "Path",
        matn: "Matn (main text)",
        matnPart: (part, total) => `Matn (main text) — part ${part}/${total}`,
        longBody: (totalParts, part, nextPart) =>
            `This page is long, so it was split into ${totalParts} parts (this is part ${part}). Show what you have in full and verbatim, or ask the user how they would like it presented; to fetch the next part use body_part=${nextPart}. (The hashiya and the comment come with part 1.)`,
        hashiya: "Hashiya (footnote)",
        comment: "Comment",
        citation: "Citation",
        autoNumbered: "_Page number is Shamela's automatic count, not the printed edition's._",
    },
};
