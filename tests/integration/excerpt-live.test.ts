/**
 * Reading a known phrase in its sentence, on the real library.
 *
 * Borrowed from turath-mcp's locate_in_page: a researcher who already knows the
 * wording should not have to walk `body_part` slices of a long page hunting for
 * it — and risk finding it split across the seam between two of them.
 *
 * The honesty conditions are ours: the reader is told the body is a WINDOW, and
 * a phrase that is not on the page returns the whole body with found:false
 * rather than an approximate window, which would be a misquotation with a page
 * number attached.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { runGetPage, getPageInput } from "../../src/server/tools/getPage.js";
import { FIXTURE_BOOK_ID, getBackend } from "../fixtures/shared.js";

/**
 * `count` consecutive words of `body`, starting at word `from`.
 *
 * Contiguous on purpose: an earlier draft built its needle from words filtered
 * by LENGTH, which dropped the short words between them — «القياس لغة: التقدير»
 * became «القياس التقدير» — and then asked the tool to find a phrase the page
 * does not contain. The tool was right to refuse; the test was wrong.
 */
function contiguous(body: string, count: number, from: number): string {
    return body.split(/\s+/).filter(Boolean).slice(from, from + count).join(" ");
}

let backend: Awaited<ReturnType<typeof getBackend>>;

beforeAll(async () => {
    backend = await getBackend();
}, 120_000);

const page = (extra: Record<string, unknown> = {}) =>
    runGetPage(
        backend.helper,
        backend.catalog,
        backend.pages,
        getPageInput.parse({ book_id: FIXTURE_BOOK_ID, page_id: 63, response_format: "json", ...extra }),
    ).then((r) => r.structuredContent);

describe("around_phrase returns the sentence, not the page", () => {
    it("cuts the body to a window containing the phrase", async () => {
        const whole = await page();
        expect(whole.excerpt).toBeNull();
        expect(whole.body.length).toBeGreaterThan(0);

        // A CONTIGUOUS run of the page's own text — never words picked out
        // of it, which would fabricate a phrase the page does not contain.
        const phrase = contiguous(whole.body, 4, 6);

        const cut = await page({ around_phrase: phrase, around_radius: 60 });
        expect(cut.excerpt).not.toBeNull();
        expect(cut.excerpt!.found).toBe(true);
        expect(cut.excerpt!.field).toBe("body");
        expect(cut.body).toContain(phrase);
        expect(cut.body.length).toBeLessThan(whole.body.length);
    }, 120_000);

    it("returns the whole body, and says so, when the phrase is absent", async () => {
        const out = await page({ around_phrase: "زقنطورية مباركة لا توجد" });
        expect(out.excerpt).not.toBeNull();
        expect(out.excerpt!.found).toBe(false);
        expect(out.excerpt!.field).toBeNull();
        // Nothing approximate: the body is the page's own.
        const whole = await page();
        expect(out.body).toBe(whole.body);
    }, 120_000);

    it("tells the reader in the rendered text that this is an excerpt", async () => {
        const whole = await page();
        const phrase = contiguous(whole.body, 3, 0);
        const r = await runGetPage(
            backend.helper,
            backend.catalog,
            backend.pages,
            getPageInput.parse({ book_id: FIXTURE_BOOK_ID, page_id: 63, around_phrase: phrase }),
        );
        expect(r.content[0]!.text).toMatch(/مقتطعٌ حول عبارة|excerpt around/);
    }, 120_000);

    it("matches a phrase typed without the page's diacritics", async () => {
        const whole = await page();
        const phrase = contiguous(whole.body, 3, 2);
        // Strip Arabic diacritics from the needle; the page keeps them.
        const bare = phrase.replace(/[ً-ْٰ]/g, "");
        const out = await page({ around_phrase: bare });
        expect(out.excerpt!.found, `bare: ${bare}`).toBe(true);
    }, 120_000);
});
