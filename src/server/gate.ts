/**
 * The single check every reading tool runs before touching a book.
 *
 * There used to be six copies of it, each testing `major_ondisk === 0`, which
 * is how a library that was copied rather than downloaded ended up searchable
 * but unreadable: Lucene answered from Shamela's own index while every reader
 * refused to open the book.
 *
 * Two conditions now, and they are not the same question:
 *   - Is the file on disk? Decided by the file, with a direct check as a
 *     fallback so a book that appeared since startup still works.
 *   - Can the search engine read it? The helper opens Shamela's Lucene indexes
 *     once, when it starts. A book downloaded after that is on disk and in the
 *     catalog, but its text is not in the reader yet — and the page body comes
 *     from Lucene, not SQLite. Without this check the tool would return an
 *     empty body for a book that plainly has one, which is the worst failure
 *     shape available to us: not an error, just silence that reads as "this
 *     book has nothing in it".
 */

import type { BookRecord, Catalog } from "./catalog.js";
import { bookIndexPending, bookNotDownloaded, bookNotFound } from "./errors.js";

export interface GateOptions {
    /**
     * Whether the tool reads text through the Java helper's Lucene readers.
     * Tools served entirely from the per-book SQLite file (part lists, page
     * services) pass false and keep working for a just-downloaded book.
     */
    needsTextIndex?: boolean;
}

/**
 * Resolve a book id to its record, or throw a typed error explaining which of
 * the three situations applies.
 */
export function requireDownloadedBook(
    catalog: Catalog,
    bookId: number,
    opts: GateOptions = {},
): BookRecord {
    const rec = catalog.bookRecord(bookId);
    if (!rec) throw bookNotFound(bookId);

    if (!catalog.isDownloaded(bookId) && !catalog.confirmOnDisk(bookId)) {
        throw bookNotDownloaded(bookId, rec.book_name);
    }

    if (opts.needsTextIndex !== false && catalog.isSessionDiscovered(bookId)) {
        throw bookIndexPending(bookId, rec.book_name);
    }

    return rec;
}
