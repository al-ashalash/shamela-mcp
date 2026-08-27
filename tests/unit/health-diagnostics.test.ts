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
import { resetLangForTesting } from "../../src/server/i18n/index.js";
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

/**
 * The distinctive words of each note, per language.
 *
 * The notes used to be English literals, so these assertions passed under the
 * default Arabic by matching text no Arabic reader would ever see. Asserting a
 * language explicitly is what makes them mean anything: each case now proves
 * both that the note fires and that it fires in the reader's language.
 */
const NOTE = {
    ar: { indexEmpty: "بلا وثائق", probeNoHits: "لم تطابق شيئًا", engineDown: "لم يستجب" },
    en: { indexEmpty: "zero documents", probeNoHits: "matched nothing", engineDown: "did not respond" },
} as const;
const LANGS = ["ar", "en"] as const;

async function inLang<T>(lang: (typeof LANGS)[number], fn: () => Promise<T>): Promise<T> {
    process.env.SHAMELA_LANG = lang;
    resetLangForTesting();
    try {
        return await fn();
    } finally {
        delete process.env.SHAMELA_LANG;
        resetLangForTesting();
    }
}

describe("health reports the state of the search index", () => {
    it("reports document counts and a probe that matched", async () => {
        for (const lang of LANGS) {
            const r = await inLang(lang, () =>
                runHealth(makeCatalog(), readablePages, makeHelper({}), null, args),
            );
            const si = r.structuredContent.search_index!;
            expect(si.page_docs).toBe(1_111_817);
            expect(si.probe_hits).toBe(25_420);
            expect(si.error).toBeNull();
            expect(r.structuredContent.notes.join(" "), lang).not.toContain(NOTE[lang].probeNoHits);
        }
    });

    it("calls out an index that holds nothing", async () => {
        for (const lang of LANGS) {
            const r = await inLang(lang, () =>
                runHealth(makeCatalog(), readablePages, makeHelper({ pageDocs: 0 }), null, args),
            );
            expect(r.structuredContent.notes.join(" | "), lang).toContain(NOTE[lang].indexEmpty);
        }
    });

    it("calls out an index that is open but answers nothing", async () => {
        // The shape of the normalization fault: the engine is fine, our query
        // is what fails to match — and it would otherwise look like an empty
        // library.
        for (const lang of LANGS) {
            const r = await inLang(lang, () =>
                runHealth(makeCatalog(), readablePages, makeHelper({ probeHits: 0 }), null, args),
            );
            expect(r.structuredContent.notes.join(" | "), lang).toContain(NOTE[lang].probeNoHits);
        }
    });

    it("reports a search engine that never answered, without failing the check", async () => {
        for (const lang of LANGS) {
            const r = await inLang(lang, () =>
                runHealth(makeCatalog(), readablePages, makeHelper({ pingThrows: true }), null, args),
            );
            // The engine's own message is a diagnostic and stays verbatim in a
            // typed field; the sentence about it is prose and is translated.
            expect(r.structuredContent.search_index!.error).toContain("helper did not start");
            expect(r.structuredContent.notes.join(" | "), lang).toContain(NOTE[lang].engineDown);
        }
    });

    it("keeps the probe's failure separate from the engine's health", async () => {
        const r = await runHealth(makeCatalog(), readablePages, makeHelper({ probeThrows: true }), null, args);
        const si = r.structuredContent.search_index!;
        expect(si.page_docs).toBe(1_111_817); // the engine answered
        expect(si.error).toContain("index closed"); // the query did not
    });

    it("still works with no helper at all", async () => {
        const r = await runHealth(makeCatalog(), readablePages, null, null, args);
        expect(r.structuredContent.search_index).toBeNull();
        expect(r.structuredContent.status).toBe("ok");
    });
});

describe("health says which library answered", () => {
    // The field test that found this: point the settings field at an empty
    // folder, restart — and nothing happens. Resolution rejects the folder,
    // recovers via the registry, and the extension reads the discovered
    // library while the user believes it is reading the one they named. The
    // recovery is right; recovering in silence was the fault. Health is the
    // one surface that can say it, so it must.
    const fakePaths = (rejected: boolean) =>
        ({
            installRoot: "D:\\shamela4",
            installRootSource: rejected ? ("registry" as const) : ("setting" as const),
            ...(rejected
                ? { rejectedSetting: { path: "C:\\empty-folder", reason: "ينقصه المجلد الفرعي database" } }
                : {}),
            database: "D:\\shamela4\\database",
            jre: "",
            jars: [],
            helperJar: "",
            engineGeneration: "2" as const,
        }) as unknown as import("../../src/server/paths.js").ShamelaPaths;

    it("reports the root and its source", async () => {
        const r = await runHealth(makeCatalog(), readablePages, makeHelper({}), null, args, undefined, fakePaths(false));
        expect(r.structuredContent.install_root).toBe("D:\\shamela4");
        expect(r.structuredContent.install_root_source).toBe("setting");
    });

    it("warns, first, when the explicit setting was rejected and another library answered", async () => {
        for (const lang of LANGS) {
            const r = await inLang(lang, () =>
                runHealth(makeCatalog(), readablePages, makeHelper({}), null, args, undefined, fakePaths(true)),
            );
            const notes = r.structuredContent.notes;
            // First: nothing else in the card matters more than "this is not
            // the library you asked for".
            expect(notes[0], lang).toContain("C:\\empty-folder");
            expect(notes[0], lang).toContain("D:\\shamela4");
            // And in the reader's language — the rejection reason itself stays
            // as recorded at startup.
            if (lang === "en") expect(notes[0]).toContain("was rejected");
            else expect(notes[0]).toContain("رُفض");
        }
    });

    it("says nothing of the sort when the setting won or was never given", async () => {
        const r = await runHealth(makeCatalog(), readablePages, makeHelper({}), null, args, undefined, fakePaths(false));
        expect(r.structuredContent.notes.join(" ")).not.toContain("empty-folder");
    });

    it("carries null rather than inventing a root when paths are absent", async () => {
        const r = await runHealth(makeCatalog(), readablePages, makeHelper({}), null, args);
        expect(r.structuredContent.install_root).toBeNull();
        expect(r.structuredContent.install_root_source).toBeNull();
    });
});
