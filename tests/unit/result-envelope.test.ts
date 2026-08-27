/**
 * Three ways a result set can mislead, and what now prevents each.
 *
 * A zero from the Qur'an search reads as "this wording is not in the Qur'an",
 * when the likelier cause is that the index stores whole words and the query
 * used a different surface form. A partial page reads as a whole answer unless
 * something says otherwise. And a book listed as downloaded may still hold no
 * readable text.
 */

import { describe, it, expect } from "vitest";

import { renderResponse } from "../../src/server/format.js";

describe("canonical result counts", () => {
    // Tools grew two vocabularies for the same numbers — total_hits/returned in
    // search, total/returned in listings — so a caller reading one name across
    // tools silently read nothing from half of them. The canonical pair is
    // ADDED, never renamed, so existing consumers keep working.
    it("derives counts from the search vocabulary", () => {
        const r = renderResponse(
            { total_hits: 250, returned: 20, offset: 0, has_more: true, results: [] },
            "json",
            () => "",
        );
        const sc = r.structuredContent as Record<string, unknown>;
        expect(sc.total_count).toBe(250);
        expect(sc.returned_count).toBe(20);
        expect(sc.complete).toBe(false);
        // The original names survive untouched.
        expect(sc.total_hits).toBe(250);
    });

    it("derives counts from the listing vocabulary", () => {
        const r = renderResponse({ total: 7, returned: 7, offset: 0, has_more: false }, "json", () => "");
        const sc = r.structuredContent as Record<string, unknown>;
        expect(sc.total_count).toBe(7);
        expect(sc.complete).toBe(true);
    });

    it("does not call a later page complete, even when it is the last one", () => {
        // Page two of two is still not the whole answer; a reader who sees only
        // this response has not seen page one.
        const r = renderResponse({ total: 40, returned: 20, offset: 20, has_more: false }, "json", () => "");
        expect((r.structuredContent as Record<string, unknown>).complete).toBe(false);
    });

    it("leaves payloads that carry no counts alone", () => {
        const r = renderResponse({ book_id: 9942, book_name: "كتاب" }, "json", () => "");
        const sc = r.structuredContent as Record<string, unknown>;
        expect(sc.total_count).toBeUndefined();
        expect(sc.book_id).toBe(9942);
    });

    it("still flags truncation on top of the counts", () => {
        const long = "ء".repeat(200_000);
        const r = renderResponse({ total: 1, returned: 1, offset: 0, has_more: false }, "markdown", () => long);
        const sc = r.structuredContent as Record<string, unknown>;
        expect(sc.truncated).toBe(true);
        expect(sc.total_count).toBe(1);
    });
});
