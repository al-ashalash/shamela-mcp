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
    /**
     * Shamela's own stamp on the catalogue entry — NOT the date the edition was
     * printed. It is labelled for what it is: every value in the shipped
     * catalogue falls in 1431–1447 AH, and 4,836 of the 8,593 rows carry the
     * single value 08121431, the day the v4 library was seeded. Ṭabarī's
     * commentary carries it in two different printed editions; two presses do
     * not share a publication day.
     */
    publicationDate: string;
    /** The stamp split into its parts, in the order each language reads a date. */
    hijriDate: (day: string, month: string, year: string) => string;
    notesHeading: string;
    /**
     * The `notes` array. It travels in `structuredContent`, but every entry is a
     * sentence a reader reads rather than a value a caller branches on — the
     * `content_status` code beside it is what a caller reads — so the entries
     * belong here with the rest of this tool's prose.
     *
     * The Arabic side of these seven was English for as long as this tool has
     * existed, kept verbatim when the slice was built because the tests pinned
     * it and the translation was owed rather than decided. This is the pass it
     * was owed. The one clause aimed at the model rather than the reader — «لا
     * يُنقَل عنه» — already stands in Arabic on the status line printed above
     * the notes, and `content_status` is what a caller actually branches on, so
     * nothing that was doing work in English stopped doing it.
     *
     * `master.db` and «Claude Desktop» stay Latin inside the Arabic: they are
     * the names of a file and of an application, not words.
     */
    noteNoPages: string;
    noteFileMissing: string;
    noteSessionDiscovered: string;
    noteNoEditor: string;
    noteNoPublisher: string;
    noteNoEdition: string;
    noteNoCityOrEditionNumber: string;
    /** Said when the book's file is absent, so its front-matter was never read. */
    noteFrontMatterUnread: string;
    /** The edition NUMBER, read off «ط N» in the Shamela name. */
    noteEditionNumber: (n: string) => string;
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
        authoredYear: "سنة تأريخ الكتاب في الشاملة (وفاة مؤلِّف الأصل)",
        hijri: (year) => `${year}هـ`,
        downloadedLocally: "منزَّل محليًّا",
        statusReadable: "نعم (نصّه مقروء)",
        statusNoPages: "ملفه موجود لكن **بلا صفحات مقروءة** (لا يُنقَل عنه)",
        statusFileMissing: "مفهرس كمنزَّل لكن **ملفه غير موجود على القرص** (لا يُنقَل عنه)",
        statusNotDownloaded: "لا",
        edition: "الطبعة/الناشر (من اسم الشاملة)",
        editor: "المحقق",
        publisher: "الناشر",
        publicationDate: "تاريخ إضافته أو تحديثه بالشاملة",
        hijriDate: (day, month, year) => `${day}/${month}/${year}هـ`,
        notesHeading: "ملاحظات على البيانات المتاحة",
        noteNoPages:
            "ملف الكتاب موجود على القرص ولم يجد القارئ فيه صفحات نصّية — الغالب أنها نسخة مصوَّرة لا نصية، ويحتمل عجز القارئ عن صيغة الملف. لا يُنقَل عنه؛ فإن أعاد البحث نصًّا من هذا الكتاب فذلك تناقض يستحق بلاغًا.",
        noteFileMissing:
            "الفهرس يعدّ هذا الكتاب منزَّلًا وملفه غير موجود على القرص (تنزيل مبتور، أو مجلد المكتبة نُقل) — فلا يُنقَل عنه.",
        noteSessionDiscovered:
            "نُزِّل في أثناء هذه الجلسة: بيانات الفهرس متاحة، أمّا نصّه فلا يُقرأ حتى يُعاد تشغيل Claude Desktop.",
        noteNoEditor: "لم يُذكر المحقق في مقدمة الكتاب؛ وقد يُحتاج إلى المطبوع لمعرفته.",
        noteNoPublisher: "لم يُذكر الناشر في مقدمة الكتاب، وليس في master.db.",
        noteNoEdition: "لا وصف للطبعة في لاحقة اسم الكتاب بالشاملة.",
        noteNoCityOrEditionNumber: "بلد النشر ورقم الطبعة غير محفوظين في master.db.",
        noteFrontMatterUnread:
            "الكتاب غير منزَّل، فلم يُطَّلع على مقدمته؛ والمحقق والناشر غير معروفين من master.db.",
        noteEditionNumber: (n) => `رقم الطبعة ${n} (من لاحقة اسم الكتاب بالشاملة)؛ وبلد النشر غير محفوظ في master.db.`,
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
        authoredYear: "Shamela dating year (original author's death)",
        hijri: (year) => `${year} AH`,
        downloadedLocally: "Downloaded locally",
        statusReadable: "Yes (its text is readable)",
        statusNoPages: "File on disk but **no readable pages** (do not quote from it)",
        statusFileMissing: "Catalogued as downloaded but **its file is not on disk** (do not quote from it)",
        statusNotDownloaded: "No",
        edition: "Edition/publisher (from the Shamela name)",
        editor: "Muḥaqqiq (editor)",
        publisher: "Publisher",
        publicationDate: "Added or updated in Shamela",
        // Day-first in Arabic, which is how the stamp is already written and how
        // an Arabic reader reads a date; year-first in English, because d/m/y
        // would be read as m/d/y by half of its readers.
        hijriDate: (day, month, year) => `${year}-${month}-${day} AH`,
        notesHeading: "Notes on the available data",
        noteNoPages:
            "the book file is on disk and the reader found no text pages in it — most likely an image/scan-only title, though a file format this reader cannot open would look identical. Do not quote from it; if search still returns text from this book, that contradiction deserves a bug report.",
        noteFileMissing:
            "the catalog flags this book as downloaded but its file is not on disk (interrupted download, or the library folder was moved) — do not quote from it",
        noteSessionDiscovered:
            "downloaded during this session: catalog data is available, but its text is not readable until Claude Desktop restarts",
        noteNoEditor: "muḥaqqiq (editor) not found in the front-matter; may need the printed source",
        noteNoPublisher: "publisher not found in the front-matter / not in master.db",
        noteNoEdition: "edition descriptor not present in the Shamela name suffix",
        noteNoCityOrEditionNumber: "city of publication and edition number are not stored in master.db",
        noteFrontMatterUnread:
            "the book is not downloaded, so its front-matter was never consulted; muḥaqqiq and publisher are unknown from master.db",
        noteEditionNumber: (n) => `edition number ${n} (from the Shamela name suffix); city of publication is not stored in master.db`,
    },
};
