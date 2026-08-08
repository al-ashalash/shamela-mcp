import { describe, it, expect, beforeAll } from "vitest";

import { HelperError, type Helper } from "../../src/server/helper.js";
import { PAGE_QUERIES_BOOK_9942 } from "../fixtures/canonical-queries.js";
import { FIXTURE_BOOK_ID, getHelper } from "../fixtures/shared.js";

interface SearchEnvelope {
    total_hits: number;
    returned?: number;
    has_more?: boolean;
    coverage: {
        by_book_key: Record<string, number>;
        total_seen: number;
        at_cap: boolean;
        basis: "all_results" | "window";
    };
    results: Array<{
        book_id: number;
        page_id: number;
        matched_in: string[];
        matched_terms?: string[];
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

        // Report #13: a root search returned the right pages and an empty
        // snippet for every one of them, which reads as though the search had
        // failed. The root is not in the text — its derived words are.
        it("morphology=true highlights the derived word, not nothing", async () => {
            const env = await helper.request<SearchEnvelope>("search_pages", {
                query: "صبر",
                scope_book_keys: [String(FIXTURE_BOOK_ID)],
                max_results: 20,
                offset: 0,
                options: { morphology: true },
            });
            expect(env.total_hits).toBeGreaterThan(0);

            const claimed = env.results.filter((r) => r.matched_in.length > 0);
            expect(claimed.length).toBeGreaterThan(0);
            for (const r of claimed) {
                expect(`${r.snippet_body}${r.snippet_foot}`).toContain("<mark>");
            }

            // The point of the fix: what is marked is a word derived from the
            // root, not the root itself, which does not occur here at all.
            const marked = claimed
                .flatMap((r) => [...`${r.snippet_body}${r.snippet_foot}`.matchAll(/<mark>(.*?)<\/mark>/g)])
                .map((m) => m[1]!);
            expect(marked.length).toBeGreaterThan(0);
            expect(marked.some((w) => w !== "صبر")).toBe(true);
        });

        // Report #16: the coverage rollup counted the page of results being
        // returned and was presented as the coverage of the whole search.
        it("coverage counts every match, not the returned page", async () => {
            const env = await helper.request<SearchEnvelope>("search_pages", {
                query: "الكلام",
                scope_book_keys: [String(FIXTURE_BOOK_ID)],
                max_results: 3,
                offset: 0,
                options: {},
            });
            expect(env.results.length).toBe(3);
            expect(env.coverage.basis).toBe("all_results");
            expect(env.coverage.total_seen).toBe(env.total_hits);
            expect(env.coverage.by_book_key[String(FIXTURE_BOOK_ID)]).toBe(env.total_hits);
            // at_cap now means "counting was cut short", which a full pass never is.
            expect(env.coverage.at_cap).toBe(false);
        });

        it("a search far larger than the old 5,000 cap is still counted whole", async () => {
            const env = await helper.request<SearchEnvelope>("search_pages", {
                query: "الله",
                max_results: 1,
                offset: 0,
                options: {},
            });
            expect(env.total_hits).toBeGreaterThan(5_000);
            expect(env.coverage.basis).toBe("all_results");
            expect(env.coverage.at_cap).toBe(false);
            expect(env.coverage.total_seen).toBe(env.total_hits);
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

    // The phrase, proximity and boolean searches used to be assembled outside
    // the engine from a bounded window of candidates. These check that the
    // engine now answers them itself — exactly, and over everything it holds.
    describe("search_phrase / search_boolean (native)", () => {
        const SCOPE = [String(FIXTURE_BOOK_ID)];

        it("phrase mode matches only consecutive words", async () => {
            const phrase = await helper.request<SearchEnvelope>("search_phrase", {
                query: "الكلام لغة",
                mode: "phrase",
                scope_book_keys: SCOPE,
                max_results: 10,
                offset: 0,
            });
            const anyOrder = await helper.request<SearchEnvelope>("search_pages", {
                query: "الكلام لغة",
                scope_book_keys: SCOPE,
                max_results: 10,
                offset: 0,
                options: {},
            });
            expect(phrase.total_hits).toBeGreaterThan(0);
            // Adjacency is a real restriction: co-occurrence finds more.
            expect(phrase.total_hits).toBeLessThanOrEqual(anyOrder.total_hits);
            for (const r of phrase.results) {
                expect(`${r.snippet_body}${r.snippet_foot}`).toContain("<mark>");
            }
        });

        it("near mode is looser than phrase mode and tightens with distance", async () => {
            const wide = await helper.request<SearchEnvelope>("search_phrase", {
                query: "الكلام لغة",
                mode: "near",
                distance: 10,
                scope_book_keys: SCOPE,
                max_results: 10,
                offset: 0,
            });
            const tight = await helper.request<SearchEnvelope>("search_phrase", {
                query: "الكلام لغة",
                mode: "near",
                distance: 1,
                scope_book_keys: SCOPE,
                max_results: 10,
                offset: 0,
            });
            expect(wide.total_hits).toBeGreaterThanOrEqual(tight.total_hits);
        });

        it("counts every match, not a window of candidates", async () => {
            const env = await helper.request<SearchEnvelope>("search_phrase", {
                query: "قال رسول الله",
                mode: "phrase",
                max_results: 5,
                offset: 0,
            });
            // Unscoped over the whole library: far more than any candidate
            // window could ever have held, and counted exactly.
            expect(env.total_hits).toBeGreaterThan(1_000);
            expect(env.coverage.basis).toBe("all_results");
            expect(env.coverage.total_seen).toBe(env.total_hits);
        });

        it("boolean excludes exhaustively, not within a window", async () => {
            const plain = await helper.request<SearchEnvelope>("search_boolean", {
                all_of: ["الكلام"],
                scope_book_keys: SCOPE,
                max_results: 20,
                offset: 0,
            });
            const excluded = await helper.request<SearchEnvelope>("search_boolean", {
                all_of: ["الكلام"],
                none_of: ["خبر"],
                scope_book_keys: SCOPE,
                max_results: 20,
                offset: 0,
            });
            expect(plain.total_hits).toBeGreaterThan(0);
            expect(excluded.total_hits).toBeLessThan(plain.total_hits);
        });

        it("boolean says which of the asked-for terms each page carries", async () => {
            const env = await helper.request<SearchEnvelope>("search_boolean", {
                all_of: ["الكلام"],
                any_of: ["خبر", "انشاء"],
                scope_book_keys: SCOPE,
                max_results: 10,
                offset: 0,
            });
            expect(env.results.length).toBeGreaterThan(0);
            for (const r of env.results) {
                expect(r.matched_terms).toContain("الكلام");
                expect(r.matched_terms!.some((t) => t === "خبر" || t === "انشاء")).toBe(true);
            }
        });

        it("boolean with nothing to include returns nothing, not everything", async () => {
            const env = await helper.request<SearchEnvelope>("search_boolean", {
                none_of: ["الكلام"],
                max_results: 5,
                offset: 0,
            });
            expect(env.total_hits).toBe(0);
            expect(env.results.length).toBe(0);
        });

        it("offset pages through the exhaustive result set", async () => {
            const first = await helper.request<SearchEnvelope>("search_phrase", {
                query: "الكلام لغة",
                mode: "near",
                distance: 20,
                scope_book_keys: SCOPE,
                max_results: 1,
                offset: 0,
            });
            const second = await helper.request<SearchEnvelope>("search_phrase", {
                query: "الكلام لغة",
                mode: "near",
                distance: 20,
                scope_book_keys: SCOPE,
                max_results: 1,
                offset: 1,
            });
            expect(first.total_hits).toBe(second.total_hits);
            if (first.total_hits > 1) {
                expect(second.results[0]!.page_id).not.toBe(first.results[0]!.page_id);
            }
        });
    });
});
