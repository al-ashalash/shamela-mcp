/**
 * The response budget: the PAYLOAD is cut, never the serialised string.
 *
 * The old enforceCharLimit sliced content[0].text and shipped
 * structuredContent whole — and clients render structuredContent, so the
 * character limit never once fired, and the sliced JSON text was not even
 * parseable («Bad control character in string literal at position 24800»).
 * These are the assertions that would have caught it.
 */

import { describe, it, expect } from "vitest";

import { CHARACTER_LIMIT } from "../../src/server/constants.js";
import { renderResponse, type ResponseBudget } from "../../src/server/format.js";

interface Paged {
    total_hits: number;
    returned: number;
    offset: number;
    has_more: boolean;
    next_offset?: number;
    results: { id: number; text: string }[];
    [k: string]: unknown;
}

const PAGED = { list: ["results"], counter: "returned", advice: "page" } as const satisfies ResponseBudget<Paged>;

function bigPayload(rows: number, offset = 0): Paged {
    const results = Array.from({ length: rows }, (_, i) => ({ id: offset + i, text: "م".repeat(200) }));
    return { total_hits: 4_000, returned: rows, offset, has_more: true, next_offset: offset + rows, results };
}

const wire = (r: ReturnType<typeof renderResponse>): number =>
    r.content[0]!.text.length + JSON.stringify(r.structuredContent).length;

describe("the payload is cut, not the string", () => {
    it("trims the rows until both channels fit", () => {
        const r = renderResponse(bigPayload(400), "json", PAGED, () => "");
        const sc = r.structuredContent as unknown as Paged;
        expect(sc.results.length).toBeGreaterThan(0);
        expect(sc.results.length).toBeLessThan(400);
        expect(wire(r)).toBeLessThanOrEqual(CHARACTER_LIMIT);
    });

    it("keeps the JSON text parseable and identical to structuredContent", () => {
        const r = renderResponse(bigPayload(400), "json", PAGED, () => "");
        const parsed = JSON.parse(r.content[0]!.text) as Paged;
        expect(parsed.results.length).toBe((r.structuredContent as unknown as Paged).results.length);
    });

    it("cuts the markdown case too — the one the old code missed entirely", () => {
        // One short line per row: the TEXT fits easily while structuredContent
        // does not. Slicing the text would find nothing to slice.
        const r = renderResponse(bigPayload(400), "markdown", PAGED, (d) => d.results.map((x) => `- ${x.id}`).join("\n"));
        expect((r.structuredContent as unknown as Paged).results.length).toBeLessThan(400);
        expect(wire(r)).toBeLessThanOrEqual(CHARACTER_LIMIT);
    });

    it("re-points the paging contract at the cut", () => {
        const r = renderResponse(bigPayload(400, 40), "json", PAGED, () => "");
        const sc = r.structuredContent as unknown as Paged & { truncated: boolean; returned_count: number; complete: boolean };
        const kept = sc.results.length;
        expect(sc.returned).toBe(kept);
        expect(sc.returned_count).toBe(kept);
        expect(sc.total_hits).toBe(4_000); // untouched — the cut is not a recount
        expect(sc.has_more).toBe(true);
        expect(sc.next_offset).toBe(40 + kept); // the next page starts where this one ENDS
        expect(sc.truncated).toBe(true);
        expect(sc.complete).toBe(false);
    });
});

describe("which list gets cut", () => {
    it("parallel lists are cut to one length, index for index", () => {
        // books_by_period returns book_ids beside books.
        const books = Array.from({ length: 300 }, (_, i) => ({ book_id: i, book_name: "كتاب ".repeat(30) }));
        const payload = { total: 300, returned: 300, books, book_ids: books.map((b) => b.book_id) };
        const budget = { list: ["books", "book_ids"], counter: "returned", advice: "page" } as const satisfies ResponseBudget<typeof payload>;
        const sc = renderResponse(payload, "json", budget, () => "").structuredContent as unknown as typeof payload;
        expect(sc.books.length).toBeLessThan(300);
        expect(sc.book_ids.length).toBe(sc.books.length);
        sc.book_ids.forEach((id, i) => expect(id).toBe(sc.books[i]!.book_id));
    });

    it("the emptier of two lists does not hide the fuller one", () => {
        // get_toc fills `titles` OR `ancestor_chain` and leaves the other [];
        // reading only list[0] left the chain untrimmed at 158,576 chars.
        const chain = Array.from({ length: 300 }, (_, i) => ({ title_id: i, title_text: "باب ".repeat(40) }));
        const payload = { titles: [] as typeof chain, ancestor_chain: chain };
        const budget = { list: ["titles", "ancestor_chain"], advice: "narrow" } as const satisfies ResponseBudget<typeof payload>;
        const r = renderResponse(payload, "json", budget, () => "");
        expect((r.structuredContent as unknown as typeof payload).ancestor_chain.length).toBeLessThan(300);
        expect(wire(r)).toBeLessThanOrEqual(CHARACTER_LIMIT);
    });
});

describe("a tool that owns its budget", () => {
    it("is left alone — data whole, no truncation stamp", () => {
        // get_book_section already cut this to MULTIPAGE_CHAR_BUDGET and its
        // own `truncated: false` means «the section was returned whole». The
        // outer budget stamping `truncated: true` on it would flip a declared
        // field into a lie and point the reader at a null next_start_page_id.
        const pages = Array.from({ length: 8 }, (_, i) => ({ page_id: i + 1, body: "و".repeat(1_500) }));
        const payload = { truncated: false, next_start_page_id: null, pages };
        const budget = { list: null, advice: "next_page", ownsBudget: true } as const satisfies ResponseBudget<typeof payload>;
        const r = renderResponse(payload, "json", budget, () => "");
        const sc = r.structuredContent as unknown as typeof payload & { truncation_message?: string };
        expect(sc.truncated).toBe(false);
        expect(sc.truncation_message).toBeUndefined();
        expect(sc.pages.length).toBe(8);
    });
});
