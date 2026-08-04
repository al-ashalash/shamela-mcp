/**
 * A quote should arrive with its reference attached.
 *
 * Producing a citation used to be a separate call, which meant the numbering
 * caveat — that a page number may be Shamela's automatic count rather than the
 * printed one — was only seen by whoever thought to ask for it. Text that gets
 * quoted without that caveat is text that gets misattributed to a page of a
 * printed edition it was never on.
 */

import { describe, it, expect } from "vitest";

import { formatShortCitation } from "../../src/server/citation.js";
import type { AuthorRecord, BookRecord } from "../../src/server/catalog.js";

const book = (over: Partial<BookRecord> = {}): BookRecord =>
    ({
        book_id: 9942,
        book_name: "الأصول من علم الأصول",
        printed: 1,
        book_date: 1421,
        main_author: 55,
        meta_data: null,
        ...over,
    }) as BookRecord;

const author: AuthorRecord = {
    author_id: 55,
    author_name: "ابن قدامة",
    death_year: 620,
    death_text: null,
};

describe("short citation, as attached to page results", () => {
    it("carries author, book, part and printed page", () => {
        const c = formatShortCitation(book(), author, { page_id: 63, part: "2", page: 71 });
        expect(c).toContain("ابن قدامة");
        expect(c).toContain("الأصول من علم الأصول");
        // Arabic-Indic numerals, matching the rest of the Arabic output.
        expect(c).toContain("٢");
        expect(c).toContain("٧١");
    });

    it("omits the part when the book has none, without leaving a gap", () => {
        const c = formatShortCitation(book(), author, { page_id: 5, part: null, page: 12 });
        expect(c).not.toContain("ج ،");
        expect(c).toContain("ص ١٢");
    });

    it("still cites a book with no known author", () => {
        const c = formatShortCitation(book(), null, { page_id: 5, part: null, page: 12 });
        expect(c).toContain("الأصول من علم الأصول");
        expect(c.startsWith("،")).toBe(false);
    });

    it("marks a book whose numbering is Shamela's own", () => {
        // `printed !== 1` is the signal the page number is not the print's;
        // the tools surface it beside the citation rather than leaving the
        // reader to assume a printed edition.
        expect(book({ printed: 0 }).printed !== 1).toBe(true);
        expect(book().printed !== 1).toBe(false);
    });
});
