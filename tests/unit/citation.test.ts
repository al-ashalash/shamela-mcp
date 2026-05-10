import { describe, it, expect } from "vitest";

import type { AuthorRecord, BookRecord } from "../../src/server/catalog.js";
import {
    buildComponents,
    formatFullCitation,
    formatShamelaCitation,
    formatShortCitation,
    type PageRef,
} from "../../src/server/citation.js";

// --- Fixture builders -------------------------------------------------------

function makeBook(overrides: Partial<BookRecord> = {}): BookRecord {
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
        ...overrides,
    };
}

function makeAuthor(overrides: Partial<AuthorRecord> = {}): AuthorRecord {
    return {
        author_id: 57,
        author_name: "محمد بن صالح العثيمين",
        death_year: 1421,
        death_text: "1421هـ",
        ...overrides,
    };
}

const PAGE_17: PageRef = { page_id: 17, part: null, page: 17 };
const PAGE_VOL: PageRef = { page_id: 285, part: "5", page: 285 };

// --- buildComponents --------------------------------------------------------

describe("buildComponents", () => {
    it("populates the standard fields from book + author + page", () => {
        const c = buildComponents(makeBook(), makeAuthor(), PAGE_17);
        expect(c.book_id).toBe(9942);
        expect(c.book_name).toBe("الأصول من علم الأصول");
        expect(c.author_id).toBe(57);
        expect(c.author_name).toBe("محمد بن صالح العثيمين");
        expect(c.death_year).toBe(1421);
        expect(c.book_date).toBe(1410);
        expect(c.part).toBeNull();
        expect(c.printed_page).toBe("17");
        expect(c.auto_numbered).toBe(false);
    });

    it("falls back to book.main_author when author is null", () => {
        const c = buildComponents(makeBook(), null, PAGE_17);
        expect(c.author_id).toBe(57);
        expect(c.author_name).toBeNull();
        expect(c.death_year).toBeNull();
    });

    it("treats part='الكتاب' as null (placeholder for single-volume books)", () => {
        const c = buildComponents(makeBook(), makeAuthor(), {
            page_id: 1,
            part: "الكتاب",
            page: 1,
        });
        expect(c.part).toBeNull();
    });

    it("treats whitespace-only part as null", () => {
        const c = buildComponents(makeBook(), makeAuthor(), {
            page_id: 1,
            part: "   ",
            page: 1,
        });
        expect(c.part).toBeNull();
    });

    it("uses meta_data.prefix as book name (with «» stripped) when present", () => {
        const c = buildComponents(
            makeBook({ meta_data: { prefix: "«شرح» الأصول" } }),
            makeAuthor(),
            PAGE_17,
        );
        expect(c.book_name).toBe("شرح الأصول");
    });

    it("auto_numbered is true when book.printed != 1", () => {
        expect(buildComponents(makeBook({ printed: 0 }), makeAuthor(), PAGE_17).auto_numbered).toBe(true);
        expect(buildComponents(makeBook({ printed: 2 }), makeAuthor(), PAGE_17).auto_numbered).toBe(true);
    });
});

// --- formatShamelaCitation --------------------------------------------------

describe("formatShamelaCitation", () => {
    it("single-volume printed book returns prefix only when text is omitted", () => {
        const result = formatShamelaCitation(makeBook(), makeAuthor(), PAGE_17);
        expect(result).toBe("«الأصول من علم الأصول» (ص ١٧)");
    });

    it("returns prefix + body when text is provided", () => {
        const result = formatShamelaCitation(
            makeBook(),
            makeAuthor(),
            PAGE_17,
            "الكلام لغة...",
        );
        expect(result).toBe('«الأصول من علم الأصول» (ص ١٧):\n«الكلام لغة...»');
    });

    it("multi-volume book formats as part/ page", () => {
        const result = formatShamelaCitation(
            makeBook({ book_name: "شرح مختصر الكرخي" }),
            makeAuthor(),
            PAGE_VOL,
            "وقد قالوا...",
        );
        expect(result).toBe('«شرح مختصر الكرخي» (٥/ ٢٨٥):\n«وقد قالوا...»');
    });

    it("returns book name only when neither part nor page is available", () => {
        const result = formatShamelaCitation(makeBook(), makeAuthor());
        expect(result).toBe("«الأصول من علم الأصول»");
    });

    it("converts Western digits to Arabic-Indic in the page label", () => {
        const result = formatShamelaCitation(makeBook(), makeAuthor(), {
            page_id: 1,
            page: 1234,
        });
        expect(result).toContain("ص ١٢٣٤");
    });

    it("appends auto-numbering marker when book.printed != 1", () => {
        const result = formatShamelaCitation(
            makeBook({ printed: 0 }),
            makeAuthor(),
            PAGE_17,
        );
        expect(result).toContain("بترقيم الشاملة آليا");
    });

    it("appends meta_data.suffix when present", () => {
        const result = formatShamelaCitation(
            makeBook({ meta_data: { suffix: "(الطبعة الأولى)" } }),
            makeAuthor(),
            PAGE_17,
        );
        expect(result).toContain("(الطبعة الأولى)");
    });
});

