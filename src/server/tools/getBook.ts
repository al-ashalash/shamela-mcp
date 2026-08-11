import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { bookNotFound } from "../errors.js";
import type { Helper } from "../helper.js";
import type { PageStore } from "../pages.js";
import { ResponseFormatInput } from "../schemas.js";
import { renderResponse, type RenderedResponse, header, meta } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { getBookLabels } from "../i18n/tools/getBook.js";

export const getBookInputShape = {
    book_id: z.number().int().positive().describe("The book id (e.g. 9942)."),
    ...ResponseFormatInput,
};
export const getBookInput = z.object(getBookInputShape).strict();

export interface AuthorEntry {
    author_id: number;
    author_name: string;
    death_year: number | null;
    role: "main" | "co";
}

/**
 * What can actually be done with this book, which the catalog flag alone cannot
 * say (#12). The file's presence decides; the flag only explains a mismatch.
 */
export type ContentStatus =
    /** File on disk with text pages. */
    | "readable"
    /** File on disk but page-less — an image/scan-only title. */
    | "downloaded_no_pages"
    /** Catalog says downloaded, file is not there — interrupted download or moved folder. */
    | "flagged_file_missing"
    /** Neither flag nor file. */
    | "not_downloaded";

export interface GetBookOutput {
    book_id: number;
    book_name: string;
    category_id: number | null;
    category: string | null;
    book_type: number;
    book_type_label: string;
    book_date: number | null;
    printed: number;
    available: boolean;
    downloaded: boolean;
    /** (#12): tri-state content availability, distinct from the catalog `downloaded` flag. */
    content_status: ContentStatus;
    authors: AuthorEntry[];
    pdf_links: string | null;
    publication_date: string | null;
    /** (#25): edition/publisher hint from Shamela's name suffix (e.g. «ت التركي»). */
    edition: string | null;
    /** (#25): muḥaqqiq, conservatively extracted from the book's front-matter (null if not clearly found). */
    editor: string | null;
    /** (#25): publisher, conservatively extracted from the book's front-matter (null if not clearly found). */
    publisher: string | null;
    sub_books: number[];
    notes: string[];
}

/**
 * Conservatively extract muḥaqqiq / publisher from a book's front-matter card.
 * Only reports a value when a clear «تحقيق: …» / «الناشر: …» pattern matches —
 * never guesses (quality over breadth). Returns nulls otherwise.
 */
// i18n:arabic-data — these patterns match Arabic text in Shamela's own
// book titles («المحقق: …», «الناشر: …»). They are how the data is read,
// not anything a reader sees; translating them would stop them matching.
function extractPubInfo(text: string): { editor: string | null; publisher: string | null } {
    const t = text.replace(/<[^>]*>/g, " ").replace(/[ \t]+/g, " ");
    const grab = (re: RegExp): string | null => {
        const m = t.match(re);
        if (!m || !m[1]) return null;
        const v = m[1].split(/[،,\n.()[\]:|]/)[0]!.trim();
        return v.length >= 2 && v.length <= 70 ? v : null;
    };
    const editor =
        grab(/(?:المحقّ?ق|تحقيق|بتحقيق|دراسة وتحقيق)\s*[:：]\s*([^\n]{2,70})/) ??
        grab(/حقّ?قه\s+(?:وعلّق عليه\s+)?([^\n،.]{3,50})/);
    const publisher = grab(/(?:الناشر|دار النشر)\s*[:：]\s*([^\n]{2,70})/);
    return { editor, publisher };
}

