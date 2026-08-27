/**
 * Answering "the research needs this book and I cannot find it".
 *
 * An empty search result does not distinguish three very different situations:
 * the book is not in this library, it is not in Shamela at all, or it is one
 * click away in the app. The catalogue knows which — every book Shamela
 * publishes is in it, with a flag for whether it can be downloaded — so the
 * answer is a lookup, and these tests pin what each case must say.
 *
 * The tool is deliberately offline: it composes a link as text and never
 * fetches anything.
 */

import { describe, it, expect } from "vitest";

import type { AuthorRecord, BookRecord, Catalog } from "../../src/server/catalog.js";
import { runSuggestDownload, suggestDownloadInput } from "../../src/server/tools/suggestDownload.js";

const AUTHORS: Record<number, AuthorRecord> = {
    7: { author_id: 7, author_name: "ابن قدامة", death_year: 620, death_text: null },
    8: { author_id: 8, author_name: "الشربيني", death_year: 977, death_text: null },
};

const BOOKS: BookRecord[] = [
    { book_id: 100, book_name: "المغني", main_author: 7, major_online: 1, book_category: 17, book_date: 600 },
    { book_id: 200, book_name: "مغني المحتاج", main_author: 8, major_online: 1, book_category: 16, book_date: 950 },
    { book_id: 300, book_name: "كتاب نادر", main_author: 7, major_online: 0, book_category: 17, book_date: 610 },
].map((b) => b as BookRecord);

function makeCatalog(downloaded: number[] = []): Catalog {
    const set = new Set(downloaded);
    return {
        allBooks: () => BOOKS.values(),
        bookRecord: (id: number) => BOOKS.find((b) => b.book_id === id),
        bookAuthors: (b: BookRecord) => (b.main_author ? [AUTHORS[b.main_author]!] : []),
        categoryPath: (c: number | null) => (c === 17 ? ["الفقه الحنبلي"] : ["الفقه الشافعي"]),
        isDownloaded: (id: number) => set.has(id),
    } as unknown as Catalog;
}

const run = (catalog: Catalog, args: Record<string, unknown>) =>
    runSuggestDownload(catalog, suggestDownloadInput.parse({ response_format: "json", ...args }))
        .structuredContent;

describe("suggest_download", () => {
    it("finds a book by title and marks it downloadable, with its id and page", () => {
        const out = run(makeCatalog(), { query: "مغني المحتاج" });
        expect(out.results).toHaveLength(1);
        expect(out.results[0]!.book_id).toBe(200);
        expect(out.results[0]!.status).toBe("available_to_download");
        expect(out.results[0]!.link).toBe("https://shamela.ws/book/200");
        expect(out.next_steps.join(" ")).toContain("برنامج «المكتبة الشاملة»");
    });

    it("says plainly when a book is in the catalogue but not offered", () => {
        const out = run(makeCatalog(), { book_ids: [300] });
        expect(out.results[0]!.status).toBe("in_catalogue_only");
        // The user has to go elsewhere, and should be told so rather than left
        // waiting for a download that will never appear in the app.
        expect(out.next_steps.join(" ")).toContain("مصادر أخرى");
    });

    it("reports a book already on the machine as needing nothing", () => {
        const out = run(makeCatalog([100]), { book_ids: [100] });
        expect(out.results[0]!.status).toBe("downloaded");
        expect(out.notes.join(" ")).toContain("منزَّلٌ عندك فعلًا");
    });

    it("puts the actionable case first", () => {
        // A downloadable book is the one the reader can do something about, so
        // it leads even when other matches are already downloaded.
        const out = run(makeCatalog([300]), { query: "ابن قدامة" });
        expect(out.results[0]!.status).toBe("available_to_download");
        expect(out.results[0]!.book_id).toBe(100);
    });

    it("finds a title whether or not the asker typed the definite article", () => {
        // Someone looking for «المغني» is not helped by a catalogue that files
        // the book as «مغني المحتاج».
        expect(run(makeCatalog(), { query: "المغني" }).results.map((r) => r.book_id).sort()).toEqual([
            100, 200,
        ]);
    });

    it("is not thrown off by hamza spelling", () => {
        // Same normalization the search tools use, so a remembered spelling
        // does not decide whether a book can be found.
        const out = run(makeCatalog(), { query: "ابن قدامه" });
        expect(out.total).toBeGreaterThan(0);
    });

    it("searches by author too", () => {
        const out = run(makeCatalog(), { query: "ابن قدامة" });
        expect(out.results.map((r) => r.book_id).sort()).toEqual([100, 300]);
    });

    it("says the id is unknown rather than inventing an entry", () => {
        const out = run(makeCatalog(), { book_ids: [999999] });
        expect(out.results).toHaveLength(0);
        expect(out.notes.join(" ")).toContain("ليس في فهرس الشاملة");
    });

    it("suggests how to retry when nothing matched", () => {
        const out = run(makeCatalog(), { query: "لا يوجد هذا الكتاب" });
        expect(out.total).toBe(0);
        expect(out.notes.join(" ")).toContain("تحقَّق من صيغة العنوان");
    });

    it("states that it downloads nothing itself", () => {
        // The extension is read-only and offline; that promise must reach the
        // user in the one tool whose subject is downloading.
        const out = run(makeCatalog(), { query: "المغني" });
        expect(out.notes.join(" ")).toContain("لا تنزِّل شيئًا ولا تتصل بأي خادم");
    });

    it("can be narrowed to a category", () => {
        const out = run(makeCatalog(), { query: "مغني", category_id: 16 });
        expect(out.results.map((r) => r.book_id)).toEqual([200]);
    });
});
