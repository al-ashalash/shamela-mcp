import type { Slice } from "../labels.js";

/** Wording for shamela_get_author. Arabic first; English translates it. */
export const getAuthorLabels: Slice<{
    authorId: string;
    /** Field label; the value is a hijri year, or the catalogue's own death phrase. */
    deathYear: string;
    hijri: (year: string) => string;
    bookCount: string;
    booksHeading: string;
    /** Appended to a book's line when its file is on this machine. */
    downloadedSuffix: string;
}> = {
    ar: {
        authorId: "المعرِّف",
        deathYear: "سنة الوفاة",
        hijri: (year) => `${year}هـ`,
        bookCount: "عدد الكتب",
        booksHeading: "الكتب",
        downloadedSuffix: " — منزَّل",
    },
    en: {
        authorId: "ID",
        deathYear: "Death year",
        hijri: (year) => `${year} AH`,
        bookCount: "Book count",
        booksHeading: "Books",
        downloadedSuffix: " — downloaded",
    },
};
