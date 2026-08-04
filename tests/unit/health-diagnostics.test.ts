/**
 * Telling a broken search apart from an empty one.
 *
 * A search that returns nothing looks identical whether the word is genuinely
 * absent, the index was never built, or our query never reached the engine.
 * That ambiguity is what let a normalization fault sit unnoticed for three
 * releases: every affected search "succeeded" with zero results. The health
 * tool now reports what the engine holds and runs one query known to match, so
 * the three cases are distinguishable without guessing.
 */

import { describe, it, expect, vi } from "vitest";

import type { Catalog } from "../../src/server/catalog.js";
import type { Helper } from "../../src/server/helper.js";
import type { PageStore } from "../../src/server/pages.js";
import { healthInput, runHealth } from "../../src/server/tools/health.js";

function makeCatalog(downloaded: number[] = [9942]): Catalog {
    const set = new Set(downloaded);
    return {
        bookCount: () => 8593,
        authorCount: () => 3188,
        categoryCount: () => 41,
        downloadedBookIds: () => new Set(set),
        flaggedBookCount: () => set.size,
        flaggedFileMissingIds: () => [],
        orphanFileIds: () => [],
        diskScanFellBack: () => false,
    } as unknown as Catalog;
}

const readablePages = { bookHasContent: vi.fn(async () => true) } as unknown as PageStore;

function makeHelper(over: {
    pageDocs?: number;
    probeHits?: number;
    pingThrows?: boolean;
    probeThrows?: boolean;
}): Helper {
    return {
        ping: vi.fn(async () => {
            if (over.pingThrows) throw new Error("helper did not start");
            return {
                pong: true as const,
                java_version: "21.0.12",
                page_docs: over.pageDocs ?? 1_111_817,
                book_docs: 8593,
                author_docs: 3188,
            };
        }),
        request: vi.fn(async () => {
            if (over.probeThrows) throw new Error("index closed");
            return { total_hits: over.probeHits ?? 25_420 };
        }),
    } as unknown as Helper;
}

const args = healthInput.parse({ response_format: "json" });

describe("health reports the state of the search index", () => {
    it("reports document counts and a probe that matched", async () => {
        const r = await runHealth(makeCatalog(), readablePages, makeHelper({}), args);
        const si = r.structuredContent.search_index!;
        expect(si.page_docs).toBe(1_111_817);
        expect(si.probe_hits).toBe(25_420);
        expect(si.error).toBeNull();
        expect(r.structuredContent.notes.join(" ")).not.toContain("matched nothing");
    });

    it("calls out an index that holds nothing", async () => {
        const r = await runHealth(makeCatalog(), readablePages, makeHelper({ pageDocs: 0 }), args);
        expect(r.structuredContent.notes.join(" | ")).toContain("zero documents");
    });

    it("calls out an index that is open but answers nothing", async () => {
        // The shape of the normalization fault: the engine is fine, our query
        // is what fails to match — and it would otherwise look like an empty
        // library.
        const r = await runHealth(makeCatalog(), readablePages, makeHelper({ probeHits: 0 }), args);
        expect(r.structuredContent.notes.join(" | ")).toContain("matched nothing");
    });

    it("reports a search engine that never answered, without failing the check", async () => {
        const r = await runHealth(makeCatalog(), readablePages, makeHelper({ pingThrows: true }), args);
        expect(r.structuredContent.search_index!.error).toContain("helper did not start");
        expect(r.structuredContent.notes.join(" | ")).toContain("did not respond");
    });

    it("keeps the probe's failure separate from the engine's health", async () => {
        const r = await runHealth(makeCatalog(), readablePages, makeHelper({ probeThrows: true }), args);
        const si = r.structuredContent.search_index!;
        expect(si.page_docs).toBe(1_111_817); // the engine answered
        expect(si.error).toContain("index closed"); // the query did not
    });

    it("still works with no helper at all", async () => {
        const r = await runHealth(makeCatalog(), readablePages, null, args);
        expect(r.structuredContent.search_index).toBeNull();
        expect(r.structuredContent.status).toBe("ok");
    });
});
