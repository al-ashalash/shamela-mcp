import type { Slice } from "../labels.js";

/** Wording for shamela_resolve. Arabic first; English translates it. */
export const resolveLabels: Slice<{
    heading: (query: string) => string;
    authorsHeading: (count: string) => string;
    /** Fragment after an author's id: the death year, when the catalogue knows it. */
    died: (year: string) => string;
    authorLine: (name: string, id: string, died: string, books: string) => string;
    booksHeading: (count: string) => string;
    /** Fragment after a book's id: who wrote it, when the catalogue knows. */
    byAuthor: (name: string) => string;
    bookLine: (name: string, id: string, author: string) => string;
    /** Appended to a book that is downloaded on this machine. */
    downloadedTag: string;
    /** Said when every book hit is undownloaded — searching their text returns nothing. */
    noneDownloaded: string;
    empty: string;
    /** Nothing found, and the Latin spelling was tried too. */
    emptyLatin: string;
}> = {
    ar: {
        heading: (query) => `نتائج البحث عن «${query}»`,
        authorsHeading: (count) => `المؤلفون (${count})`,
        died: (year) => ` ت ${year}هـ`,
        authorLine: (name, id, died, books) => `- **${name}** (id=${id})${died} — ${books} كتاب`,
        booksHeading: (count) => `الكتب (${count})`,
        byAuthor: (name) => ` — ${name}`,
        bookLine: (name, id, author) => `- **${name}** (id=${id})${author}`,
        downloadedTag: " — منزَّل",
        noneDownloaded:
            "لا شيء من هذه الكتب منزَّلٌ على هذا الجهاز؛ فالبحث في نصوصها يعيد صفرًا. للتنزيل انظر shamela_suggest_download، أو ابحث في المنزَّل بـ shamela_search_books مع downloaded_only.",
        empty: "_لا توجد نتائج. جرِّب صياغة مختلفة أو جزءًا من الاسم._",
        emptyLatin:
            "_لا نتائج، ولا في مقابلة الرسم اللاتيني بأسماء الفهرس. جرِّب رسمًا آخر للاسم، أو اكتبه بالعربية._",
    },
    en: {
        heading: (query) => `Search results for "${query}"`,
        authorsHeading: (count) => `Authors (${count})`,
        died: (year) => ` d. ${year} AH`,
        authorLine: (name, id, died, books) =>
            `- **${name}** (id=${id})${died} — ${books} ${plural(books, "book", "books")}`,
        booksHeading: (count) => `Books (${count})`,
        byAuthor: (name) => ` — ${name}`,
        bookLine: (name, id, author) => `- **${name}** (id=${id})${author}`,
        downloadedTag: " — downloaded",
        noneDownloaded:
            "None of these books is downloaded on this machine, so searching their text returns zero. See shamela_suggest_download to fetch one, or search what IS here with shamela_search_books and downloaded_only.",
        empty: "_No results. Try a different wording, or part of the name._",
        emptyLatin:
            "_No results, and matching the Latin spelling against the catalogue's names found none either. Try another spelling, or write the name in Arabic._",
    },
};

/** English agrees the noun with the count; the Arabic counted noun does not move. */
function plural(count: string, one: string, many: string): string {
    return count === "1" ? one : many;
}
