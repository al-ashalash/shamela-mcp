import type { Slice } from "../labels.js";

/** Wording for shamela_get_book. Arabic first; English translates it. */
export const getBookLabels: Slice<{
    bookId: string;
    author: string;
    died: (year: string) => string;
    /**
     * Heads the co-author line, which is printed for one co-author as well as
     * for several. Arabic says «مشاركون» either way and ignores the count;
     * English has to agree with it, so the count is passed rather than assumed.
     */
    coAuthors: (n: number) => string;
    /** Between co-author names. */
    listSep: string;
    category: string;
    bookType: string;
    /**
     * The type name as the reader reads it. `book_type_label` is a
     * structuredContent value and stays Arabic there; only its rendering moves.
     */
    typeName: (bookType: number) => string;
    authoredYear: string;
    hijri: (year: string) => string;
    downloadedLocally: string;
    statusReadable: string;
    statusNoPages: string;
    statusFileMissing: string;
    statusNotDownloaded: string;
    edition: string;
    editor: string;
    publisher: string;
    publicationDate: string;
    notesHeading: string;
    /**
     * The `notes` array. It travels in `structuredContent`, but every entry is a
     * sentence a reader reads rather than a value a caller branches on — the
     * `content_status` code beside it is what a caller reads — so the entries
     * belong here with the rest of this tool's prose.
     *
     * One thing to know before translating them: unlike every other line in this
     * slice, the Arabic side of these seven was never written in Arabic. The
     * tool has emitted this English to Arabic readers since it was written, and
     * `tests/unit/bugs.test.ts` pins the Arabic-language output to it. Moving
     * them here may not change what Arabic prints, so `ar` keeps them verbatim.
     * The Arabic wording is a translation still owed, not a decision already
     * taken — it wants a pass of its own, with the tests updated alongside.
     */
    noteNoPages: string;
    noteFileMissing: string;
    noteSessionDiscovered: string;
    noteNoEditor: string;
    noteNoPublisher: string;
    noteNoEdition: string;
    noteNoCityOrEditionNumber: string;
}> = {
    ar: {
        bookId: "المعرِّف",
        author: "المؤلف",
        died: (year) => ` (ت ${year}هـ)`,
        coAuthors: () => "مشاركون",
        listSep: "، ",
        category: "التصنيف",
        bookType: "النوع",
        typeName: (bookType) =>
            ({ 1: "كتاب", 2: "مجلة", 3: "مخطوط", 4: "رسالة جامعية", 5: "إلكتروني", 6: "صوتي" })[bookType] ??
            "غير معروف",
        authoredYear: "سنة التأليف",
        hijri: (year) => `${year}هـ`,
        downloadedLocally: "منزَّل محليًّا",
        statusReadable: "نعم (نصّه مقروء)",
        statusNoPages: "ملفه موجود لكن **بلا صفحات مقروءة** (لا يُنقَل عنه)",
        statusFileMissing: "مفهرس كمنزَّل لكن **ملفه غير موجود على القرص** (لا يُنقَل عنه)",
        statusNotDownloaded: "لا",
        edition: "الطبعة/الناشر (من اسم الشاملة)",
        editor: "المحقق",
        publisher: "الناشر",
        publicationDate: "تاريخ النشر بالشاملة",
        notesHeading: "ملاحظات على البيانات المتاحة",
        // English, on purpose: see the note on `noteNoPages` above.
        noteNoPages:
            "the book file is on disk but carries no text pages (an image/scan-only title) — do not quote from it",
        noteFileMissing:
            "the catalog flags this book as downloaded but its file is not on disk (interrupted download, or the library folder was moved) — do not quote from it",
        noteSessionDiscovered:
            "downloaded during this session: catalog data is available, but its text is not readable until Claude Desktop restarts",
        noteNoEditor: "muḥaqqiq (editor) not found in the front-matter; may need the printed source",
        noteNoPublisher: "publisher not found in the front-matter / not in master.db",
        noteNoEdition: "edition descriptor not present in the Shamela name suffix",
        noteNoCityOrEditionNumber: "city of publication and edition number are not stored in master.db",
    },
    en: {
        bookId: "ID",
        author: "Author",
        died: (year) => ` (d. ${year} AH)`,
        coAuthors: (n) => (n === 1 ? "Co-author" : "Co-authors"),
        listSep: ", ",
        category: "Category",
        bookType: "Type",
        typeName: (bookType) =>
            ({ 1: "Book", 2: "Journal", 3: "Manuscript", 4: "Thesis", 5: "Electronic", 6: "Audio" })[bookType] ??
            "Unknown",
        authoredYear: "Year written",
        hijri: (year) => `${year} AH`,
        downloadedLocally: "Downloaded locally",
        statusReadable: "Yes (its text is readable)",
        statusNoPages: "File on disk but **no readable pages** (do not quote from it)",
        statusFileMissing: "Catalogued as downloaded but **its file is not on disk** (do not quote from it)",
        statusNotDownloaded: "No",
        edition: "Edition/publisher (from the Shamela name)",
        editor: "Muḥaqqiq (editor)",
        publisher: "Publisher",
        publicationDate: "Publication date in Shamela",
        notesHeading: "Notes on the available data",
        noteNoPages:
            "the book file is on disk but carries no text pages (an image/scan-only title) — do not quote from it",
        noteFileMissing:
            "the catalog flags this book as downloaded but its file is not on disk (interrupted download, or the library folder was moved) — do not quote from it",
        noteSessionDiscovered:
            "downloaded during this session: catalog data is available, but its text is not readable until Claude Desktop restarts",
        noteNoEditor: "muḥaqqiq (editor) not found in the front-matter; may need the printed source",
        noteNoPublisher: "publisher not found in the front-matter / not in master.db",
        noteNoEdition: "edition descriptor not present in the Shamela name suffix",
        noteNoCityOrEditionNumber: "city of publication and edition number are not stored in master.db",
    },
};
