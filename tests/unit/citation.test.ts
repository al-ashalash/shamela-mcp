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
    it("includes author with death year + book name + page", () => {
        const result = formatFullCitation(makeBook(), makeAuthor(), PAGE_17);
        expect(result.formatted).toContain("محمد بن صالح العثيمين");
        expect(result.formatted).toContain("ت ١٤٢١هـ");
        expect(result.formatted).toContain("الأصول من علم الأصول");
        expect(result.formatted).toContain("ص ١٧");
    });

    it("never prints book_date as the work's date", () => {
        // book_date is not a composition year: on the real catalogue it equals
        // the main author's death year for 8,467 of 8,593 books, and for the
        // rest it is the ORIGINAL author's. Printed bare it produced citations
        // that contradicted themselves in one line — «ناصر الدين الألباني
        // (ت ١٤٢٠هـ). صحيح الترغيب والترهيب. ٦٥٦هـ.» — and «أبو عبد الله
        // الفاكهي (ت ٢٧٢هـ) … ٢٧٣هـ.», written a year after its author died.
        const abridgement = formatFullCitation(
            makeBook({ book_name: "صحيح الترغيب والترهيب", book_date: 656 }),
            makeAuthor({ author_name: "ناصر الدين الألباني", death_year: 1420 }),
            PAGE_17,
        );
        expect(abridgement.formatted).not.toContain("٦٥٦هـ");
        expect(abridgement.formatted).toContain("ت ١٤٢٠هـ"); // the author's own year stays
        // and the value is still available to a caller who knows what it is
        expect(abridgement.components.book_date).toBe(656);
    });

    it("never prints the undated sentinel, whatever reaches it", () => {
        // Belt to the loader's braces: 99999 is normalised to null in
        // Catalog.loadBooks, and it is not printed here either way.
        const result = formatFullCitation(
            makeBook({ book_date: 99999 }),
            makeAuthor(),
            PAGE_17,
        );
        expect(result.formatted).not.toContain("٩٩٩٩٩");
    });

    it("returns components alongside the formatted string", () => {
        const result = formatFullCitation(makeBook(), makeAuthor(), PAGE_17);
        expect(result.components.book_id).toBe(9942);
        expect(result.components.author_name).toBe("محمد بن صالح العثيمين");
        expect(result.components.death_year).toBe(1421);
    });

    // Notes are typed KEYS now, translated at the tool layer. They were built
    // here as English sentences, so the tool's notes arrived half Arabic and
    // half English under the default interface — and the tool de-duplicated
    // them by regex-matching the TEXT, which any translation would have
    // silently broken.
    it("always lists missing publisher / edition / city / editor in notes", () => {
        const result = formatFullCitation(makeBook(), makeAuthor(), PAGE_17);
        for (const key of ["no_edition_number", "no_publisher", "no_city", "no_editor"] as const) {
            expect(result.notes).toContain(key);
        }
    });

    it("flags missing author when author is null", () => {
        const result = formatFullCitation(makeBook(), null, PAGE_17);
        expect(result.notes).toContain("no_author_name");
    });

    it("flags missing death year when author has no death_year", () => {
        const result = formatFullCitation(
            makeBook(),
            makeAuthor({ death_year: null }),
            PAGE_17,
        );
        expect(result.notes).toContain("no_death_year");
    });

    it("says the composition year is unavailable on every citation", () => {
        // Unconditional: master.db has no composition year for ANY book — the
        // sentence for this key names book_date as Shamela's dating stamp.
        for (const book of [makeBook(), makeBook({ book_date: null })]) {
            expect(formatFullCitation(book, makeAuthor(), PAGE_17).notes).toContain(
                "no_composition_year",
            );
        }
    });

    it("never fabricates publisher or edition values", () => {
        const result = formatFullCitation(makeBook(), makeAuthor(), PAGE_17);
        expect(result.formatted).not.toMatch(/دار /);
        expect(result.formatted).not.toMatch(/الطبعة /);
    });
});
