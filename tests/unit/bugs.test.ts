/**
 * Unit-level regression tests for bugs reported via real-world tool exercise.
 * Per CLAUDE.md "Testing rules" §3 — every reported bug becomes a test BEFORE
 * the fix lands. These tests use minimal in-memory test doubles to exercise
 * the fix logic without booting the JVM or sql.js.
 */

import { describe, it, expect, vi } from "vitest";

import type {
    AuthorRecord,
    BookRecord,
    Catalog,
} from "../../src/server/catalog.js";
import type { Helper } from "../../src/server/helper.js";
import type { PageStore } from "../../src/server/pages.js";
import { runGetBook } from "../../src/server/tools/getBook.js";

function makeBook(overrides: Partial<BookRecord> = {}): BookRecord {
    return {
        book_id: 27,
        book_name: "كتاب فارغ",
        book_category: 17,
        book_type: 1,
        book_date: 1400,
        authors_csv: null,
        main_author: null,
        printed: 1,
        group_id: null,
        hidden: 0,
        major_online: 1,
        minor_online: 0,
        major_ondisk: 1, // master.db says: downloaded
        minor_ondisk: 0,
        pdf_links: null,
        meta_data: null,
        parent: null,
        ...overrides,
    };
}

/**
 * Whether a book counts as downloaded is now decided by the catalog, which
 * resolves it from the file on disk rather than master.db's flag — so these
 * doubles model the two facts separately: `onDisk` (the file) and the book's
 * own `major_ondisk` (the flag, which only explains a mismatch).
 */
function makeCatalog(book: BookRecord, onDisk = true, sessionDiscovered = false): Catalog {
    return {
        bookRecord: vi.fn((id: number) => (id === book.book_id ? book : undefined)),
        bookAuthors: vi.fn((_b: BookRecord): AuthorRecord[] => []),
        categoryPath: vi.fn((_c: number | null) => ["الفقه"]),
        isDownloaded: vi.fn((_id: number) => onDisk),
        confirmOnDisk: vi.fn((_id: number) => onDisk),
        isFlaggedOnDisk: vi.fn((_id: number) => book.major_ondisk > 0),
        isSessionDiscovered: vi.fn((_id: number) => sessionDiscovered),
    } as unknown as Catalog;
}

/**
 * Models the two independent facts a real PageStore reports: whether the
 * per-book file exists at all, and how many pages it holds. They are separate
 * because "flagged downloaded but the file is missing" and "file present but
 * page-less" are different user problems that must not share one message.
 */
function makePages(fileOnDisk: boolean, pageCount = fileOnDisk ? 1 : 0): PageStore {
    return {
        hasBook: vi.fn(async () => fileOnDisk),
        pageCount: vi.fn(async () => pageCount),
        bookHasContent: vi.fn(async () => fileOnDisk && pageCount > 0),
        getPagesRange: vi.fn(async () => []),
    } as unknown as PageStore;
}

function makeHelper(): Helper {
    return { request: vi.fn(async () => ({ results: [] })) } as unknown as Helper;
}

describe("Bug #3 — get_book.downloaded must reflect readable content, not just a flag", () => {
    it("reports downloaded=false when the file is on disk but holds no pages", async () => {
        const book = makeBook({ book_id: 27 });
        const pages = makePages(/* fileOnDisk */ true, /* pageCount */ 0);

        const r = await runGetBook(makeCatalog(book, /* onDisk */ true), pages, makeHelper(), {
            book_id: 27,
            response_format: "json",
        });

        expect(r.structuredContent.downloaded).toBe(false);
        expect(pages.pageCount).toHaveBeenCalledWith(27);
    });

    it("reports downloaded=true when the file is on disk and has pages", async () => {
        const book = makeBook({ book_id: 9942 });
        const pages = makePages(/* fileOnDisk */ true, /* pageCount */ 12);

        const r = await runGetBook(makeCatalog(book, /* onDisk */ true), pages, makeHelper(), {
            book_id: 9942,
            response_format: "json",
        });

        expect(r.structuredContent.downloaded).toBe(true);
    });

    it("skips the page lookup when the file is not on disk", async () => {
        const book = makeBook({ book_id: 9999, major_ondisk: 0 });
        const pages = makePages(/* fileOnDisk */ false);

        const r = await runGetBook(makeCatalog(book, /* onDisk */ false), pages, makeHelper(), {
            book_id: 9999,
            response_format: "json",
        });

        expect(r.structuredContent.downloaded).toBe(false);
        expect(r.structuredContent.content_status).toBe("not_downloaded");
        // No file, nothing to count — do not pay for a disk hit.
        expect(pages.pageCount).not.toHaveBeenCalled();
    });

    it("counts a book whose file exists even though master.db never flagged it", async () => {
        // The reported case: a library copied or restored rather than downloaded
        // through Shamela, so every flag is 0 while every file is present.
        const book = makeBook({ book_id: 21739, major_ondisk: 0 });
        const pages = makePages(/* fileOnDisk */ true, /* pageCount */ 400);

        const r = await runGetBook(makeCatalog(book, /* onDisk */ true), pages, makeHelper(), {
            book_id: 21739,
            response_format: "json",
        });

        expect(r.structuredContent.downloaded).toBe(true);
        expect(r.structuredContent.content_status).toBe("readable");
    });
});

describe("get_book advice separates the ways a book can be unreadable", () => {
    it("names an interrupted download / moved folder when the flag has no file", async () => {
        const book = makeBook({ book_id: 9 }); // major_ondisk = 1
        const r = await runGetBook(makeCatalog(book, /* onDisk */ false), makePages(false), makeHelper(), {
            book_id: 9,
            response_format: "json",
        });

        expect(r.structuredContent.content_status).toBe("flagged_file_missing");
        const notes = r.structuredContent.notes.join(" | ");
        expect(notes).toContain("not on disk");
        // The old wording blamed image/scan-only books for a missing file.
        expect(notes).not.toContain("image/scan-only");
    });

    it("names an image/scan-only title when the file is present but page-less", async () => {
        const book = makeBook({ book_id: 27 });
        const r = await runGetBook(makeCatalog(book, /* onDisk */ true), makePages(true, 0), makeHelper(), {
            book_id: 27,
            response_format: "json",
        });

        expect(r.structuredContent.content_status).toBe("downloaded_no_pages");
        const notes = r.structuredContent.notes.join(" | ");
        expect(notes).toContain("image/scan-only");
        expect(notes).not.toContain("not on disk");
    });

    it("warns that a book downloaded mid-session is not readable yet", async () => {
        // Its text lives in Shamela's Lucene index, which the helper opened at
        // startup — so the catalog knows the book while the reader does not.
        const book = makeBook({ book_id: 30004 });
        const r = await runGetBook(
            makeCatalog(book, /* onDisk */ true, /* sessionDiscovered */ true),
            makePages(true, 2012),
            makeHelper(),
            { book_id: 30004, response_format: "json" },
        );

        expect(r.structuredContent.content_status).toBe("readable");
        expect(r.structuredContent.notes.join(" | ")).toContain("downloaded during this session");
    });
});
