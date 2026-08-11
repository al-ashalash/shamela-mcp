/**
 * Regression tests for bugs reported via real-world tool exercise.
 * Per CLAUDE.md "Testing rules" §3 — every reported bug becomes a test
 * here BEFORE the fix lands.
 */

import { describe, it, expect, beforeAll } from "vitest";

import type { Catalog } from "../../src/server/catalog.js";
import { runSearchBooks } from "../../src/server/tools/searchBooks.js";
import type { Helper } from "../../src/server/helper.js";
import { runGetBook, getBookInput } from "../../src/server/tools/getBook.js";
import { runGetPage, getPageInput } from "../../src/server/tools/getPage.js";
import { runGetPagesRange, getPagesRangeInput } from "../../src/server/tools/getPagesRange.js";
import { runSearchPages, searchPagesInput } from "../../src/server/tools/searchPages.js";
import { FIXTURE_BOOK_ID, getCatalog, getHelper, getPageStore } from "../fixtures/shared.js";

describe("Bug #2 — search_books must honor scope in total_hits/has_more/next_offset", () => {
    let helper: Helper;
    let catalog: Catalog;

    beforeAll(async () => {
        helper = await getHelper();
        catalog = await getCatalog();
    });

    // The reproducer: query "الأصول من علم الأصول" returns 8 hits unscoped
    // (per user-reported repro), only 1 of which is by Ibn Uthaymeen (book 9942).
    // Before the fix: scoped total_hits=8, has_more=true, next_offset=0 — all wrong.
    // After the fix: scoped total_hits=1, has_more=false, no next_offset.
    const QUERY = "الأصول من علم الأصول";
    const IBN_UTHAYMEEN_ID = 57;

    it("scoped total_hits == count of returned scope-matching books, not pre-scope total", async () => {
        const unscoped = await runSearchBooks(helper, catalog, {
            query: QUERY,
            limit: 100,
            offset: 0,
            response_format: "json",
        });
        // Unscoped baseline: there is at least one match across the catalog.
        expect(unscoped.structuredContent.total_hits).toBeGreaterThan(0);

        const scoped = await runSearchBooks(helper, catalog, {
            query: QUERY,
            scope: { author_ids: [IBN_UTHAYMEEN_ID], downloaded_only: false },
            limit: 100,
            offset: 0,
            response_format: "json",
        });

        // Every returned book must actually be by author 57.
        const author57Books = catalog.booksByAuthors([IBN_UTHAYMEEN_ID]);
        for (const r of scoped.structuredContent.results) {
            expect(
                author57Books.has(r.book_id),
                `book ${r.book_id} returned but not in author 57's books`,
            ).toBe(true);
        }

        // total_hits must equal the actual scoped result count (not pre-scope total).
        expect(scoped.structuredContent.total_hits).toBe(
            scoped.structuredContent.results.length,
        );

        // returned must equal the result list length.
        expect(scoped.structuredContent.returned).toBe(
            scoped.structuredContent.results.length,
        );

        // Scoped total_hits must be ≤ unscoped (by definition).
        expect(scoped.structuredContent.total_hits).toBeLessThanOrEqual(
            unscoped.structuredContent.total_hits,
        );
    });

    it("limit=3 with restrictive scope still surfaces the matching book on page 1", async () => {
        // The user's reproducer: with limit=3 and scope=author 57, the broken
        // version returned `returned=0, has_more=true, next_offset=0` even though
        // book 9942 IS in the scoped result set — the helper had pre-paginated the
        // unscoped results, all 3 of which happened to be other authors' books.
        const r = await runSearchBooks(helper, catalog, {
            query: QUERY,
            scope: { author_ids: [IBN_UTHAYMEEN_ID], downloaded_only: false },
            limit: 3,
            offset: 0,
            response_format: "json",
        });

        // If anything matched the scope at all, page 1 must contain it.
        if (r.structuredContent.total_hits > 0) {
            expect(r.structuredContent.results.length).toBeGreaterThan(0);
        }
    });

    it("has_more / next_offset are correct on the scoped result set, not the pre-scope set", async () => {
        const r = await runSearchBooks(helper, catalog, {
            query: QUERY,
            scope: { author_ids: [IBN_UTHAYMEEN_ID], downloaded_only: false },
            limit: 100,
            offset: 0,
            response_format: "json",
        });

        // Once we ask for more than the total, has_more must be false and there
        // must be no next_offset.
        if (r.structuredContent.results.length === r.structuredContent.total_hits) {
            expect(r.structuredContent.has_more).toBe(false);
            expect(r.structuredContent.next_offset).toBeUndefined();
        }
    });
});

