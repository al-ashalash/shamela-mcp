/**
 * The response budget, and the two ways it used to be wrong.
 *
 * A field test of 1.3.0 called shamela_list_tafsirs_for_aya on a full library
 * and the client rejected the answer for exceeding its token cap — while the
 * payload itself carried `truncated: true` and a message announcing it had been
 * cut to 24,800 characters. Both statements were true of the text channel and
 * neither was true of the response: structuredContent was never measured, and
 * went over the wire whole at 248,524 characters.
 *
 * The second defect was in the same four lines. Truncation was a character
 * slice of the rendered string, so a caller who asked for `response_format:
 * "json"` got a document cut mid-string — flagged, described, and unparseable.
 *
 * These tests are deliberately built from synthetic payloads rather than a live
 * call. The bug only shows on a large library, and a test that needs one is a
 * test that passes on the machines least able to reproduce it.
 */

import { describe, it, expect } from "vitest";

import { CHARACTER_LIMIT, STRUCTURED_LIMIT } from "../../src/server/constants.js";
import { renderResponse } from "../../src/server/format.js";

/** A payload guaranteed to blow the budget: n rows of realistic width. */
const bigPayload = (n: number) => ({
    total: n,
    returned: n,
    offset: 0,
    results: Array.from({ length: n }, (_, i) => ({
        book_id: 1000 + i,
        book_name: `كتاب التفسير رقم ${i} — نسخة محققة`,
        author_name: "أبو جعفر محمد بن جرير الطبري",
        status: "not_indexed_coverage_unknown",
        page_id: null,
    })),
});

const sizeOnWire = (r: { content: Array<{ text: string }>; structuredContent: unknown }) =>
    r.content[0].text.length + JSON.stringify(r.structuredContent).length;

describe("both channels are measured, not just the text one", () => {
    it("keeps structuredContent inside the budget", () => {
        const r = renderResponse(bigPayload(12000), "markdown", () => "short markdown");
        const structured = JSON.stringify(r.structuredContent).length;
        expect(structured).toBeLessThanOrEqual(STRUCTURED_LIMIT);
    });

    it("keeps the whole response bounded, which is what the client rejected", () => {
        const r = renderResponse(bigPayload(12000), "markdown", () => "short markdown");
        // Before the fix this was 273,492 characters against a 25,000 budget.
        expect(sizeOnWire(r)).toBeLessThanOrEqual(STRUCTURED_LIMIT + CHARACTER_LIMIT);
    });

    it("says so when it drops rows, and names the field", () => {
        const r = renderResponse(bigPayload(12000), "markdown", () => "short markdown");
        const sc = r.structuredContent as Record<string, unknown>;
        expect(sc.truncated).toBe(true);
        expect(String(sc.truncation_message)).toContain("results");
    });

    it("leaves a payload that already fits completely alone", () => {
        const small = bigPayload(3);
        const r = renderResponse(small, "markdown", () => "short markdown");
        const sc = r.structuredContent as Record<string, unknown>;
        expect(sc.truncated).toBeUndefined();
        expect((sc.results as unknown[]).length).toBe(3);
    });
});

describe("a JSON response stays JSON", () => {
    it("parses after truncation", () => {
        const r = renderResponse(bigPayload(12000), "json", () => "unused");
        // The old path sliced this mid-string and produced "كت followed by a
        // bracketed note, which no caller could parse.
        expect(() => JSON.parse(r.content[0].text)).not.toThrow();
    });

    it("parses when nothing was dropped either", () => {
        const r = renderResponse(bigPayload(3), "json", () => "unused");
        expect(() => JSON.parse(r.content[0].text)).not.toThrow();
    });

    it("the parsed text agrees with structuredContent", () => {
        const r = renderResponse(bigPayload(12000), "json", () => "unused");
        expect(JSON.parse(r.content[0].text)).toEqual(r.structuredContent);
    });
});

describe("counts describe what was actually shipped", () => {
    it("returned_count matches the rows in the response, not the rows found", () => {
        const r = renderResponse(bigPayload(12000), "markdown", () => "short markdown");
        const sc = r.structuredContent as Record<string, unknown>;
        expect(sc.returned_count).toBe((sc.results as unknown[]).length);
    });

    it("total_count still reports everything that matched", () => {
        const r = renderResponse(bigPayload(12000), "markdown", () => "short markdown");
        const sc = r.structuredContent as Record<string, unknown>;
        expect(sc.total_count).toBe(12000);
        expect(sc.complete).toBe(false);
    });
});

describe("trimming sheds from every large list, not just the first", () => {
    it("shrinks two oversized arrays rather than emptying one", () => {
        const payload = {
            rows: Array.from({ length: 6000 }, (_, i) => ({ id: i, name: `اسم طويل نسبيًّا ${i}` })),
            pending_ids: Array.from({ length: 6000 }, (_, i) => 90000 + i),
        };
        const r = renderResponse(payload, "markdown", () => "short markdown");
        const sc = r.structuredContent as Record<string, unknown>;
        // Both are still present and non-empty: neither list was sacrificed
        // whole to keep the other intact.
        expect((sc.rows as unknown[]).length).toBeGreaterThan(0);
        expect((sc.pending_ids as unknown[]).length).toBeGreaterThan(0);
        expect(JSON.stringify(sc).length).toBeLessThanOrEqual(STRUCTURED_LIMIT);
    });

    it("does not spin forever on a payload with nothing to trim", () => {
        const payload = { blob: "ب".repeat(CHARACTER_LIMIT * 2) };
        const r = renderResponse(payload, "markdown", () => "short markdown");
        // No array to shed, so the budget cannot be met — it must return
        // rather than loop, and the markdown fallback caps the text channel.
        expect(r.content[0].text.length).toBeLessThanOrEqual(CHARACTER_LIMIT);
    });
});
