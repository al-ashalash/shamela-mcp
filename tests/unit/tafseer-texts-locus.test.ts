/**
 * Where the tafsir text tool is allowed to get a page from.
 *
 * It used to read only Shamela's curated table, so a shelf of thirty tafsirs
 * yielded text from five. It now also uses the index built from each book's own
 * chapter markers — and the thing that must not slip is the accounting: which
 * index placed a text, and the refusal to fetch anything for a verse that could
 * not be placed at all. Fetching "the page a book probably discusses this verse
 * on" is precisely the fabrication this tool exists to avoid.
 */

import { describe, it, expect, vi } from "vitest";

import type { Catalog } from "../../src/server/catalog.js";
import type { Helper } from "../../src/server/helper.js";
import type { PageStore } from "../../src/server/pages.js";
import type { ServiceStore } from "../../src/server/services.js";
import { getTafseerTextsInput, runGetTafseerTexts } from "../../src/server/tools/getTafseerTexts.js";
import type { AyaIndexStore } from "../../src/server/ayaIndex/store.js";
import type { BookAyaIndex } from "../../src/server/ayaIndex/build.js";

const AYAT_AL_KURSI = { surah: 2, aya: 255 };

function makeCatalog(downloaded: number[]): Catalog {
    const set = new Set(downloaded);
    return {
        bookRecord: (id: number) => ({ book_id: id, book_name: `كتاب ${id}`, main_author: null }),
        authorRecord: () => undefined,
        mainAuthorName: () => null,
        isDownloaded: (id: number) => set.has(id),
        booksInCategory: (cid: number) => (cid === 3 ? downloaded : []),
    } as unknown as Catalog;
}

/** A service table that places the verse only in the books listed. */
function makeServices(covers: Array<{ book_id: number; page_id: number }>): ServiceStore {
    return {
        getBooksForKey: vi.fn(async () => covers),
        listInService: vi.fn(async () => covers.map((c) => c.book_id)),
    } as unknown as ServiceStore;
}

const helper = {
    request: vi.fn(async (_cmd: string, args: Record<string, unknown>) => ({
        book_id: args.book_id,
        results: [{ page_id: (args.page_ids as number[])[0], found: true, body: "نص التفسير", foot: "", comment: "" }],
    })),
} as unknown as Helper;

const pages = {
    printedPage: vi.fn(async () => "1/ 10"),
    pageCount: vi.fn(async () => 500),
    // No titles on the page, so no marker is found and the page comes back
    // whole — which is what these tests are about. The slicing itself has its
    // own suite in aya-slice.test.ts.
    allTitleRows: vi.fn(async () => []),
} as unknown as PageStore;

/** An index store that places the verse on a fixed page for the given books. */
function makeAyaIndex(placed: Record<number, { page: number; group?: boolean }>): AyaIndexStore {
    const index = (page: number, group: boolean): BookAyaIndex =>
        ({
            confidence: "high",
            coverage: { ayat: 6236, pct: 100 },
            granularity: group ? { "2": "group" } : {},
            ranges: {},
            pages: Object.assign(new Array(6236).fill(0), { 261: page }),
            titles: Object.assign(new Array(6236).fill(0), { 261: 99 }),
        }) as unknown as BookAyaIndex;
    return {
        resetBudget: vi.fn(),
        get: vi.fn(async (_h: Helper, id: number) =>
            placed[id]
                ? { state: "ready" as const, index: index(placed[id]!.page, placed[id]!.group ?? false) }
                : { state: "ready" as const, index: index(0, false) },
        ),
    } as unknown as AyaIndexStore;
}

const run = (catalog: Catalog, services: ServiceStore, ayaIndex: AyaIndexStore | null, extra = {}) =>
    runGetTafseerTexts(
        helper,
        catalog,
        services,
        pages,
        ayaIndex,
        getTafseerTextsInput.parse({ ...AYAT_AL_KURSI, response_format: "json", max_sources: 10, ...extra }),
    ).then((r) => r.structuredContent);

/** The same call, but keeping the rendered markdown a reader would actually see. */
const render = (catalog: Catalog, services: ServiceStore, ayaIndex: AyaIndexStore | null, extra = {}) =>
    runGetTafseerTexts(
        helper,
        catalog,
        services,
        pages,
        ayaIndex,
        getTafseerTextsInput.parse({ ...AYAT_AL_KURSI, max_sources: 10, ...extra }),
    ).then((r) => r.content[0]!.text);

