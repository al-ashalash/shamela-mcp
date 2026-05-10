import { describe, it, expect, beforeAll } from "vitest";

import { HelperError, type Helper } from "../../src/server/helper.js";
import { PAGE_QUERIES_BOOK_9942 } from "../fixtures/canonical-queries.js";
import { FIXTURE_BOOK_ID, getHelper } from "../fixtures/shared.js";

interface SearchEnvelope {
    total_hits: number;
    results: Array<{
        book_id: number;
        page_id: number;
        matched_in: string[];
        snippet_body: string;
        snippet_foot: string;
    }>;
}

describe("Java helper (real JVM)", () => {
    let helper: Helper;

    beforeAll(async () => {
        helper = await getHelper();
    });

    it("ping returns pong with java_version", async () => {
        const pong = await helper.ping(10_000);
        expect(pong.pong).toBe(true);
        expect(typeof pong.java_version).toBe("string");
        expect(pong.java_version.length).toBeGreaterThan(0);
    });

    it("rejects an unknown command without crashing the helper", async () => {
        await expect(helper.request("not_a_real_command", {})).rejects.toThrow(HelperError);
        // Ensure the helper survives — a follow-up ping should still work.
        const pong = await helper.ping(5_000);
        expect(pong.pong).toBe(true);
    });

    describe("search_pages", () => {
        it.each(PAGE_QUERIES_BOOK_9942.map((q) => [q.query, q.expectedHits, q.note]))(
            "query=%j hits=%i (%s)",
            async (query, expectedHits) => {
                const env = await helper.request<SearchEnvelope>("search_pages", {
                    query,
                    scope_book_keys: [String(FIXTURE_BOOK_ID)],
                    max_results: 20,
                    offset: 0,
                    options: {},
                });
                expect(env.total_hits).toBe(expectedHits);
            },
        );

        it("returns snippets with <mark>...</mark> around matches", async () => {
            const env = await helper.request<SearchEnvelope>("search_pages", {
                query: "الكلام",
                scope_book_keys: [String(FIXTURE_BOOK_ID)],
                max_results: 5,
                offset: 0,
                options: {},
            });
            expect(env.results.length).toBeGreaterThan(0);
            const first = env.results[0]!;
            expect(
                first.snippet_body.includes("<mark>") || first.snippet_foot.includes("<mark>"),
            ).toBe(true);
        });

        it("morphology=true on root form returns hits in the fixture book", async () => {
            const env = await helper.request<SearchEnvelope>("search_pages", {
                query: "كلم",
                scope_book_keys: [String(FIXTURE_BOOK_ID)],
                max_results: 20,
                offset: 0,
                options: { morphology: true },
            });
            expect(env.total_hits).toBeGreaterThan(0);
        });

        it("morphology + wildcards together → OPTION_CONFLICT", async () => {
            await expect(
                helper.request("search_pages", {
                    query: "كلم*",
                    scope_book_keys: [String(FIXTURE_BOOK_ID)],
                    max_results: 5,
                    offset: 0,
                    options: { morphology: true, wildcards: true },
                }),
            ).rejects.toMatchObject({ code: "OPTION_CONFLICT" });
        });

        it("preserve_diacritics=true → OPTION_NOT_SUPPORTED in v1.0", async () => {
            await expect(
                helper.request("search_pages", {
                    query: "الكلام",
                    scope_book_keys: [String(FIXTURE_BOOK_ID)],
                    max_results: 5,
                    offset: 0,
                    options: { preserve_diacritics: true },
                }),
            ).rejects.toMatchObject({ code: "OPTION_NOT_SUPPORTED" });
        });
    });
});
