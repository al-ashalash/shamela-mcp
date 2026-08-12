import type { Slice } from "../labels.js";

/** Wording for shamela_suggest_download. Arabic first; English translates it. */
export const suggestDownloadLabels: Slice<{
    headingQuery: (query: string) => string;
    headingAll: string;
    summary: (total: string, downloaded: string, available: string, unavailable: string) => string;
    statusDownloaded: string;
    statusAvailable: string;
    statusUnavailable: string;
    died: (year: string) => string;
    status: string;
    /**
     * Labels `book_id`, which stays in Latin digits in both languages.
     *
     * It was arabized here once, and left that way on the ground that changing
     * it would change the Arabic output. It had to change: this line exists to
     * be copied — into a request, or into the book's own page URL printed
     * directly beneath it, which carries the same number as 9942 — and «٩٩٤٢»
     * is not a number either of them will take.
     */
    shamelaId: string;
    bookPage: string;
    stepsHeading: string;
    notesHeading: string;
    /**
     * `next_steps` and `notes` travel in `structuredContent`, but they are
     * sentences a reader reads rather than values a caller branches on — the
     * counts and the `status` codes beside them are what a caller reads. So
     * they come from here and follow the language in force, like every other
     * line this tool prints.
     *
     * Which is also why `stepReadOnline` names the line to open rather than a
     * direction to look in. It said «أدناه» / "below" and the links are printed
     * above it — wrong in the markdown, and meaningless in structuredContent,
     * where a caller has a `link` on each result and no above or below at all.
     */
    stepDownloadInApp: string;
    stepReadOnline: string;
    stepPickedUpAutomatically: string;
    stepLookElsewhere: string;
    noteNoMatch: string;
    noteAllDownloaded: string;
    noteOffline: string;
    /** A `book_ids` entry the catalogue has never heard of. */
    noteUnknownId: (id: string) => string;
}> = {
    ar: {
        headingQuery: (query) => `كتب مقترحة: «${query}»`,
        headingAll: "حال الكتب في فهرس الشاملة",
        summary: (total, downloaded, available, unavailable) =>
            `**${total}** كتابًا مطابقًا — منزَّل عندك: ${downloaded}، متاح للتنزيل: ${available}، في الفهرس دون إتاحة: ${unavailable}.`,
        statusDownloaded: "✔ منزَّل عندك",
        statusAvailable: "⬇ متاح للتنزيل",
        statusUnavailable: "— في الفهرس دون إتاحة للتنزيل",
        died: (year) => `ت ${year}هـ`,
        status: "الحال",
        shamelaId: "الرقم في الشاملة",
        bookPage: "صفحته",
        stepsHeading: "الخطوات",
        notesHeading: "ملاحظات",
        stepDownloadInApp:
            "افتح برنامج «المكتبة الشاملة» على جهازك، وابحث عن الكتاب باسمه أو برقمه في قسم التنزيل، ثم نزِّله.",
        stepReadOnline:
            "أو افتح رابط «صفحته» المذكور مع كل نتيجة في المتصفح لقراءته مباشرةً على موقع الشاملة دون تنزيل.",
        stepPickedUpAutomatically: "بعد التنزيل تلتقطه الإضافة خلال ثوانٍ، فتابع بحثك في المحادثة نفسها.",
        stepLookElsewhere:
            "ما وُصف بأنه «في الفهرس دون إتاحة للتنزيل» لن تجده في برنامج الشاملة؛ ابحث عنه في مصادر أخرى بعنوانه ومؤلفه كما هما هنا.",
        noteNoMatch:
            "لا مطابق في فهرس الشاملة الكامل. تحقَّق من صيغة العنوان أو اسم المؤلف، أو جرّب كلمةً واحدة مميِّزة من العنوان — وقد يكون الكتاب خارج المكتبة الشاملة أصلًا.",
        noteAllDownloaded: "كل ما طابق منزَّلٌ عندك فعلًا — ابحث فيه مباشرةً.",
        noteOffline:
            "هذه الأداة لا تنزِّل شيئًا ولا تتصل بأي خادم؛ التنزيل يتولاه برنامج المكتبة الشاملة نفسه.",
        noteUnknownId: (id) => `الرقم ${id} ليس في فهرس الشاملة إطلاقًا`,
    },
    en: {
        headingQuery: (query) => `Suggested books: "${query}"`,
        headingAll: "Book status in the Shamela catalogue",
        summary: (total, downloaded, available, unavailable) =>
            `**${total}** matching ${plural(total, "book", "books")} — downloaded: ${downloaded}, available to download: ${available}, catalogue only: ${unavailable}.`,
        statusDownloaded: "✔ Downloaded",
        statusAvailable: "⬇ Available to download",
        statusUnavailable: "— In the catalogue, not offered for download",
        died: (year) => `d. ${year} AH`,
        status: "Status",
        shamelaId: "Shamela ID",
        bookPage: "Book page",
        stepsHeading: "Next steps",
        notesHeading: "Notes",
        stepDownloadInApp:
            "Open the Maktabah al-Shamela app on your machine, look the book up by title or by id in its download section, and download it there.",
        stepReadOnline:
            "Or open the \"Book page\" link listed with each result in a browser and read it on the Shamela site directly, without downloading it.",
        stepPickedUpAutomatically:
            "Once it is downloaded the extension picks it up within seconds, so carry on with your search in this same conversation.",
        stepLookElsewhere:
            'Anything marked "In the catalogue, not offered for download" will not be in the Shamela app; look for it elsewhere under the title and author exactly as they stand here.',
        noteNoMatch:
            "Nothing matched in the full Shamela catalogue. Check how the title or the author's name is spelled, or try a single distinctive word from the title — and the book may lie outside Maktabah al-Shamela altogether.",
        noteAllDownloaded:
            "Everything that matched is already downloaded on this machine — search it directly.",
        noteOffline:
            "This tool downloads nothing and contacts no server; downloading is the Maktabah al-Shamela app's own job.",
        noteUnknownId: (id) => `ID ${id} is not in the Shamela catalogue at all`,
    },
};

/** English agrees the noun with the count; the Arabic counted noun does not move. */
function plural(count: string, one: string, many: string): string {
    return count === "1" ? one : many;
}