export async function runGetBook(
    catalog: Catalog,
    pages: PageStore,
    helper: Helper,
    args: z.infer<typeof getBookInput>,
): Promise<RenderedResponse<GetBookOutput>> {
    const rec = catalog.bookRecord(args.book_id);
    if (!rec) throw bookNotFound(args.book_id);
    const authors = catalog.bookAuthors(rec).map((a, idx) => ({
        author_id: a.author_id,
        author_name: a.author_name,
        death_year: a.death_year,
        role: idx === 0 ? ("main" as const) : ("co" as const),
    }));
    // #12: master.db.book.major_ondisk can flip true while the per-book SQLite
    // is either MISSING (interrupted download, moved library folder) or PRESENT
    // BUT EMPTY (an image/scan-only title). They are different user problems and
    // must not share one message, so resolve the file's existence separately.
    const fileOnDisk = catalog.isDownloaded(rec.book_id) || catalog.confirmOnDisk(rec.book_id);
    const hasContent = fileOnDisk && (await pages.pageCount(rec.book_id)) > 0;
    const content_status: ContentStatus = fileOnDisk
        ? hasContent
            ? "readable"
            : "downloaded_no_pages"
        : catalog.isFlaggedOnDisk(rec.book_id)
          ? "flagged_file_missing"
          : "not_downloaded";

    // #25: edition / muḥaqqiq / publisher. Shamela encodes these in the
    // name suffix after « - » by a fixed convention: «ت <editor>» = taḥqīq
    // (muḥaqqiq), «ط <publisher>» = print/edition. Fall back to meta_data.suffix.
    const nameParts = rec.book_name.split(/\s+-\s+/);
    const suffix = (rec.meta_data?.suffix?.trim() || (nameParts.length > 1 ? nameParts[nameParts.length - 1]!.trim() : "")) || "";
    const edition = suffix || null;
    // i18n:arabic-data — «ت » and «ط » are the prefixes Shamela itself puts
    // on the editor and edition parts of a book title. They are how the
    // field is recognised, not anything shown to a reader.
    let editor: string | null = /^ت\s/.test(suffix) ? suffix.replace(/^ت\s+/, "").trim() : null;
    let publisher: string | null = /^ط\s/.test(suffix) ? suffix.replace(/^ط\s+/, "").trim() : null;

    // Fallback: conservatively mine the front-matter card when the name gave
    // neither — readable books only, never fabricate.
    if (content_status === "readable" && !editor && !publisher) {
        try {
            const rows = await pages.getPagesRange(rec.book_id, 1, 6);
            const ids = rows.map((r) => r.page_id);
            if (ids.length) {
                const batch = await helper.request<{ results: Array<{ body: string }> }>("get_pages_batch", {
                    book_id: rec.book_id,
                    page_ids: ids,
                });
                const front = batch.results.map((r) => r.body ?? "").join("\n");
                const info = extractPubInfo(front);
                editor = info.editor;
                publisher = info.publisher;
            }
        } catch {
            /* best-effort enrichment */
        }
    }

    // `notes` rides in `structuredContent`, but its entries are sentences a
    // reader reads — `content_status` is what a caller branches on. So they come
    // from the slice and follow the language in force, and the slice is picked
    // out here rather than in the renderer because they are written while the
    // answer is being assembled.
    const L = pick(getBookLabels);
    const notes: string[] = [];
    if (content_status === "downloaded_no_pages") notes.push(L.noteNoPages);
    if (content_status === "flagged_file_missing") notes.push(L.noteFileMissing);
    if (catalog.isSessionDiscovered(rec.book_id)) notes.push(L.noteSessionDiscovered);
    if (!editor) notes.push(L.noteNoEditor);
    if (!publisher) notes.push(L.noteNoPublisher);
    if (!edition) notes.push(L.noteNoEdition);
    notes.push(L.noteNoCityOrEditionNumber);

    const out: GetBookOutput = {
        book_id: rec.book_id,
        book_name: rec.book_name,
        category_id: rec.book_category,
        category: catalog.categoryPath(rec.book_category)[0] ?? null,
        book_type: rec.book_type,
        book_type_label: pick(getBookLabels).typeName(rec.book_type),
        book_date: rec.book_date,
        printed: rec.printed,
        available: rec.major_online > 0,
        downloaded: content_status === "readable",
        content_status,
        authors,
        pdf_links: rec.pdf_links,
        publication_date: rec.meta_data?.date ?? null,
        edition,
        editor,
        publisher,
        sub_books: rec.meta_data?.sub_books ?? [],
        notes,
    };
    return renderResponse(out, args.response_format, (data) => {
        const lines = [header(1, data.book_name)];
        lines.push(`- **${L.bookId}**: ${data.book_id}`);
        if (data.authors.length) {
            const main = data.authors.find((a) => a.role === "main") ?? data.authors[0]!;
            lines.push(
                `- **${L.author}**: ${main.author_name}` +
                    (main.death_year ? L.died(num(main.death_year)) : ""),
            );
            const cos = data.authors.filter((a) => a.role === "co");
            if (cos.length) {
                lines.push(
                    `- **${L.coAuthors(cos.length)}**: ${cos.map((a) => a.author_name).join(L.listSep)}`,
                );
            }
        }
        if (data.category) lines.push(`- **${L.category}**: ${data.category}`);
        lines.push(`- **${L.bookType}**: ${data.book_type_label}`);
        if (data.book_date) lines.push(`- **${L.authoredYear}**: ${L.hijri(num(data.book_date))}`);
        const csLabel =
            data.content_status === "readable"
                ? L.statusReadable
                : data.content_status === "downloaded_no_pages"
                  ? L.statusNoPages
                  : data.content_status === "flagged_file_missing"
                    ? L.statusFileMissing
                    : L.statusNotDownloaded;
        lines.push(`- **${L.downloadedLocally}**: ${csLabel}`);
        if (data.edition) lines.push(`- **${L.edition}**: ${data.edition}`);
        if (data.editor) lines.push(`- **${L.editor}**: ${data.editor}`);
        if (data.publisher) lines.push(`- **${L.publisher}**: ${data.publisher}`);
        if (data.publication_date) lines.push(`- **${L.publicationDate}**: ${data.publication_date}`);
        if (data.notes.length) {
            lines.push("", `**${L.notesHeading}**:`);
            for (const n of data.notes) lines.push(`- ${n}`);
        }
        return lines.join("\n");
    });
}
