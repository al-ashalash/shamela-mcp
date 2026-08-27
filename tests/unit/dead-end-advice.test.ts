/**
 * Advice that cannot be followed.
 *
 * Three separate places told the reader to do something that could not work.
 * None of them failed anything: the field was populated, the sentence was
 * grammatical, the call returned. They are only visible by reading what the
 * tool actually says and asking whether doing it would help.
 */

import { describe, it, expect } from "vitest";

import { getPageLabels } from "../../src/server/i18n/tools/getPage.js";
import { getBookSectionLabels } from "../../src/server/i18n/tools/getBookSection.js";
import { getTafseerTextsLabels } from "../../src/server/i18n/tools/getTafseerTexts.js";

describe("get_page never points past the last part", () => {
    // On the last part `nextBodyPart` fell back to the CURRENT part, so the
    // advice read «ولجلب التالي استخدم body_part=2» while you were on part 2 —
    // and following it returns the same page, for ever.
    it("offers the next part only when there is one", () => {
        for (const lang of ["ar", "en"] as const) {
            const L = getPageLabels[lang];
            const middle = L.longBody("3", "2", "3", 3);
            expect(middle, lang).toContain("body_part=3");

            const last = L.longBody("3", "3", null, 3);
            expect(last, lang).not.toContain("body_part=");
        }
    });

    it("says the part in hand is the last one", () => {
        expect(getPageLabels.ar.longBody("2", "2", null, 2)).toContain("الأخير");
        expect(getPageLabels.en.longBody("2", "2", null, 2)).toContain("the last");
    });

    it("still names where the hashiya went, in both branches", () => {
        for (const lang of ["ar", "en"] as const) {
            expect(getPageLabels[lang].longBody("2", "1", "2", 2), lang).toMatch(/الحاشية|hashiya/);
            expect(getPageLabels[lang].longBody("2", "2", null, 2), lang).toMatch(/الحاشية|hashiya/);
        }
    });
});

describe("get_book_section does not offer a knob that changes nothing", () => {
    // The budget trim runs AFTER the max_pages slice, so raising max_pages
    // returns the identical response. Measured: max_pages 30 and max_pages 100
    // both returned the same 9 pages, the same next_start_page_id, the same
    // _display — under advice to raise max_pages.
    it("omits max_pages when the size budget did the cutting", () => {
        for (const lang of ["ar", "en"] as const) {
            const L = getBookSectionLabels[lang];
            expect(L.trimmedByBudget("9", "55", "585"), lang).not.toContain("max_pages");
            expect(L.trimmedByBudget("9", "55", "585"), lang).toContain("585");
        }
    });

    it("keeps offering it where raising it genuinely helps", () => {
        for (const lang of ["ar", "en"] as const) {
            expect(getBookSectionLabels[lang].trimmedByMaxPages("9", "55", "585"), lang).toContain(
                "max_pages",
            );
        }
    });
});

describe("get_tafseer_texts does not invite browsing a book that does not exist", () => {
    // An id master.db has never heard of came back as a source named
    // «(unknown 99999)» under «وليس ذلك دليلًا على خلوّه من تفسيرها، فتصفَّحه بـ
    // shamela_get_toc» — asserting that a nonexistent work may still comment on
    // the verse, and sending the reader to a call that can only fail.
    it("has a note for an id that names no book", () => {
        for (const lang of ["ar", "en"] as const) {
            const note = getTafseerTextsLabels[lang].statusNote.notFound;
            expect(note, lang).toBeTruthy();
            expect(note, lang).toMatch(/shamela_resolve|shamela_search_books/);
            // and it must not repeat the sentence that caused the problem
            expect(note, lang).not.toMatch(/get_toc/);
        }
    });

    it("keeps the browse-it advice for a book that is real but unplaced", () => {
        // There the advice is right: the book exists, and its table of contents
        // is exactly where a reader would look next.
        for (const lang of ["ar", "en"] as const) {
            expect(getTafseerTextsLabels[lang].statusNote.notIndexed, lang).toContain("get_toc");
        }
    });
});

describe("an opaque field is named, not half-parsed", () => {
    // Peer lesson (tafsir-mcp): when code deliberately does not interpret a
    // raw payload, say so and say what the format is — a half-parse that looks
    // authoritative is worse than an honest hand-over.
    it("get_page_services explains the raw services blob in both languages", async () => {
        const { getPageServicesLabels } = await import(
            "../../src/server/i18n/tools/getPageServices.js"
        );
        for (const lang of ["ar", "en"] as const) {
            const note = getPageServicesLabels[lang].rawNote;
            expect(note, lang).toBeTruthy();
            expect(note, lang).toContain("raw");
            // It must say the meaning comes from Shamela's own convention…
            expect(note, lang).toMatch(/الشاملة|Shamela/);
            // …and warn against building on it.
            expect(note, lang).toMatch(/لا يُبنى عليه|do not build/);
        }
    });
});
