/**
 * Checking quotations against the real library.
 *
 * Every fixture below is lifted from the page it is then checked against, so
 * the test cannot drift from the edition: the quotation IS the page's own
 * sentence, and what is asserted is the verdict the tool returns about it.
 *
 * The cases are the ways a citation actually fails in practice, in the order
 * they are met: right; right but respelled; right but the number given was the
 * printed one; right in substance and wrong in wording; on the page but in the
 * editor's footnote rather than the author's text; and absent.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { runVerifyQuote, verifyQuoteInput } from "../../src/server/tools/verifyQuote.js";
import { FIXTURE_BOOK_ID, getBackend } from "../fixtures/shared.js";

let backend: Awaited<ReturnType<typeof getBackend>>;

/** Page 63 of the fixture book — «القياس» — and page 64, which has footnotes. */
const PAGE = 63;
const FOOTNOTE_PAGE = 64;

let body = "";
let foot = "";

beforeAll(async () => {
    backend = await getBackend();
    const batch = await backend.helper.request<{
        results: Array<{ page_id: number; found: boolean; body: string; foot: string }>;
    }>("get_pages_batch", { book_id: FIXTURE_BOOK_ID, page_ids: [PAGE, FOOTNOTE_PAGE] });
    const clean = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    body = clean(batch.results.find((p) => p.page_id === PAGE)?.body ?? "");
    foot = clean(batch.results.find((p) => p.page_id === FOOTNOTE_PAGE)?.foot ?? "");
    expect(body.length, "fixture page 63 must have text").toBeGreaterThan(200);
    expect(foot.length, "fixture page 64 must have a footnote").toBeGreaterThan(60);
}, 120_000);

/** `count` consecutive words of a page, from word `from`. */
function run(text: string, count: number, from: number): string {
    return text.split(" ").filter(Boolean).slice(from, from + count).join(" ");
}

const verify = (args: Record<string, unknown>) =>
    runVerifyQuote(
        backend.helper,
        backend.catalog,
        backend.pages,
        verifyQuoteInput.parse({ response_format: "json", ...args }),
    ).then((r) => r.structuredContent);

describe("a quotation that is exactly right", () => {
    it("says so, and says where on the page it sits", async () => {
        const out = await verify({ quote: run(body, 6, 5), book_id: FIXTURE_BOOK_ID, page_id: PAGE });
        expect(out.status).toBe("verbatim");
        expect(out.checked).toBe("claimed_page");
        expect(out.locations).toHaveLength(1);
        expect(out.locations[0]!.field).toBe("body");
        expect(out.locations[0]!.differences).toEqual([]);
        expect(out.locations[0]!.matched_words).toBe(out.locations[0]!.quote_words);
    }, 120_000);

    it("carries a link that opens the page it just confirmed", async () => {
        const out = await verify({ quote: run(body, 6, 5), book_id: FIXTURE_BOOK_ID, page_id: PAGE });
        expect(out.locations[0]!.source_url).toBe(`https://shamela.ws/book/${FIXTURE_BOOK_ID}/${PAGE}`);
    }, 120_000);

    it("admits what «letter for letter» sets aside", async () => {
        // Tatweel and run-together whitespace are folded even at the strictest
        // setting. Saying «verbatim» without saying that would overclaim.
        const out = await verify({ quote: run(body, 6, 5), book_id: FIXTURE_BOOK_ID, page_id: PAGE });
        expect(out.notes.join(" ")).toMatch(/التطويل|tatweel/);
    }, 120_000);
});

describe("a quotation that is right but respelled", () => {
    it("names the diacritics as the difference, rather than reporting «differs»", async () => {
        const withTashkeel = run(body, 7, 3);
        const bare = withTashkeel.replace(/[ً-ْٰ]/g, "");
        if (bare === withTashkeel) {
            console.warn("skipped: this stretch of the fixture page carries no tashkeel");
            return;
        }
        const out = await verify({ quote: bare, book_id: FIXTURE_BOOK_ID, page_id: PAGE });
        expect(out.status).toBe("differs");
        expect(out.locations[0]!.differences).toEqual(["diacritics"]);
        // Still the whole quotation — only its spelling moved.
        expect(out.locations[0]!.matched_words).toBe(out.locations[0]!.quote_words);
    }, 120_000);
});

describe("a quotation whose page number was the printed one", () => {
    it("finds the page the edition prints under that number, and says which is which", async () => {
        const printed = await backend.pages.printedPage(FIXTURE_BOOK_ID, PAGE);
        const asNumber = Number(String(printed).replace(/\D/g, ""));
        expect(asNumber, "fixture page must have a printed number").toBeGreaterThan(0);
        expect(asNumber, "and it must differ from the page id, or this proves nothing").not.toBe(PAGE);

        const out = await verify({ quote: run(body, 6, 5), book_id: FIXTURE_BOOK_ID, page_id: asNumber });
        expect(out.printed_page_confusion).toBeDefined();
        expect(out.printed_page_confusion!.given).toBe(asNumber);
        expect(out.printed_page_confusion!.page_ids).toContain(PAGE);
        expect(out.status).toBe("verbatim");
    }, 120_000);
});