// --- formatShortCitation ----------------------------------------------------

describe("formatShortCitation", () => {
    it("produces author، book، ص page", () => {
        const result = formatShortCitation(makeBook(), makeAuthor(), PAGE_17);
        expect(result).toBe("محمد بن صالح العثيمين، الأصول من علم الأصول، ص ١٧.");
    });

    it("includes ج part for multi-volume books", () => {
        const result = formatShortCitation(
            makeBook({ book_name: "شرح مختصر الكرخي" }),
            makeAuthor(),
            PAGE_VOL,
        );
        expect(result).toBe("محمد بن صالح العثيمين، شرح مختصر الكرخي، ج ٥، ص ٢٨٥.");
    });

    it("omits author when null", () => {
        const result = formatShortCitation(makeBook(), null, PAGE_17);
        expect(result).toBe("الأصول من علم الأصول، ص ١٧.");
    });

    it("omits page when not provided", () => {
        const result = formatShortCitation(makeBook(), makeAuthor());
        expect(result).toBe("محمد بن صالح العثيمين، الأصول من علم الأصول.");
    });
});

// --- formatFullCitation -----------------------------------------------------

describe("formatFullCitation", () => {
    it("includes author with death year + book name + book_date + page", () => {
        const result = formatFullCitation(makeBook(), makeAuthor(), PAGE_17);
        expect(result.formatted).toContain("محمد بن صالح العثيمين");
        expect(result.formatted).toContain("ت ١٤٢١هـ");
        expect(result.formatted).toContain("الأصول من علم الأصول");
        expect(result.formatted).toContain("١٤١٠هـ");
        expect(result.formatted).toContain("ص ١٧");
    });

    it("returns components alongside the formatted string", () => {
        const result = formatFullCitation(makeBook(), makeAuthor(), PAGE_17);
        expect(result.components.book_id).toBe(9942);
        expect(result.components.author_name).toBe("محمد بن صالح العثيمين");
        expect(result.components.death_year).toBe(1421);
    });

    it("always lists missing publisher / edition / city / editor in notes", () => {
        const result = formatFullCitation(makeBook(), makeAuthor(), PAGE_17);
        expect(result.notes).toContain("edition number not available in master.db");
        expect(result.notes).toContain("publisher not available in master.db");
        expect(result.notes).toContain("city of publication not available in master.db");
        expect(result.notes).toContain("editor / muḥaqqiq not available in master.db");
    });

    it("flags missing author when author is null", () => {
        const result = formatFullCitation(makeBook(), null, PAGE_17);
        expect(result.notes.some((n) => n.includes("author name"))).toBe(true);
    });

    it("flags missing death year when author has no death_year", () => {
        const result = formatFullCitation(
            makeBook(),
            makeAuthor({ death_year: null }),
            PAGE_17,
        );
        expect(result.notes.some((n) => n.includes("death year"))).toBe(true);
    });

    it("flags missing book composition year when book_date is null", () => {
        const result = formatFullCitation(
            makeBook({ book_date: null }),
            makeAuthor(),
            PAGE_17,
        );
        expect(result.notes.some((n) => n.includes("book composition year"))).toBe(true);
    });

    it("never fabricates publisher or edition values", () => {
        const result = formatFullCitation(makeBook(), makeAuthor(), PAGE_17);
        expect(result.formatted).not.toMatch(/دار /);
        expect(result.formatted).not.toMatch(/الطبعة /);
    });
});
