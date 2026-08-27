/**
 * A query longer than the engine takes.
 *
 * Shamela's search panel is five words wide and this is Shamela's engine, so
 * five is the width of the question that can be asked. What was wrong was not
 * the cap but what it did: the overflow was JOINED onto the fifth word,
 * producing a term with a space in it — «باصل في» — that no index can hold, so
 * the whole conjunction was empty. A six-word search returned a confident zero
 * with no error and no warning, in every search tool the extension has.
 *
 * The fix drops the overflow instead, which searches for LESS than was asked
 * and can therefore only return too much, and hands the dropped words back so
 * the answer can say what it left out.
 *
 * These run against the real engine because the cap is the engine's: a Node
 * reimplementation of it would drift from the thing it describes.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { runSearchPages, searchPagesInput } from "../../src/server/tools/searchPages.js";
import { runSearchPhrase, searchPhraseInput } from "../../src/server/tools/searchPhrase.js";
import { MAX_QUERY_TOKENS } from "../../src/server/constants.js";
import { FIXTURE_BOOK_ID, getBackend } from "../fixtures/shared.js";

let backend: Awaited<ReturnType<typeof getBackend>>;

/** Six consecutive words of a real page — the sentence that used to vanish. */
const SIX = ["والمساواه", "واصطلاحا", "تسويه", "فرع", "باصل", "في"];

beforeAll(async () => {
    backend = await getBackend();
}, 120_000);

const raw = (command: string, args: Record<string, unknown>) =>
    backend.helper.request<{
        total_hits: number;
        normalized_tokens: string[];
        dropped_tokens?: string[];
    }>(command, args);

describe("the engine drops the overflow instead of gluing it", () => {
    it("finds the page a six-word query used to hide", async () => {
        const five = await raw("search_pages", {
            query: SIX.slice(0, MAX_QUERY_TOKENS).join(" "),
            scope_book_keys: null,
            max_results: 1,
            offset: 0,
            options: { skip_coverage: true },
        });
        const six = await raw("search_pages", {
            query: SIX.join(" "),
            scope_book_keys: null,
            max_results: 1,
            offset: 0,
            options: { skip_coverage: true },
        });
        expect(five.total_hits).toBeGreaterThan(0);
        // The whole bug in one assertion: this was 0.
        expect(six.total_hits).toBe(five.total_hits);
    }, 120_000);

    it("never leaves a space inside a term it will look up", async () => {
        const six = await raw("search_pages", {
            query: SIX.join(" "),
            scope_book_keys: null,
            max_results: 1,
            offset: 0,
            options: { skip_coverage: true },
        });
        for (const token of six.normalized_tokens) {
            expect(token, `glued token: «${token}»`).not.toContain(" ");
        }
        expect(six.normalized_tokens).toHaveLength(MAX_QUERY_TOKENS);
    }, 120_000);

    it("hands back exactly the words it left out", async () => {
        const six = await raw("search_pages", {
            query: SIX.join(" "),
            scope_book_keys: null,
            max_results: 1,
            offset: 0,
            options: { skip_coverage: true },
        });
        expect(six.dropped_tokens).toEqual(["في"]);
    }, 120_000);

    it("says nothing when the whole query fitted", async () => {
        const four = await raw("search_pages", {
            query: SIX.slice(0, 4).join(" "),
            scope_book_keys: null,
            max_results: 1,
            offset: 0,
            options: { skip_coverage: true },
        });
        expect(four.dropped_tokens ?? []).toEqual([]);
    }, 120_000);

    it("does the same for every command that takes a written query", async () => {
        const long = "واحد اثنان ثلاثه اربعه خمسه سته سبعه";
        for (const command of ["search_titles", "search_books", "search_authors"]) {
            const out = await raw(command, {
                query: long,
                scope_book_keys: null,
                max_results: 1,
                offset: 0,
                options: {},
            });
            expect(out.dropped_tokens, command).toEqual(["سته", "سبعه"]);
            expect(out.normalized_tokens.every((t) => !t.includes(" ")), command).toBe(true);
        }
    }, 180_000);

    it("does it for the phrase search too, where a glued term was likelier", async () => {
        const six = await raw("search_phrase", {
            query: "القياس لغه التقدير والمساواه واصطلاحا تسويه",
            mode: "phrase",
            distance: 1,
            scope_book_keys: null,
            max_results: 1,
            offset: 0,
            options: { search_in: ["body"] },
        });
        expect(six.total_hits).toBeGreaterThan(0);
        expect(six.dropped_tokens).toEqual(["تسويه"]);
    }, 120_000);
});

describe("the tools say so, and do not merely record it", () => {
    it("puts the dropped words in the payload and in the rendered text", async () => {
        const out = await runSearchPages(
            backend.helper,
            backend.catalog,
            backend.pages,
            searchPagesInput.parse({
                query: SIX.join(" "),
                scope: { book_ids: [FIXTURE_BOOK_ID] },
                limit: 3,
                response_format: "json",
            }),
        );
        expect(out.structuredContent.dropped_tokens).toEqual(["في"]);

        const rendered = await runSearchPages(
            backend.helper,
            backend.catalog,
            backend.pages,
            searchPagesInput.parse({
                query: SIX.join(" "),
                scope: { book_ids: [FIXTURE_BOOK_ID] },
                limit: 3,
            }),
        );
        const text = rendered.content[0]!.text;
        expect(text).toMatch(/خمس كلمات|five words/);
        expect(text).toContain("في");
    }, 120_000);

    it("says it on the phrase tool as well", async () => {
        const r = await runSearchPhrase(
            backend.helper,
            backend.catalog,
            backend.pages,
            searchPhraseInput.parse({
                query: "القياس لغه التقدير والمساواه واصطلاحا تسويه",
                mode: "phrase",
                limit: 2,
            }),
        );
        expect(r.content[0]!.text).toMatch(/خمس كلمات|five words/);
    }, 120_000);

    it("stays quiet on an ordinary query", async () => {
        const out = await runSearchPages(
            backend.helper,
            backend.catalog,
            backend.pages,
            searchPagesInput.parse({
                query: "الكلام",
                scope: { book_ids: [FIXTURE_BOOK_ID] },
                limit: 2,
                response_format: "json",
            }),
        );
        expect(out.structuredContent.dropped_tokens).toBeUndefined();
    }, 120_000);
});

describe("a scan refuses what an ordinary search merely widens", () => {
    it("will not measure a question the engine narrowed under it", async () => {
        // For a search, dropping a word returns too much and the reader can see
        // it. For a per-formula scan it would silently change the question in
        // every row, so it is refused instead.
        const { runScanConsensus, scanConsensusInput } = await import(
            "../../src/server/tools/scanConsensus.js"
        );
        await expect(
            runScanConsensus(
                backend.helper,
                backend.catalog,
                backend.pages,
                scanConsensusInput.parse({
                    question: "لا نعلم بين اهل العلم في هذا خلافا اصلا",
                    formulas: ["لا خلاف"],
                    witnesses: 0,
                }),
            ),
        ).rejects.toThrow();
    }, 120_000);
});
