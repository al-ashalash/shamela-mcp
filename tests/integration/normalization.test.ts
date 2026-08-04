/**
 * Cross-language and against-the-index checks for Arabic normalization.
 *
 * Three things can go wrong and each has its own group below:
 *   1. The TypeScript and Java normalizers drift apart. They are separate
 *      implementations of one table, and their divergence is what left hamza
 *      searches returning results with empty snippets.
 *   2. A rule is missing, so a legitimate query becomes a term Shamela never
 *      indexed → a silent zero. That is the shape of the field report this
 *      suite was written for.
 *   3. A rule is invented, which fails exactly the same way. The rule probes
 *      catch both directions: every surface form must still find its term.
 *
 * Needs a real Shamela install and the fixture book; runs with the integration
 * suite, not in CI.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { normalizeArabic, normalizeArabicAya } from "../../src/server/arabic.js";
import type { Helper } from "../../src/server/helper.js";
import {
    HAMZA_QUERIES_BOOK_9942,
    NORMALIZATION_RULE_PROBES,
} from "../fixtures/canonical-queries.js";
import { FIXTURE_BOOK_ID, getHelper } from "../fixtures/shared.js";

interface SearchEnvelope {
    total_hits: number;
    normalized_tokens?: string[];
    results: Array<{
        matched_in: string[];
        snippet_body: string;
        snippet_foot: string;
    }>;
}

describe("Arabic normalization (real JVM + real index)", () => {
    let helper: Helper;

    beforeAll(async () => {
        helper = await getHelper();
    });

    async function searchPages(query: string, scoped: boolean, max = 5): Promise<SearchEnvelope> {
        return helper.request<SearchEnvelope>("search_pages", {
            query,
            ...(scoped ? { scope_book_keys: [String(FIXTURE_BOOK_ID)] } : {}),
            max_results: max,
            offset: 0,
            options: {},
        });
    }

    describe("the two normalizers agree", () => {
        const words = [
            ...HAMZA_QUERIES_BOOK_9942.map((q) => q.query),
            ...NORMALIZATION_RULE_PROBES.map((p) => p.query),
            "الكلام",
            "مكتبة",
            "مصطفى",
            "کتاب",
        ];

        it.each([...new Set(words)])("Java and TypeScript normalize %j identically", async (word) => {
            const env = await searchPages(word, true, 1);
            expect(env.normalized_tokens?.[0]).toBe(normalizeArabic(word));
        });

        it("keeps the ابن → بن synonym on the Java side too", async () => {
            const env = await searchPages("ابن", false, 1);
            expect(env.normalized_tokens?.[0]).toBe("بن");
        });

        it("uses the aya table for Quran search", async () => {
            const env = await helper.request<SearchEnvelope>("search_quran", {
                query: "الملائكة",
                max_results: 1,
                offset: 0,
                options: {},
            });
            expect(env.normalized_tokens?.[0]).toBe(normalizeArabicAya("الملائكة"));
            // The page table would give «الملايكه», which the aya index lacks.
            expect(normalizeArabicAya("الملائكة")).not.toBe(normalizeArabic("الملائكة"));
            expect(env.total_hits).toBeGreaterThan(0);
        });
    });

    describe("every rewrite rule still finds its term (no invented rules)", () => {
        it.each(NORMALIZATION_RULE_PROBES.map((p) => [p.query, p.rule]))(
            "%j exercises %s",
            async (query) => {
                const env = await searchPages(query, false, 1);
                expect(env.total_hits).toBeGreaterThan(0);
            },
        );
    });

    describe("hamza queries return their known counts in the fixture book", () => {
        it.each(HAMZA_QUERIES_BOOK_9942.map((q) => [q.query, q.expectedHits, q.note]))(
            "query=%j hits=%i (%s)",
            async (query, expectedHits) => {
                const env = await searchPages(query as string, true, 20);
                expect(env.total_hits).toBe(expectedHits);
            },
        );
    });

    describe("snippets survive normalization", () => {
        it.each(["المسائل", "الفرائض", "شيء", "قراءات"])(
            "a hit for %j carries a highlighted snippet",
            async (query) => {
                const env = await searchPages(query, false, 5);
                expect(env.total_hits).toBeGreaterThan(0);
                const withMatch = env.results.filter((r) => r.matched_in.length > 0);
                // Divergent token/haystack tables used to yield hits whose
                // matched_in was empty and whose snippets were blank.
                expect(withMatch.length).toBeGreaterThan(0);
                for (const r of withMatch) {
                    expect(`${r.snippet_body}${r.snippet_foot}`).toContain("<mark>");
                }
            },
        );
    });
});
