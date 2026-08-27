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
import { runSearchExact, searchExactInput } from "../../src/server/tools/searchExact.js";
import { runSearchHadith, searchHadithInput } from "../../src/server/tools/searchHadith.js";
import { runSearchPages, searchPagesInput } from "../../src/server/tools/searchPages.js";
import { runSearchTitles, searchTitlesInput } from "../../src/server/tools/searchTitles.js";
import { FIXTURE_BOOK_ID, getCatalog, getHelper, getPageStore, getServiceStore } from "../fixtures/shared.js";

/**
 * The real catalogue, except every book's file is reported missing.
 *
 * The diverged state cannot be created against the real library — the extension
 * never writes there — so the judgement is faked instead. Both halves of it:
 * `isDownloaded` is the flag in master.db and `confirmOnDisk` is the filesystem,
 * and a tool that consulted only one of them would still look correct here.
 */
async function missingFileCatalog(): Promise<Catalog> {
    const real = await getCatalog();
    return new Proxy(real, {
        get(target, prop, receiver) {
            if (prop === "isDownloaded" || prop === "confirmOnDisk") return () => false;
            const v = Reflect.get(target, prop, receiver);
            return typeof v === "function" ? v.bind(target) : v;
        },
    }) as Catalog;
}

/**
 * The shape every page-hit renderer owes an unreadable hit: the heading is the
 * hit's name and ends at its page id, and the warning is on the line under it.
 */
function expectWarnedUnderHeadings(text: string, hits: number): void {
    const lines = text.split("\n");
    const headings = lines.filter((l) => l.startsWith("## "));
    expect(headings.length).toBe(hits);
    for (const h of headings) {
        expect(h, h).not.toContain("⚠️");
        expect(h, h).toMatch(/ — page_id=\d+$/);
    }
    expect(lines.filter((l) => l.includes("⚠️")).length).toBe(headings.length);
    for (const [i, l] of lines.entries()) {
        if (l.startsWith("## ")) expect(lines[i + 1], `under ${l}`).toContain("⚠️");
    }
}

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
        const catalog = await missingFileCatalog();

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
        const lines = out.content[0]!.text.split("\n");
        const headings = lines.filter((l) => l.startsWith("## "));
        expect(headings.length).toBe(sc.results.length);

        // A hit's heading is its name and nothing else: it ends at the page id,
        // in Latin digits, with no prose after it. This is the assertion the
        // bare toContain("⚠️") could not make — the warning used to be spliced
        // onto exactly this line and the old test still passed.
        for (const h of headings) {
            expect(h, h).not.toContain("⚠️");
            expect(h, h).toMatch(/ — page_id=\d+$/);
        }

        // Warned once per hit, on the line under the heading, where a reader
        // meets it before quoting anything.
        expect(lines.filter((l) => l.includes("⚠️")).length).toBe(headings.length);
        for (const [i, l] of lines.entries()) {
            if (l.startsWith("## ")) expect(lines[i + 1], `under ${l}`).toContain("⚠️");
        }
    }, 60_000);

    // The flag reached search_pages, search_phrase and search_boolean and
    // stopped there. On one library state, one search warned that a hit could
    // not be opened and another returned the same hit in silence — and the
    // silent one is the one a reader is likeliest to quote from, because it
    // looks like the more precise answer.
    it("marks the same hit readable:false in search_exact, and warns under the heading", async () => {
        const out = await runSearchExact(
            await getHelper(),
            await missingFileCatalog(),
            await getPageStore(),
            searchExactInput.parse({
                query: "الكلام",
                // The tool refuses a search that preserves nothing; hamza is the
                // cheapest distinction to insist on and «الكلام» carries none,
                // so it changes which pages match by nothing at all.
                preserve: { preserve_hamza: true },
                scope: { book_ids: [FIXTURE_BOOK_ID] },
                limit: 2,
            }),
        );
        const sc = out.structuredContent;
        expect(sc.results.length).toBeGreaterThan(0);
        for (const r of sc.results) expect(r.readable, `hit ${r.page_id}`).toBe(false);
        expectWarnedUnderHeadings(out.content[0]!.text, sc.results.length);
    }, 120_000);

    // search_hadith takes no scope — it scans one window of the whole library —
    // so the faked catalogue makes every book unreadable rather than one.
    it("marks the same hit readable:false in search_hadith, and warns under the heading", async () => {
        const out = await runSearchHadith(
            await getHelper(),
            await missingFileCatalog(),
            await getPageStore(),
            await getServiceStore(),
            searchHadithInput.parse({ query: "الكلام", max_pages_scanned: 2, limit: 2 }),
        );
        const sc = out.structuredContent;
        expect(sc.matches.length).toBeGreaterThan(0);
        for (const m of sc.matches) expect(m.readable, `hit ${m.page_id}`).toBe(false);
        expectWarnedUnderHeadings(out.content[0]!.text, sc.matches.length);
    }, 120_000);

    // A title hit is a list item, so its warning is a suffix rather than a line
    // of its own — a bold line beneath a bullet would end the list.
    it("marks a title hit readable:false and warns on the bullet itself", async () => {
        const out = await runSearchTitles(
            await getHelper(),
            await missingFileCatalog(),
            searchTitlesInput.parse({ query: "الأحكام", scope: { book_ids: [FIXTURE_BOOK_ID] }, limit: 3 }),
        );
        const sc = out.structuredContent;
        expect(sc.results.length).toBeGreaterThan(0);
        for (const r of sc.results) expect(r.readable, `title ${r.title_id}`).toBe(false);

        const bullets = out.content[0]!.text.split("\n").filter((l) => l.startsWith("- "));
        expect(bullets.length).toBe(sc.results.length);
        for (const b of bullets) expect(b, b).toContain("⚠️");
    }, 60_000);
});

