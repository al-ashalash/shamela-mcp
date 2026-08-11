import type { Slice } from "../labels.js";

/** Wording for shamela_health. Arabic first; English translates it. */
export const healthLabels: Slice<{
    heading: (status: string) => string;
    ok: string;
    degraded: string;
    serverVersion: (version: string) => string;
    counts: (books: string, authors: string, categories: string) => string;
    downloaded: (count: string) => string;
    flaggedMissing: (count: string) => string;
    orphanFiles: (count: string) => string;
    diskScanFellBack: string;
    spotCheck: (readable: string, sampled: string, unreadable: string) => string;
    unreadableIds: (ids: string) => string;
    idSeparator: string;
    searchIndex: (docs: string) => string;
    unavailable: string;
    pageDocs: (count: string) => string;
    bookDocs: (count: string) => string;
    authorDocs: (count: string) => string;
    probe: (query: string, result: string) => string;
    probeFailed: (error: string) => string;
    probeHits: (count: string) => string;
    notesHeading: string;
}> = {
    ar: {
        heading: (status) => `فحص خادم الشاملة — ${status}`,
        ok: "سليم ✅",
        degraded: "متعثر ⚠️",
        serverVersion: (version) => `- **نسخة الخادم**: ${version}`,
        counts: (books, authors, categories) =>
            `- **كتب الفهرس**: ${books} — **المؤلفون**: ${authors} — **التصنيفات**: ${categories}`,
        downloaded: (count) => `- **الكتب المنزَّلة**: ${count} (ملفاتها موجودة على القرص)`,
        flaggedMissing: (count) =>
            `- **معلَّمة في الفهرس بلا ملف**: ${count} — تنزيل مبتور أو مجلد مكتبة مُنقَل`,
        orphanFiles: (count) => `- **ملفات كتب خارج الفهرس**: ${count}`,
        diskScanFellBack:
            "- ⚠️ **تعذَّرت قراءة مجلد الكتب**؛ الأعداد أعلاه من علامات الفهرس لا من الملفات",
        spotCheck: (readable, sampled, unreadable) =>
            `- **عيّنة قابلية القراءة**: ${readable} من ${sampled} مقروءة${unreadable}`,
        unreadableIds: (ids) => ` (غير المقروءة: ${ids})`,
        idSeparator: "، ",
        searchIndex: (docs) => `- **فهرس البحث**: ${docs}`,
        unavailable: "غير متاح",
        pageDocs: (count) => `${count} وثيقة صفحات`,
        bookDocs: (count) => ` — ${count} كتب`,
        authorDocs: (count) => ` — ${count} مؤلفين`,
        probe: (query, result) => `- **استعلام تجريبي** «${query}»: ${result}`,
        probeFailed: (error) => `أخفق (${error})`,
        probeHits: (count) => `${count} نتيجة`,
        notesHeading: "**ملاحظات**:",
    },
    en: {
        heading: (status) => `Shamela server check — ${status}`,
        ok: "Healthy ✅",
        degraded: "Degraded ⚠️",
        serverVersion: (version) => `- **Server version**: ${version}`,
        counts: (books, authors, categories) =>
            `- **Catalogue books**: ${books} — **Authors**: ${authors} — **Categories**: ${categories}`,
        downloaded: (count) => `- **Downloaded books**: ${count} (files present on disk)`,
        flaggedMissing: (count) =>
            `- **Flagged in the catalogue, no file**: ${count} — an interrupted download, or the library folder moved`,
        orphanFiles: (count) => `- **Book files outside the catalogue**: ${count}`,
        diskScanFellBack:
            "- ⚠️ **The book folder could not be read**; the counts above come from the catalogue flags, not the files",
        spotCheck: (readable, sampled, unreadable) =>
            `- **Readability sample**: ${readable} of ${sampled} readable${unreadable}`,
        unreadableIds: (ids) => ` (unreadable: ${ids})`,
        idSeparator: ", ",
        searchIndex: (docs) => `- **Search index**: ${docs}`,
        unavailable: "unavailable",
        pageDocs: (count) => `${count} page ${plural(count, "document", "documents")}`,
        bookDocs: (count) => ` — ${count} ${plural(count, "book", "books")}`,
        authorDocs: (count) => ` — ${count} ${plural(count, "author", "authors")}`,
        probe: (query, result) => `- **Probe query** "${query}": ${result}`,
        probeFailed: (error) => `failed (${error})`,
        probeHits: (count) => `${count} ${plural(count, "result", "results")}`,
        notesHeading: "**Notes**:",
    },
};

/** English agrees the noun with the count; the Arabic counted noun does not move. */
function plural(count: string, one: string, many: string): string {
    return count === "1" ? one : many;
}
