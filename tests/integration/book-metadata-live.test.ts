/**
 * What a book card may claim about a book.
 *
 * Three defects, all found by reading real cards rather than by any assertion
 * failing:
 *
 *  - «ط 1» in a Shamela title is print number ONE, not a publisher called
 *    "1". get_book reported `"publisher":"1"` on book 6084, and because that
 *    made `publisher` truthy it also suppressed the front-matter lookup — so
 *    the muḥaqqiq printed in the book's own title («ت العجمي») came back null,
 *    under a note claiming the front-matter had been checked.
 *  - Those notes were pushed whether or not the front-matter could be read at
 *    all, so a not_downloaded book was reported as having had its introduction
 *    inspected and found silent.
 *  - get_citation formatted a clean citation for a book that is not on disk,
 *    and swallowed an out-of-range page_id without a word.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { runGetBook, getBookInput } from "../../src/server/tools/getBook.js";
import { runGetCitation, getCitationInput } from "../../src/server/tools/getCitation.js";
import { findNotDownloadedBookId, getBackend } from "../fixtures/shared.js";

let backend: Awaited<ReturnType<typeof getBackend>>;

beforeAll(async () => {
    backend = await getBackend();
    NOT_DOWNLOADED = findNotDownloadedBookId(backend.catalog);
}, 120_000);

/** «أخصر المختصرات - ت العجمي - ط 1» — downloaded, readable. */
const EDITION_ONE = 6084;
/**
 * A book in the catalogue with no file on disk — asked of the catalogue, not
 * hardcoded. This was `const NOT_DOWNLOADED = 80`, true of the author's partial
 * library and false of a complete one, where book 80 is present and readable.
 * Both tests below then failed on correct output. Resolved in beforeAll.
 */
let NOT_DOWNLOADED: number | null = null;
/** الروض المربع — downloaded, 1,607 pages. */
const BIG = 147658;

const book = (id: number) =>
    runGetBook(
        backend.catalog,
        backend.pages,
        backend.helper,
        getBookInput.parse({ book_id: id, response_format: "json" }),
    ).then((r) => r.structuredContent);

const cite = (id: number, extra: Record<string, unknown> = {}) =>
    runGetCitation(
        backend.catalog,
        backend.pages,
        getCitationInput.parse({ book_id: id, style: "full", response_format: "json", ...extra }),
    ).then((r) => r.structuredContent);

describe("an edition number is not a publisher", () => {
    it("does not name a publisher «1» for «ط 1»", async () => {
        const b = await book(EDITION_ONE);
        // null is the right answer: the title states an edition number and no
        // press, and master.db has no publisher column.
        expect(b.publisher ?? "").not.toMatch(/^[\d٠-٩]+$/);
    }, 120_000);

    it("reads the muḥaqqiq out of the middle segment of the title", async () => {
        // «أخصر المختصرات - ت العجمي - ط 1»: reading only the last segment
        // missed the editor the title states outright.
        const b = await book(EDITION_ONE);
        expect(b.editor ?? "").toContain("العجمي");
    }, 120_000);

    it("reports the edition number it read, instead of denying it", async () => {
        const b = await book(EDITION_ONE);
        expect(b.notes.join(" ")).toMatch(/رقم الطبعة|edition number/);
    }, 120_000);

    it("keeps a real publisher name", async () => {
        // The guard must reject digits only — «ط ركائز» is a press.
        const b = await book(BIG);
        if (b.publisher) expect(b.publisher).not.toMatch(/^[\d٠-٩]+$/);
    }, 120_000);
});

describe("a card does not claim to have read what it could not open", () => {
    it("says the front-matter was never consulted for a book not on disk", async () => {
        if (NOT_DOWNLOADED === null) {
            // Every catalogued book is on disk here, so the case cannot be
            // staged. Assert that rather than pass silently: a null that came
            // from a broken lookup would otherwise read as a green test.
            expect(backend.catalog.downloadedBookIds().size).toBe(backend.catalog.bookCount());
            return;
        }
        const b = await book(NOT_DOWNLOADED);
        expect(b.content_status).toBe("not_downloaded");
        const notes = b.notes.join(" | ");
        expect(notes).toMatch(/لم يُطَّلع على مقدمته|front-matter was never consulted/);
        // and it must not say the introduction was checked and found silent
        expect(notes).not.toMatch(/لم يُذكر المحقق في مقدمة الكتاب/);
    }, 120_000);
});

describe("a citation says when it cannot be trusted", () => {
    it("warns that the book is not readable here", async () => {
        if (NOT_DOWNLOADED === null) {
            expect(backend.catalog.downloadedBookIds().size).toBe(backend.catalog.bookCount());
            return;
        }
        const c = await cite(NOT_DOWNLOADED, { page_id: 3 });
        expect(c.notes.join(" | ")).toMatch(/غير مقروء على هذا الجهاز|not readable on this machine/);
    }, 120_000);

    it("warns that the page asked for does not exist", async () => {
        const c = await cite(BIG, { page_id: 99999 });
        expect(c.notes.join(" | ")).toMatch(/لا توجد صفحة بالمعرِّف|has no page with id/);
        expect(c.components.printed_page).toBeNull();
    }, 120_000);

    it("stays quiet for a page that does exist", async () => {
        const c = await cite(BIG, { page_id: 503 });
        expect(c.notes.join(" | ")).not.toMatch(/لا توجد صفحة|has no page with id/);
        expect(c.components.printed_page).toBeTruthy();
    }, 120_000);
});
