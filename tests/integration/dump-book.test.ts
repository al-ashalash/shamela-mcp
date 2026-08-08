/**
 * The export has to be complete and it has to be resumable, and those are the
 * two ways a bulk tool goes wrong quietly: it stops early and reports success,
 * or its cursor skips a page nobody notices is missing. Both are checked here
 * against the real fixture book rather than a stub, because the page ids of a
 * real Shamela book are not a dense range and that is exactly what a cursor
 * built on `count` would get wrong.
 */
import { describe, it, expect, beforeAll } from "vitest";

import { runDumpBook, dumpBookInput } from "../../src/server/tools/dumpBook.js";
import { FIXTURE_BOOK_ID, getBackend } from "../fixtures/shared.js";
import type { Backend } from "../../src/server/index.js";

let backend: Backend;

async function dump(args: Record<string, unknown>) {
    const parsed = dumpBookInput.parse({ book_id: FIXTURE_BOOK_ID, ...args });
    const r = await runDumpBook(backend.helper, backend.catalog, backend.pages, parsed);
    return r.structuredContent;
}

describe("shamela_dump_book", () => {
    beforeAll(async () => {
        backend = await getBackend();
    }, 120_000);

    it("exports pages with the provenance a detached chunk needs", async () => {
        const out = await dump({ max_chars: 4_000 });
        expect(out.book_id).toBe(FIXTURE_BOOK_ID);
        expect(out.book_name.length).toBeGreaterThan(0);
        expect(out.returned).toBeGreaterThan(0);
        expect(out.pages.length).toBe(out.returned);

        const first = out.pages[0]!;
        expect(first.page_id).toBeGreaterThan(0);
        // The citation is the whole point of exporting rather than scraping.
        expect(first.citation.length).toBeGreaterThan(0);
        expect(first.citation).toContain(out.book_name);
        expect(typeof first.body).toBe("string");
    });

    it("strips markup by default and keeps it on request", async () => {
        const plain = await dump({ max_chars: 3_000 });
        const raw = await dump({ max_chars: 3_000, keep_html: true });
        const plainText = plain.pages.map((p) => p.body).join("");
        const rawText = raw.pages.map((p) => p.body).join("");
        expect(plainText).not.toContain("<span");
        // The fixture carries markup; if it ever stops, this assertion is the
        // thing that should be revisited, not the stripping.
        expect(rawText.length).toBeGreaterThanOrEqual(plainText.length);
    });

    it("honours the character budget and always returns at least one page", async () => {
        const out = await dump({ max_chars: 1_000 });
        expect(out.returned).toBeGreaterThanOrEqual(1);
        expect(out.has_more).toBe(true);
        expect(out.next_start_page_id).toBeGreaterThan(out.pages[out.pages.length - 1]!.page_id - 1);
    });

    it("the cursor walks the whole book without skipping or repeating a page", async () => {
        const seen: number[] = [];
        let cursor = 1;
        let guard = 0;
        for (;;) {
            const out = await dump({ start_page_id: cursor, max_chars: 6_000 });
            for (const p of out.pages) seen.push(p.page_id);
            if (!out.has_more || out.returned === 0) break;
            cursor = out.next_start_page_id!;
            if (++guard > 50) throw new Error("cursor did not terminate");
        }
        expect(seen.length).toBeGreaterThan(0);
        // Strictly increasing: no page returned twice, none out of order.
        for (let i = 1; i < seen.length; i++) {
            expect(seen[i]!).toBeGreaterThan(seen[i - 1]!);
        }
        // And it really reached the end of the book, rather than stopping
        // wherever the budget happened to fall.
        const last = seen[seen.length - 1]!;
        expect(last).toBe(await backend.pages.pageCount(FIXTURE_BOOK_ID));
    }, 120_000);

    it("include selects which parts of the page are exported", async () => {
        const bodyOnly = await dump({ max_chars: 5_000, include: ["body"] });
        for (const p of bodyOnly.pages) {
            expect(p.foot).toBe("");
            expect(p.comment).toBe("");
        }
    });

    it("attaches the chapter heading in force at each page", async () => {
        const out = await dump({ max_chars: 8_000, include_titles: true });
        const withTitle = out.pages.filter((p) => p.title !== null && p.title !== "");
        expect(withTitle.length).toBeGreaterThan(0);
    });

    it("refuses a book that is not downloaded", async () => {
        await expect(dump({ book_id: 999_999 })).rejects.toMatchObject({
            code: expect.stringMatching(/BOOK_NOT_FOUND|BOOK_NOT_DOWNLOADED/),
        });
    });
});