describe("tafseer texts: where a page may come from", () => {
    it("uses the books' own markers for what Shamela's table does not cover", async () => {
        const out = await run(
            makeCatalog([10, 20, 30]),
            makeServices([{ book_id: 10, page_id: 100 }]),
            makeAyaIndex({ 20: { page: 337 }, 30: { page: 509 } }),
        );
        expect(out.total_indexed).toBe(3);
        expect(out.total_from_service).toBe(1);
        expect(out.total_from_titles).toBe(2);
        expect(out.sources.map((s) => s.book_id).sort()).toEqual([10, 20, 30]);
    });

    it("says which index placed each text", async () => {
        const out = await run(
            makeCatalog([10, 20]),
            makeServices([{ book_id: 10, page_id: 100 }]),
            makeAyaIndex({ 20: { page: 337 } }),
        );
        const byId = new Map(out.sources.map((s) => [s.book_id, s]));
        expect(byId.get(10)!.status).toBe("ok");
        expect(byId.get(10)!.locus_source).toBe("service");
        expect(byId.get(20)!.status).toBe("ok_titles");
        expect(byId.get(20)!.locus_source).toBe("titles");
        expect(byId.get(20)!.confidence).toBe("high");
    });

    it("puts Shamela's own placements first", async () => {
        // Their data about their books outranks our reading of a chapter title.
        const out = await run(
            makeCatalog([10, 20]),
            makeServices([{ book_id: 20, page_id: 100 }]),
            makeAyaIndex({ 10: { page: 337 } }),
        );
        expect(out.sources[0]!.book_id).toBe(20);
    });

    it("marks a marker that covers a group of verses rather than this one", async () => {
        const out = await run(makeCatalog([20]), makeServices([]), makeAyaIndex({ 20: { page: 337, group: true } }));
        expect(out.sources[0]!.status).toBe("ok_group");
        expect(out.sources[0]!.note).toContain("مجموعة آيات");
    });

    it("fetches nothing for a book where the verse could not be placed", async () => {
        // The whole point: no page is better than a plausible wrong one.
        const out = await run(makeCatalog([10]), makeServices([]), makeAyaIndex({}), { book_ids: [10] });
        expect(out.sources).toHaveLength(1);
        expect(out.sources[0]!.text).toBe("");
        expect(out.sources[0]!.page_id).toBeNull();
        expect(out.sources[0]!.note).toContain("ليس ذلك دليلًا على خلوّه");
    });

    it("still works with no index store at all", async () => {
        const out = await run(makeCatalog([10]), makeServices([{ book_id: 10, page_id: 100 }]), null);
        expect(out.sources[0]!.status).toBe("ok");
        expect(out.total_from_titles).toBe(0);
    });
});

describe("tafseer texts: the reader sees every text that was fetched", () => {
    // Three statuses mean a page was fetched — one for Shamela's own table and
    // two for the books' own markers — and the renderer printed only the first.
    // So the books this release added came out as a heading, an author line and
    // a note, with the commentary missing: present in the structured output,
    // absent from what a person reads. The structured assertions above all
    // passed throughout, which is why this test looks at the markdown.
    it("prints the commentary for a book placed by its own chapter markers", async () => {
        const md = await render(
            makeCatalog([20]),
            makeServices([]),
            makeAyaIndex({ 20: { page: 337 } }),
        );
        expect(md).toContain("نص التفسير");
        expect(md).toContain("page_id=337");
    });

    it("prints it for a marker covering a group of verses too", async () => {
        const md = await render(
            makeCatalog([30]),
            makeServices([]),
            makeAyaIndex({ 30: { page: 509, group: true } }),
        );
        expect(md).toContain("نص التفسير");
        expect(md).toContain("page_id=509");
    });

    // The release notes promise that «كل نصٍّ يُجلب يقول بأيّ الفهرسين وُضِع».
    // It did not: status, locus_source and confidence lived in
    // structuredContent alone, so a curated placement and a heading-derived one
    // arrived as the same sentence with a different id in it. A placement the
    // reader cannot weigh is a placement taken on trust.
    it("says which index placed a text, on the surface the reader reads", async () => {
        const curated = await render(
            makeCatalog([10]),
            makeServices([{ book_id: 10, page_id: 100 }]),
            null,
        );
        // The per-source line, not the header note — which names both indexes
        // generically and attributes neither text, which was the whole defect.
        expect(curated).toContain("`الموضع من فهرس الشاملة المنتقى.`");
        expect(curated).not.toContain("`الموضع من عناوين الكتاب");

        const fromTitles = await render(
            makeCatalog([20]),
            makeServices([]),
            makeAyaIndex({ 20: { page: 337 } }),
        );
        expect(fromTitles).toContain("`الموضع من عناوين الكتاب نفسه — ثقة عالية.`");
        expect(fromTitles).not.toContain("`الموضع من فهرس الشاملة المنتقى.`");
    });

    it("says on that surface when the marker covered a group of verses", async () => {
        const md = await render(
            makeCatalog([30]),
            makeServices([]),
            makeAyaIndex({ 30: { page: 509, group: true } }),
        );
        expect(md).toContain("يغطي مجموعة آيات");
    });

    it("prints nothing for a book the verse could not be placed in", async () => {
        // The refusal this tool exists for: no locus, no text, and no page id
        // invented to stand in for one.
        const md = await render(makeCatalog([40]), makeServices([]), makeAyaIndex({}));
        expect(md).not.toContain("نص التفسير");
        expect(md).not.toContain("page_id=");
    });
});
