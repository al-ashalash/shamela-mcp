import type { Slice } from "../labels.js";

/** Wording for shamela_search_hadith. Arabic first; English translates it. */
export const searchHadithLabels: Slice<{
    heading: (query: string) => string;
    summary: (matches: string, scanned: string) => string;
    /** The hadith service keys carried by one matched page. */
    hadithKeys: (keys: string[]) => string;
    takhrijHeading: string;
    /** One key and the books that carry it. */
    keyLine: (key: string, books: string[]) => string;
    /** Said under a hit whose book file is missing (issue #47). Word for word
     *  the sentence search_pages uses: one library state, one answer. */
    unreadableHit: string;
    /** Marks a takhrij book already present in the local library. */
    downloadedTag: string;
    /** Shown when no page in the window carried a service key. */
    noKeys: string;
}> = {
    ar: {
        heading: (query) => `بحث عن حديث: «${query}»`,
        summary: (matches, scanned) =>
            `**${matches}** صفحة فيها نص الحديث (فُحصت ${scanned} منها للمفاتيح).`,
        hadithKeys: (keys) => `*مفاتيح الحديث: ${keys.join("، ")}*`,
        takhrijHeading: "التخريج عبر الكتب (من مفاتيح الخدمة)",
        keyLine: (key, books) => `- **مفتاح ${key}**: ${books.join("؛ ")}`,
        unreadableHit: "⚠️ ملف الكتاب غير موجود على القرص — لن تنجح قراءته",
        downloadedTag: " (منزَّل)",
        noKeys:
            "_لا توجد مفاتيح خدمة على الصفحات المطابقة (شائع في كتب الفقه/الأصول)؛ انظر التخريج المطبوع في المقتطفات أعلاه._",
    },
    en: {
        heading: (query) => `Hadith search: "${query}"`,
        summary: (matches, scanned) =>
            `**${matches}** ${plural(matches, "page carries", "pages carry")} the hadith text (${scanned} of them scanned for keys).`,
        hadithKeys: (keys) => `*Hadith keys: ${keys.join(", ")}*`,
        takhrijHeading: "Takhrij across books (from service keys)",
        keyLine: (key, books) => `- **Key ${key}**: ${books.join("; ")}`,
        unreadableHit: "⚠️ the book's file is not on disk — reading it will fail",
        downloadedTag: " (downloaded)",
        noKeys:
            "_No service keys on the matching pages (common in fiqh and usul books); see the printed takhrij in the snippets above._",
    },
};

/** English agrees the noun (and its verb) with the count; the Arabic counted noun does not move. */
function plural(count: string, one: string, many: string): string {
    return count === "1" ? one : many;
}
