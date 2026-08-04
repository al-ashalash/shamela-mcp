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

function makeCatalog(book: BookRecord): Catalog {
    // Minimal stub satisfying only the methods runGetBook calls.
    return {
        bookRecord: vi.fn((id: number) => (id === book.book_id ? book : undefined)),
        bookAuthors: vi.fn((_b: BookRecord): AuthorRecord[] => []),
        categoryPath: vi.fn((_c: number | null) => ["الفقه"]),
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

describe("Bug #3 — get_book.downloaded must reflect actual content, not just master.db flag", () => {
    it("reports downloaded=false when master.db says downloaded but per-book DB has no pages", async () => {
        const book = makeBook({ book_id: 27 });
        const catalog = makeCatalog(book);
        const pages = makePages(/* fileOnDisk */ true, /* pageCount */ 0);

        const r = await runGetBook(catalog, pages, makeHelper(), {
            book_id: 27,
            response_format: "json",
        });

        expect(r.structuredContent.downloaded).toBe(false);
        expect(pages.pageCount).toHaveBeenCalledWith(27);
    });

    it("reports downloaded=true when both master.db says downloaded and per-book DB has pages", async () => {
        const book = makeBook({ book_id: 9942 });
        const catalog = makeCatalog(book);
        const pages = makePages(/* fileOnDisk */ true, /* pageCount */ 12);

        const r = await runGetBook(catalog, pages, makeHelper(), {
            book_id: 9942,
            response_format: "json",
        });

        expect(r.structuredContent.downloaded).toBe(true);
    });

    it("reports downloaded=false when master.db says NOT downloaded (skips the disk check)", async () => {
        const book = makeBook({ book_id: 9999, major_ondisk: 0 });
        const catalog = makeCatalog(book);
        const pages = makePages(/* fileOnDisk */ true, /* pageCount */ 12); // shouldn't matter

        const r = await runGetBook(catalog, pages, makeHelper(), {
            book_id: 9999,
            response_format: "json",
        });

        expect(r.structuredContent.downloaded).toBe(false);
        // The per-book DB lookup should be skipped to avoid pointless disk hits.
        expect(pages.hasBook).not.toHaveBeenCalled();
        expect(pages.pageCount).not.toHaveBeenCalled();
    });
});

describe("get_book advice separates a missing file from a page-less file", () => {
    it("names an interrupted download / moved folder when the file is absent", async () => {
        const pages = makePages(/* fileOnDisk */ false);
        const r = await runGetBook(makeCatalog(makeBook({ book_id: 9 })), pages, makeHelper(), {
            book_id: 9,
            response_format: "json",
        });

        expect(r.structuredContent.content_status).toBe("downloaded_no_pages");
        const notes = r.structuredContent.notes.join(" | ");
        expect(notes).toContain("not on disk");
        // The old wording blamed image/scan-only books for what is a missing file.
        expect(notes).not.toContain("image/scan-only");
    });

    it("names an image/scan-only title when the file is present but page-less", async () => {
        const pages = makePages(/* fileOnDisk */ true, /* pageCount */ 0);
        const r = await runGetBook(makeCatalog(makeBook({ book_id: 27 })), pages, makeHelper(), {
            book_id: 27,
            response_format: "json",
        });

        expect(r.structuredContent.content_status).toBe("downloaded_no_pages");
        const notes = r.structuredContent.notes.join(" | ");
        expect(notes).toContain("image/scan-only");
        expect(notes).not.toContain("not on disk");
    });
});