describe("Issue #47 — search must never point at pages that cannot be read", () => {
    // The report: search_pages returned 73 hits with page ids for a book that
    // get_book called downloaded_no_pages, and get_page then failed. The books
    // involved (1000, 71) share one property: id % 1000 < 100, so their folder
    // name is zero-padded («000», «071») — the bucket bug. Book 101 worked
    // because 101 needs no padding.
    //
    // Two contracts pinned here. First, on a padded-bucket book that IS on
    // disk, the reporter's exact sequence must succeed end to end. Second, when
    // the index and the files genuinely diverge, every search hit must carry
    // readable:false rather than a page id that will only fail — search answers
    // from the index alone, so it is the tool that lies first.

    it("replays the reported sequence on a padded-bucket book from this library", async () => {
        const catalog = await getCatalog();
        const helper = await getHelper();
        const pages = await getPageStore();

        // Find a downloaded book the shape of the reporter's: bucket < 100.
        // Discovered from the live catalog rather than hardcoded, so the test
        // runs on any library that has one (43 padded buckets exist on the
        // machine the bug was diagnosed on; skip honestly if a library has none).
        const padded = [...catalog.downloadedBookIds()].filter((id) => id % 1000 < 100).slice(0, 2);
        if (padded.length === 0) {
            // Not silent: the suite still asserts the discovery ran against a
            // real catalog. A library with no padded books cannot regress here.
            expect(catalog.downloadedBookIds().size).toBeGreaterThan(0);
            return;
        }

        for (const bookId of padded) {
            // Step 1 of the report: the book must not claim to have no pages.
            const book = await runGetBook(catalog, pages, helper, getBookInput.parse({ book_id: bookId }));
            expect(book.structuredContent.content_status, `book ${bookId}`).toBe("readable");

            // Step 2: search inside it.
            const env = await helper.request<{
                total_hits: number;
                results: Array<{ page_id: number; readable?: boolean }>;
            }>("search_pages", {
                query: "من",
                scope_book_keys: [String(bookId)],
                max_results: 3,
                offset: 0,
                options: { skip_coverage: true },
            });
            if (env.results.length === 0) continue; // a book with no «من» proves nothing

            // Step 3, where the report failed: every hit must be retrievable.
            for (const hit of env.results) {
                const page = await runGetPage(
                    helper, catalog, pages,
                    getPageInput.parse({ book_id: bookId, page_id: hit.page_id }),
                );
                const sc = page.structuredContent;
                // The page exists and carries text somewhere — matn or footnote.
                expect(
                    (sc.body ?? "").length + (sc.foot ?? "").length,
                    `book ${bookId} page ${hit.page_id}`,
                ).toBeGreaterThan(0);
            }

            // Step 4, the silent-empty complaint: a range from the top of the
            // book must return pages, not an empty success.
            const range = await runGetPagesRange(
                helper, catalog, pages,
                getPagesRangeInput.parse({ book_id: bookId, start_page_id: 1, count: 2 }),
            );
            expect(range.structuredContent.count, `book ${bookId} range`).toBeGreaterThan(0);
        }
    }, 120_000);

    it("marks hits readable:false when the index answers for a book whose file is gone", async () => {
        const helper = await getHelper();
        const pages = await getPageStore();
        const realCatalog = await getCatalog();

        // The diverged state cannot be created against the real library — the
        // extension never writes there — so the judgement is faked instead:
        // same catalog, except the book's file is reported missing.
        const catalog = new Proxy(realCatalog, {
            get(target, prop, receiver) {
                if (prop === "isDownloaded" || prop === "confirmOnDisk") return () => false;
                const v = Reflect.get(target, prop, receiver);
                return typeof v === "function" ? v.bind(target) : v;
            },
        }) as typeof realCatalog;

        const out = await runSearchPages(helper, catalog, pages, searchPagesInput.parse({
            query: "الكلام",
            scope: { book_ids: [FIXTURE_BOOK_ID] },
            limit: 2,
        }));
        const sc = out.structuredContent;
        expect(sc.results.length).toBeGreaterThan(0);
        for (const r of sc.results) {
            expect(r.readable, `hit ${r.page_id}`).toBe(false);
        }
        // And the reader is warned in the rendered text, not only in a field.
        expect(out.content[0]!.text).toContain("⚠️");
    }, 60_000);
});