describe("a quotation carried by memory", () => {
    it("reports how much of it the page carries, and quotes the page back", async () => {
        const opening = run(body, 4, 5);
        const drifted = `${opening} بين الفرع والأصل في الحكم عند الأصوليين`;
        const out = await verify({ quote: drifted, book_id: FIXTURE_BOOK_ID });
        // «partial», never «differs»: four of eleven words is not the book
        // saying the same thing another way.
        expect(out.status).toBe("partial");
        const found = out.locations.find((l) => l.page_id === PAGE);
        expect(found, "the page the opening came from must be among them").toBeDefined();
        expect(found!.differences).toEqual(["wording"]);
        expect(found!.matched_words).toBeGreaterThanOrEqual(4);
        expect(found!.matched_words).toBeLessThan(found!.quote_words);
        // The excerpt is the PAGE's wording, which is the thing to compare against.
        expect(found!.snippet.length).toBeGreaterThan(20);
        expect(out.notes.join(" ")).toMatch(/بالمعنى|by sense/);
    }, 120_000);

    it("finds it library-wide too, not only when the book is named", async () => {
        const drifted = `${run(body, 4, 5)} بين الفرع والأصل في الحكم عند الأصوليين`;
        const out = await verify({ quote: drifted });
        expect(out.checked).toBe("library");
        expect(out.locations.some((l) => l.book_id === FIXTURE_BOOK_ID)).toBe(true);
    }, 120_000);
});

describe("a quotation that is the editor speaking", () => {
    it("says it is in the hashiya, and warns against crediting the author", async () => {
        const out = await verify({
            quote: run(foot, 6, 2),
            book_id: FIXTURE_BOOK_ID,
            page_id: FOOTNOTE_PAGE,
        });
        expect(out.locations.length).toBeGreaterThan(0);
        expect(out.locations[0]!.field).toBe("foot");
        expect(out.notes.join(" ")).toMatch(/الحاشية|footnote/);
    }, 120_000);
});

describe("a quotation that is not there", () => {
    it("says nothing was found, and says what was looked at", async () => {
        // Nonsense words only. An earlier fixture ended «في كتاب من الكتب»,
        // which is on eleven real pages — so the tool truthfully reported a
        // partial hit for a sentence nobody ever wrote, and the fixture, not
        // the tool, was what had to change.
        const out = await verify({ quote: "زقنطورية مباركة بلمبلنسكية زوطرية غندقانية" });
        expect(out.status).toBe("not_found");
        expect(out.locations).toEqual([]);
        expect(out.searched.books).toBeGreaterThan(0);
        expect(out.searched.books).toBe(out.searched.downloaded_total);
        expect(out.suggestions?.length).toBeGreaterThan(0);
    }, 120_000);

    it("reports a fragment that IS real as partial, not as the quotation", async () => {
        // Half a fabricated sentence can still be a real Arabic phrase — this
        // one ends on eleven genuine pages. The tool must say which half.
        const out = await verify({ quote: "زقنطورية مباركة لا توجد في كتاب من الكتب" });
        expect(out.status).toBe("partial");
        expect(out.locations[0]!.matched_words).toBeLessThan(out.locations[0]!.quote_words);
        expect(out.notes.join(" ")).toMatch(/بعضه|part of the quotation/);
    }, 120_000);

    it("refuses to call it absent when the book credited is not on this machine", async () => {
        const undownloaded = [...backend.catalog.allBooks()].find(
            (b) => !backend.catalog.isDownloaded(b.book_id),
        );
        expect(undownloaded, "this machine must hold at least one undownloaded book").toBeDefined();
        const out = await verify({ quote: run(body, 6, 5), book_id: undownloaded!.book_id });
        // Not «not_found»: nothing was opened, and an absence would be a claim
        // about a book we do not hold.
        expect(out.status).toBe("unverifiable");
        expect(out.checked).toBe("nothing");
        expect(out.claim!.downloaded).toBe(false);
        expect(out.locations).toEqual([]);
    }, 120_000);
});

describe("what the reader is shown, not only what the payload holds", () => {
    it("puts the verdict in the rendered text", async () => {
        const r = await runVerifyQuote(
            backend.helper,
            backend.catalog,
            backend.pages,
            verifyQuoteInput.parse({ quote: run(body, 6, 5), book_id: FIXTURE_BOOK_ID, page_id: PAGE }),
        );
        const text = r.content[0]!.text;
        expect(text).toMatch(/ثابتٌ بحروفه|letter for letter/);
        expect(text).toMatch(/في المتن|in the matn/);
        expect(text).toContain(`https://shamela.ws/book/${FIXTURE_BOOK_ID}/${PAGE}`);
    }, 120_000);

    it("puts the page-number confusion in the rendered text, where it cannot be missed", async () => {
        const printed = Number(String(await backend.pages.printedPage(FIXTURE_BOOK_ID, PAGE)).replace(/\D/g, ""));
        const r = await runVerifyQuote(
            backend.helper,
            backend.catalog,
            backend.pages,
            verifyQuoteInput.parse({ quote: run(body, 6, 5), book_id: FIXTURE_BOOK_ID, page_id: printed }),
        );
        expect(r.content[0]!.text).toMatch(/رقمُ الصفحة المطبوعة|PRINTED page number/);
    }, 120_000);
});
