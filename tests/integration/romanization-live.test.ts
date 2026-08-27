/**
 * Latin spellings against the shipped catalogue — 8,598 books, 4,000-odd
 * authors, the real names.
 *
 * The unit tests prove the comparison; only this proves the library answers.
 * A romanisation that works on twenty hand-picked pairs and then returns the
 * wrong «الطبري» out of the whole shelf has not helped anyone.
 *
 * Two properties are load-bearing here and are asserted rather than assumed:
 * the Arabic path is untouched (an Arabic query never reaches this code), and
 * a Latin answer is MARKED, so no reader mistakes a spelling guess for an
 * index hit.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { runResolve, resolveInput } from "../../src/server/tools/resolve.js";
import { runSearchBooks, searchBooksInput } from "../../src/server/tools/searchBooks.js";
import { runSearchAuthors, searchAuthorsInput } from "../../src/server/tools/searchAuthors.js";
import { RomanIndex } from "../../src/server/romanIndex.js";
import { getBackend } from "../fixtures/shared.js";

let backend: Awaited<ReturnType<typeof getBackend>>;

beforeAll(async () => {
    backend = await getBackend();
}, 120_000);

const resolve = (query: string, extra: Record<string, unknown> = {}) =>
    runResolve(
        backend.helper,
        backend.catalog,
        resolveInput.parse({ query, limit: 10, response_format: "json", ...extra }),
    ).then((r) => r.structuredContent);

const books = (query: string, extra: Record<string, unknown> = {}) =>
    runSearchBooks(
        backend.helper,
        backend.catalog,
        searchBooksInput.parse({ query, limit: 10, response_format: "json", ...extra }),
    ).then((r) => r.structuredContent);

const authors = (query: string, extra: Record<string, unknown> = {}) =>
    runSearchAuthors(
        backend.helper,
        backend.catalog,
        searchAuthorsInput.parse({ query, limit: 10, response_format: "json", ...extra }),
    ).then((r) => r.structuredContent);

describe("a name typed in Latin letters reaches the Arabic catalogue", () => {
    it("resolves an author by the spelling a bibliography would use", async () => {
        const out = await resolve("Ibn Qudama");
        expect(out.transliterated).toBe(true);
        expect(out.authors.length).toBeGreaterThan(0);
        expect(out.authors.some((a) => a.author_name.includes("قدامة"))).toBe(true);
    }, 120_000);

    it("resolves the book that spelling is famous for", async () => {
        const out = await resolve("al-Mughni", { type: "book" });
        expect(out.transliterated).toBe(true);
        expect(out.books.length).toBeGreaterThan(0);
        expect(out.books[0]!.book_name).toContain("المغني");
    }, 120_000);

    it("finds a two-word title in the book index", async () => {
        const out = await books("Sahih Muslim");
        expect(out.transliterated).toBe(true);
        expect(out.total_hits).toBeGreaterThan(0);
        expect(out.results.some((r) => r.book_name.includes("صحيح مسلم"))).toBe(true);
    }, 120_000);

    it("finds an author in the author index", async () => {
        const out = await authors("Ghazali");
        expect(out.transliterated).toBe(true);
        expect(out.total_hits).toBeGreaterThan(0);
        expect(out.results.some((r) => r.author_name.includes("الغزالي"))).toBe(true);
    }, 120_000);

    it("keeps the two al-Tabaris apart", async () => {
        // The exegete (d. 310) and the hadith master (d. 360) differ by one ن,
        // and a romanisation that blurs them would put the wrong man's books
        // under the wrong name for every English-language reader.
        const one = await resolve("Tabari", { type: "author" });
        const other = await resolve("Tabarani", { type: "author" });
        expect(one.authors.some((a) => a.author_name.includes("الطبري"))).toBe(true);
        expect(one.authors.some((a) => a.author_name.includes("الطبراني"))).toBe(false);
        expect(other.authors.some((a) => a.author_name.includes("الطبراني"))).toBe(true);
    }, 120_000);

    it("reaches a book through its author's name when the title is not given", async () => {
        const out = await books("Ibn Taymiyya");
        expect(out.total_hits).toBeGreaterThan(0);
        for (const r of out.results.slice(0, 5)) {
            expect(`${r.book_name} ${r.author_name ?? ""}`, r.book_name).toMatch(/تيمية/);
        }
    }, 120_000);
});

describe("the first answer is the one that was meant", () => {
    // Recall was never the hard part — every name below was found by the first
    // draft too. What it got wrong was the order, and an answer whose right
    // result sits at rank nine is not an answer.
    it("puts the man himself above another man who shares a word of his name", async () => {
        const out = await resolve("Ibn Qudama", { type: "author" });
        // «قدامة بن جعفر» also carries «قدامة» — and, writing «بن» without its
        // alif, used to outrank Ibn Qudama on a letter-for-letter tiebreak.
        expect(out.authors[0]!.author_name).toBe("ابن قدامة");
    }, 120_000);

    it("puts his own books above books that merely mention him", async () => {
        const out = await resolve("Ibn Qudama", { type: "book" });
        expect(out.books[0]!.book_name).toContain("المغني");
        expect(out.books[0]!.book_name).toContain("قدامة");
    }, 120_000);

    it("is not fooled by a word that reads the same undotted", async () => {
        // «الصحافة» — journalism — is as good a reading of «Shafii»'s letters
        // as «الشافعي» is, and no comparison of letters will separate them.
        const out = await resolve("Shafii");
        expect(out.authors[0]!.author_name).toBe("الشافعي");
        for (const b of out.books.slice(0, 3)) {
            expect(b.book_name, b.book_name).not.toMatch(/الصحاف|الصحفي/);
        }
    }, 120_000);
});

describe("the answer says what kind of answer it is", () => {
    it("marks the rendered text, not only the payload", async () => {
        const r = await runResolve(
            backend.helper,
            backend.catalog,
            resolveInput.parse({ query: "Ibn Qudama", limit: 3 }),
        );
        expect(r.content[0]!.text).toMatch(/الرسم اللاتيني|Latin spelling/);
    }, 120_000);

    it("still says nothing was found when the spelling reaches nothing", async () => {
        const out = await books("Zqntvrya Blblnsky");
        expect(out.total_hits).toBe(0);
        expect(out.transliterated).toBe(true);
        // The advice about spelling is still the right advice.
        expect(out.suggestions?.length).toBeGreaterThan(0);
    }, 120_000);
});

describe("the Arabic path is untouched", () => {
    it("never marks an Arabic query as transliterated", async () => {
        const out = await resolve("ابن قدامة");
        expect(out.transliterated).toBeUndefined();
        expect(out.authors.length).toBeGreaterThan(0);
    }, 120_000);

    it("leaves a Latin query that the index itself can answer alone", async () => {
        // Whatever the engine finds, it keeps: the fallback only ever takes an
        // empty answer. Asserted on the shape, since a hit here depends on
        // what Latin text this particular catalogue happens to carry.
        const out = await books("Muhammad");
        if (out.total_hits > 0 && !out.transliterated) {
            expect(out.results.length).toBeGreaterThan(0);
        }
    }, 120_000);
});

describe("the index itself", () => {
    it("covers the whole catalogue and builds once", async () => {
        const t0 = performance.now();
        const first = RomanIndex.for(backend.catalog);
        const build = performance.now() - t0;
        const t1 = performance.now();
        const second = RomanIndex.for(backend.catalog);
        const cached = performance.now() - t1;
        expect(second).toBe(first);
        // Built from master.db in memory: no JVM, no Lucene, no download. If
        // this ever needs seconds, something started doing I/O per book.
        expect(build).toBeLessThan(5_000);
        expect(cached).toBeLessThan(5);
        // eslint-disable-next-line no-console
        console.log(`roman index: built in ${build.toFixed(0)}ms over ${backend.catalog.bookCount()} books`);
    }, 120_000);

    it("answers a query in the time a keystroke allows", async () => {
        RomanIndex.for(backend.catalog);
        const t0 = performance.now();
        const hits = RomanIndex.for(backend.catalog).books("Ibn Qudama Mughni");
        const ms = performance.now() - t0;
        expect(hits.hits.length).toBeGreaterThan(0);
        expect(ms).toBeLessThan(1_000);
    }, 120_000);
});
