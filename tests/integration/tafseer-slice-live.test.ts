/**
 * The two misattributions the 15 Aug 2026 sweep found, against the real books.
 *
 * These cannot be unit-tested: the page text comes out of Shamela's Lucene
 * index on the maintainer's own machine, and no fixture substitutes for it.
 * That is exactly why they shipped — the 600-test suite could not see them.
 *
 * Both assert the same thing from opposite index sources: the text returned
 * for a verse must be the commentary on THAT verse, not on the passage above
 * it. Skipped, with a reason, when the anchor book is not downloaded.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { runGetTafseerTexts, getTafseerTextsInput } from "../../src/server/tools/getTafseerTexts.js";
import { getBackend } from "../fixtures/shared.js";

/** ابن كثير — placed from the book's own chapter markers. */
const IBN_KATHIR = 23604;
/** الطبري — placed from Shamela's curated table. */
const TABARI = 7798;

let backend: Awaited<ReturnType<typeof getBackend>>;

beforeAll(async () => {
    backend = await getBackend();
}, 120_000);

async function fetchOne(bookId: number, surah: number, aya: number) {
    const args = getTafseerTextsInput.parse({
        surah,
        aya,
        book_ids: [bookId],
        response_format: "json",
    });
    const r = await runGetTafseerTexts(
        backend.helper,
        backend.catalog,
        backend.services,
        backend.pages,
        backend.ayaIndex,
        args,
    );
    return r.structuredContent.sources.find((s) => s.book_id === bookId);
}

describe("a fetched tafsir begins at its own verse", () => {
    it("108:2 from ابن كثير carries al-Kawthar, not the end of al-Ma'un", async () => {
        const src = await fetchOne(IBN_KATHIR, 108, 2);
        if (!src || !src.text) {
            console.warn(`skipped: book ${IBN_KATHIR} not readable on this machine`);
            return;
        }
        // The defect: page 3918 is entirely the commentary on سورة الماعون,
        // ending at the bare heading of سورة الكوثر. It was returned whole.
        expect(src.text).not.toContain("آخر تفسير سورة الماعون");
        expect(src.text_starts_at_verse).toBe(true);
        // And the heading alone is not an answer — the commentary must be there.
        expect(src.text.length).toBeGreaterThan(400);
    }, 120_000);

    it("2:255 from الطبري carries آية الكرسي, not the tafsir of 2:254", async () => {
        const src = await fetchOne(TABARI, 2, 255);
        if (!src || !src.text) {
            console.warn(`skipped: book ${TABARI} not readable on this machine`);
            return;
        }
        // This one came from Shamela's own table, which carries no title id —
        // so the marker has to be parsed off the page's own headings.
        expect(src.text).not.toContain("وَالْكَافِرُونَ هُمُ الظَّالِمُونَ");
        expect(src.text_starts_at_verse).toBe(true);
        expect(src.text.length).toBeGreaterThan(400);
    }, 120_000);

    it("calls al-Kawthar a group placement, and says so in the rendered text", async () => {
        // Both ابن كثير and البغوي head the whole sura «[سورة الكوثر (١٠٨):
        // الآيات ١ إلى ٣]». Every verse of it used to come back as an exact
        // placement at confidence "high": the surah-density rule that decided
        // `group` cannot fire for a surah of three verses.
        const args = getTafseerTextsInput.parse({
            surah: 108,
            aya: 2,
            book_ids: [IBN_KATHIR],
            response_format: "markdown",
        });
        const r = await runGetTafseerTexts(
            backend.helper,
            backend.catalog,
            backend.services,
            backend.pages,
            backend.ayaIndex,
            args,
        );
        const src = r.structuredContent.sources.find((s) => s.book_id === IBN_KATHIR);
        if (!src || !src.text) {
            console.warn(`skipped: book ${IBN_KATHIR} not readable on this machine`);
            return;
        }
        expect(src.status).toBe("ok_group");
        expect(r.content[0]!.text).toContain("يغطي مجموعة آيات");
    }, 120_000);

    it("says so when it ran on to the following page", async () => {
        // A marker at the foot of its page means the commentary is on the next
        // one; a citation taken from the tail of the text belongs there, and
        // the answer has to say which page it came from.
        const src = await fetchOne(IBN_KATHIR, 108, 2);
        if (!src || !src.text) return;
        if (src.continued_from_page_id !== null) {
            expect(src.continued_from_page_id).toBe(src.page_id);
            expect(src.note ?? "").toMatch(/الصفحة|page/);
        }
    }, 120_000);
});