describe("a search that finds nothing says why it might have", () => {
    // Three statistics and then nothing — including «عرض ٠ ابتداءً من ٠» — left
    // the reader to choose between "this wording is not in the tradition" and
    // "this wording is not in the part of it on my disk". Only the second is
    // ever knowable from here, and it is usually the true one.
    const ABSENT = "زقنطوريةٌ";

    it("offers next steps, download state first, and names the scope it was given", async () => {
        const out = await runSearchPages(await getHelper(), await getCatalog(), await getPageStore(),
            searchPagesInput.parse({ query: ABSENT, scope: { book_ids: [FIXTURE_BOOK_ID] }, limit: 3 }));
        const sc = out.structuredContent;
        expect(sc.total_hits).toBe(0);
        expect(sc.suggestions?.length).toBeGreaterThan(0);
        // Capped: advice longer than the answer is advice a reader skips.
        expect(sc.suggestions!.length).toBeLessThanOrEqual(4);
        expect(sc.suggestions![0]).toContain("shamela_suggest_download");
        expect(sc.suggestions!.join(" ")).toContain("النطاق");
        const text = out.content[0]!.text;
        expect(text).toContain("لا نتائج");
        for (const s of sc.suggestions!) expect(text).toContain(s);
    }, 60_000);

    it("says nothing of the sort when the search actually found something", async () => {
        const out = await runSearchPages(await getHelper(), await getCatalog(), await getPageStore(),
            searchPagesInput.parse({ query: "الكلام", scope: { book_ids: [FIXTURE_BOOK_ID] }, limit: 2 }));
        expect(out.structuredContent.total_hits).toBeGreaterThan(0);
        expect(out.structuredContent.suggestions).toBeUndefined();
        expect(out.content[0]!.text).not.toContain("لا نتائج");
    }, 60_000);

    // The catalogue searches cover every book Shamela knows of, downloaded or
    // not, so the download line would be false comfort there.
    it("does not blame the download state for an empty catalogue search", async () => {
        const out = await runSearchBooks(await getHelper(), await getCatalog(),
            { query: ABSENT, limit: 3, offset: 0, response_format: "json" });
        const sc = out.structuredContent;
        expect(sc.total_hits).toBe(0);
        expect(sc.suggestions?.length).toBeGreaterThan(0);
        expect(sc.suggestions!.join(" ")).not.toContain("shamela_suggest_download");
        expect(sc.suggestions!.join(" ")).toContain("shamela_resolve");
    }, 60_000);
});

describe("paging must end — the five-thousand-row ceiling", () => {
    let helper: Helper;
    let catalog: Catalog;
    let pages: Awaited<ReturnType<typeof getPageStore>>;

    beforeAll(async () => {
        helper = await getHelper();
        catalog = await getCatalog();
        pages = await getPageStore();
    });

    /** Rows a single search will fetch — SearchPages.PAGE_CEILING. */
    const CEILING = 5_000;
    // Frequent enough that the ceiling is actually reachable; the first
    // assertion in each test checks that premise rather than assuming it.
    const COMMON = "قال";

    // has_more and next_offset were computed from the exhaustive total while
    // fetching stopped at the ceiling. Ask for offset 5000 and the answer was
    // zero results, has_more true, and next_offset 5000 — the offset just sent.
    // A caller following next_offset never finished.
    it("at the ceiling, does not hand back the offset it was given", async () => {
        const out = await runSearchPages(helper, catalog, pages, searchPagesInput.parse({
            query: COMMON,
            limit: 100,
            offset: CEILING,
            response_format: "json",
        }));
        const sc = out.structuredContent;
        expect(sc.total_hits).toBeGreaterThan(CEILING);
        expect(sc.returned).toBe(0);
        expect(sc.has_more).toBe(false);
        expect(sc.next_offset).toBeUndefined();
    }, 120_000);

    it("the last reachable page is the last page", async () => {
        const out = await runSearchPages(helper, catalog, pages, searchPagesInput.parse({
            query: COMMON,
            limit: 100,
            offset: CEILING - 50,
            response_format: "json",
        }));
        const sc = out.structuredContent;
        expect(sc.total_hits).toBeGreaterThan(CEILING);
        // Exactly the rows between the offset and the ceiling, and no invitation
        // to ask for more.
        expect(sc.returned).toBe(50);
        expect(sc.has_more).toBe(false);
        expect(sc.next_offset).toBeUndefined();
    }, 120_000);

    // Ending the loop is half the fix. A caller that pages to the ceiling and
    // reads `has_more: false` would otherwise conclude it had seen every match,
    // which is exactly what it has not done.
    it("tells the reader that matches remain past the ceiling", async () => {
        const out = await runSearchPages(helper, catalog, pages, searchPagesInput.parse({
            query: COMMON,
            limit: 100,
            offset: CEILING - 50,
        }));
        expect(out.structuredContent.has_more).toBe(false);
        expect(out.content[0]!.text).toContain("بلغ التصفّح أقصى عمقه");
    }, 120_000);

    it("says nothing of the sort when paging really did reach the end", async () => {
        const out = await runSearchPages(helper, catalog, pages, searchPagesInput.parse({
            query: "الكلام",
            scope: { book_ids: [FIXTURE_BOOK_ID] },
            limit: 100,
        }));
        const sc = out.structuredContent;
        expect(sc.has_more).toBe(false);
        expect(sc.offset + sc.returned).toBe(sc.total_hits);
        expect(out.content[0]!.text).not.toContain("بلغ التصفّح");
    }, 60_000);
});
