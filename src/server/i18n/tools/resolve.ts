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
    empty: string;
}> = {
    ar: {
        heading: (query) => `نتائج البحث عن «${query}»`,
        authorsHeading: (count) => `المؤلفون (${count})`,
        died: (year) => ` ت ${year}هـ`,
        authorLine: (name, id, died, books) => `- **${name}** (id=${id})${died} — ${books} كتاب`,
        booksHeading: (count) => `الكتب (${count})`,
        byAuthor: (name) => ` — ${name}`,
        bookLine: (name, id, author) => `- **${name}** (id=${id})${author}`,
        empty: "_لا توجد نتائج. جرِّب صياغة مختلفة أو جزءًا من الاسم._",
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
        empty: "_No results. Try a different wording, or part of the name._",
    },
};

/** English agrees the noun with the count; the Arabic counted noun does not move. */
function plural(count: string, one: string, many: string): string {
    return count === "1" ? one : many;
}
