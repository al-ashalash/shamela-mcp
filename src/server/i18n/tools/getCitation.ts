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
}> = {
    ar: {
        heading: "الإحالة",
        notesHeading: "ملاحظات",
        editorFromBookName: (editor) => `المحقق (من اسم الشاملة): ${editor}`,
        publisherFromBookName: (publisher) => `الناشر/الطبعة (من اسم الشاملة): ${publisher}`,
    },
    en: {
        heading: "Citation",
        notesHeading: "Notes",
        editorFromBookName: (editor) => `Muḥaqqiq/editor (from the Shamela book name): ${editor}`,
        publisherFromBookName: (publisher) =>
            `Publisher/edition (from the Shamela book name): ${publisher}`,
    },
};
