/**
 * A citation a reader cannot check is a citation taken on trust.
 *
 * Peer tools (Dalail) emit a canonical shamela.ws address with every hit, so a
 * researcher can open the passage and verify it. We can do the same with more
 * honesty than they do — the address is composed locally from Shamela's own
 * ids, nothing fetches it, and when no page was established the answer says so
 * instead of quietly pointing at the book as though it were the page.
 */

import { describe, it, expect } from "vitest";

import type { AuthorRecord, BookRecord } from "../../src/server/catalog.js";
import { buildComponents, type PageRef } from "../../src/server/citation.js";

function makeBook(over: Partial<BookRecord> = {}): BookRecord {
    return {
        book_id: 9942,
        book_name: "الأصول من علم الأصول",
        book_category: 17,
        book_type: 0,
        book_date: 1410,
        authors_csv: "57",
        main_author: 57,
        printed: 1,
        group_id: null,
        hidden: 0,
        major_online: 1,
        minor_online: 0,
        major_ondisk: 1,
        minor_ondisk: 0,
        pdf_links: null,
        meta_data: null,
        parent: null,
        ...over,
    } as BookRecord;
}
const author = { author_id: 57, author_name: "العثيمين", death_year: 1421, death_text: "" } as AuthorRecord;

/** page_id 17, printed as page 12 — deliberately different numbers. */
const PAGE: PageRef = { page_id: 17, part: null, page: 12 };

describe("every citation carries a checkable address", () => {
    it("addresses the page by page_id, not by the printed page", () => {
        // They are two different numbers under one word; routing on the printed
        // one would open a different place in the book.
        const c = buildComponents(makeBook(), author, PAGE);
        expect(c.source_url).toBe("https://shamela.ws/book/9942/17");
        expect(c.source_url).not.toContain("/12");
        expect(c.source_url_is_book_level).toBe(false);
    });

    it("falls back to the book, and says that is what it did", () => {
        const c = buildComponents(makeBook(), author);
        expect(c.source_url).toBe("https://shamela.ws/book/9942");
        expect(c.source_url_is_book_level).toBe(true);
    });

    it("uses the same host as the download-guidance links", async () => {
        // One constant, so the two surfaces cannot drift into two link shapes.
        const { SHAMELA_WEB } = await import("../../src/server/constants.js");
        expect(buildComponents(makeBook(), author, PAGE).source_url.startsWith(SHAMELA_WEB)).toBe(true);
    });

    it("is a string only — composing an address is not fetching one", () => {
        // The extension makes no network request of any kind; the reader's
        // browser is what would open this.
        const c = buildComponents(makeBook(), author, PAGE);
        expect(typeof c.source_url).toBe("string");
    });
});
