import type { Slice } from "../labels.js";

/** Wording for shamela_get_citation. Arabic first; English translates it. */
export const getCitationLabels: Slice<{
    heading: string;
    /** Heading over the notes the citation builder attached (missing fields, and the muḥaqqiq/publisher read off the Shamela book name). */
    notesHeading: string;
    /**
     * The two notes this tool adds itself: master.db has no muḥaqqiq or
     * publisher column, so both are read off the Shamela book-name suffix
     * («ت …» / «ط …»). Prose a reader reads, so it follows the reader's
     * language even though it travels in `notes`.
     */
    editorFromBookName: (editor: string) => string;
    publisherFromBookName: (publisher: string) => string;
    /** The book's file is not on this machine, so nothing can be quoted from it. */
    noteBookUnreadable: string;
    /** The page_id asked for is not in this book. */
    notePageNotFound: (pageId: string) => string;
}> = {
    ar: {
        heading: "الإحالة",
        notesHeading: "ملاحظات",
        editorFromBookName: (editor) => `المحقق (من اسم الشاملة): ${editor}`,
        publisherFromBookName: (publisher) => `الناشر/الطبعة (من اسم الشاملة): ${publisher}`,
        noteBookUnreadable:
            "⚠️ هذا الكتاب غير مقروء على هذا الجهاز (غير منزَّل أو ملفه مفقود)، فلا يُنقَل عنه نصّ؛ والإحالة أدناه من بيانات الفهرس وحدها.",
        notePageNotFound: (pageId) =>
            `⚠️ لا توجد صفحة بالمعرِّف ${pageId} في هذا الكتاب، فالإحالة أدناه بلا رقم صفحة. تحقّق من المعرِّف بـ shamela_get_toc أو shamela_search_pages.`,
    },
    en: {
        heading: "Citation",
        notesHeading: "Notes",
        editorFromBookName: (editor) => `Muḥaqqiq/editor (from the Shamela book name): ${editor}`,
        publisherFromBookName: (publisher) =>
            `Publisher/edition (from the Shamela book name): ${publisher}`,
        noteBookUnreadable:
            "⚠️ this book is not readable on this machine (not downloaded, or its file is missing), so nothing can be quoted from it; the citation below rests on catalogue data alone.",
        notePageNotFound: (pageId) =>
            `⚠️ this book has no page with id ${pageId}, so the citation below carries no page number. Check the id with shamela_get_toc or shamela_search_pages.`,
    },
};
