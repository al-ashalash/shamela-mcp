/**
 * Stage-A minors: small lies and dead ends, each measured live before fixing.
 *
 *  - get_aya's range error quoted 1..6236 for a surah+aya pair, inviting a
 *    retry with a verse number that can never be valid for that surah.
 *  - list_categories with include_counts=false asserted book_count: 0 for
 *    categories holding hundreds of books.
 *  - root_stats leaked scope_count: -1 into the payload on unscoped calls.
 *  - get_books_for_hadith blamed the key when the whole service index was
 *    empty, sending the reader through keys that must all fail alike.
 *  - get_citation's full-style notes were half English under Arabic.
 */

import { describe, it, expect } from "vitest";

import { ayaOutOfSurah, serviceEmpty } from "../../src/server/errors.js";
import { getCitationLabels } from "../../src/server/i18n/tools/getCitation.js";
import { formatFullCitation } from "../../src/server/citation.js";
import type { AuthorRecord, BookRecord } from "../../src/server/catalog.js";

describe("ayaOutOfSurah bounds the argument that failed", () => {
    it("quotes the surah's own verse count, not 6236", () => {
        const e = ayaOutOfSurah(108, 5);
        expect(e.message).toContain("has 3 ayat (1..3)");
        expect(e.message).toContain("الكوثر");
        expect(e.message).not.toContain("6236");
    });

    it("says a surah out of 1..114 is the problem when it is", () => {
        const e = ayaOutOfSurah(200, 1);
        expect(e.message).toContain("surahs are 1..114");
    });
});

describe("serviceEmpty blames the index, not the key", () => {
    it("says the whole service is empty and what to do", () => {
        const e = serviceEmpty("hadeeth");
        // The message must not name a key: no key is the problem.
        expect(e.message).toMatch(/فارغ|empty/);
        expect(e.message).toContain("hadeeth");
        expect(e.message).toMatch(/نزِّل|Download/);
    });
});

describe("the citation slices translate every full-style note key", () => {
    it("covers every key in both languages, no English under Arabic", () => {
        const book = {
            book_id: 1,
            book_name: "كتاب",
            book_category: 1,
            book_type: 1,
            book_date: null,
            authors_csv: null,
            main_author: null,
            printed: 1,
            group_id: null,
            hidden: 0,
            major_online: 0,
            minor_online: 0,
            major_ondisk: 1,
            minor_ondisk: 0,
            pdf_links: null,
            meta_data: null,
            parent: null,
        } as unknown as BookRecord;
        const keys = formatFullCitation(book, null as unknown as AuthorRecord | null).notes;
        expect(keys.length).toBeGreaterThan(0);
        for (const key of keys) {
            const arText = getCitationLabels.ar.fullNotes[key];
            const enText = getCitationLabels.en.fullNotes[key];
            expect(arText, key).toBeTruthy();
            expect(enText, key).toBeTruthy();
            // The Arabic sentence must actually be Arabic (master.db and
            // book_date are names and may stay Latin).
            expect(arText, key).toMatch(/[ء-ي]/);
        }
    });
});
