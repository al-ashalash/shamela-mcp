/**
 * The matn is the author's; the hashiya is the editor's.
 *
 * shamela_search_hadith searches both and used to collapse them into one
 * unlabelled `snippet`, preferring the body. So a hadith occurring ONLY in an
 * editor's takhrij came back under a snippet of the author's own text, with
 * nothing anywhere saying the words were not his — the one confusion this
 * extension's standing instructions exist to prevent.
 */

import { describe, it, expect, vi } from "vitest";

import type { Catalog } from "../../src/server/catalog.js";
import type { Helper } from "../../src/server/helper.js";
import type { PageStore } from "../../src/server/pages.js";
import type { ServiceStore } from "../../src/server/services.js";
import { resetLangForTesting } from "../../src/server/i18n/index.js";
import { runSearchHadith, searchHadithInput } from "../../src/server/tools/searchHadith.js";

/** One hit whose match is in the FOOTNOTE only — the dangerous shape. */
const FOOT_ONLY = {
    book_id: 9942,
    page_id: 63,
    snippet_body: "",
    snippet_foot: "أخرجه البخاري (١) ومسلم (٢)، وصححه الألباني",
};
/** One hit in the matn only. */
const BODY_ONLY = {
    book_id: 9942,
    page_id: 64,
    snippet_body: "إنما الأعمال بالنيات",
    snippet_foot: "",
};
/** One hit in both. */
const BOTH = {
    book_id: 9942,
    page_id: 65,
    snippet_body: "وقد ورد في الحديث",
    snippet_foot: "انظر: الفتح ١/ ٩",
};

const helper = (results: unknown[]) =>
    ({
        request: vi.fn(async () => ({ total_hits: results.length, results })),
    }) as unknown as Helper;

const catalog = {
    bookRecord: vi.fn(() => ({ book_id: 9942, book_name: "الأصول من علم الأصول" })),
    isDownloaded: vi.fn(() => true),
    confirmOnDisk: vi.fn(() => true),
    mainAuthorName: vi.fn(() => "العثيمين"),
} as unknown as Catalog;

const pages = { getPageServices: vi.fn(async () => ({ hadeeth: [] })) } as unknown as PageStore;
const services = { getBooksForKey: vi.fn(async () => []) } as unknown as ServiceStore;

const run = (results: unknown[], format: "json" | "markdown" = "json") =>
    runSearchHadith(
        helper(results),
        catalog,
        pages,
        services,
        searchHadithInput.parse({ query: "الأعمال بالنيات", response_format: format }),
    );

describe("a hadith found in the hashiya is never shown as the author's words", () => {
    it("keeps the two fields apart in structured output", async () => {
        const r = await run([FOOT_ONLY]);
        const m = r.structuredContent.matches[0]!;
        expect(m.snippet_body).toBe("");
        expect(m.snippet_foot).toContain("أخرجه البخاري");
        expect(m.matched_in).toEqual(["foot"]);
    });

    it("labels the hashiya as the editor's speech in the rendered text", async () => {
        resetLangForTesting();
        const r = await run([FOOT_ONLY], "markdown");
        const md = r.content[0]!.text;
        expect(md).toContain("أخرجه البخاري");
        expect(md).toContain("الحاشية");
        expect(md).toContain("المحقِّق");
        // and it must not be presented under a matn label it did not come from
        expect(md).not.toContain("**المتن:**");
    });

    it("labels a matn hit as the matn", async () => {
        resetLangForTesting();
        const r = await run([BODY_ONLY], "markdown");
        const md = r.content[0]!.text;
        expect(md).toContain("المتن");
        expect(md).toContain("إنما الأعمال بالنيات");
        expect(md).not.toContain("الحاشية (كلام المحقِّق");
    });

    it("shows both when both matched, each under its own label", async () => {
        resetLangForTesting();
        const r = await run([BOTH]);
        const m = r.structuredContent.matches[0]!;
        expect(m.matched_in).toEqual(["body", "foot"]);
        const md = (await run([BOTH], "markdown")).content[0]!.text;
        expect(md).toContain("وقد ورد في الحديث");
        expect(md).toContain("انظر: الفتح");
    });

    it("says it in English too", async () => {
        process.env.SHAMELA_LANG = "en";
        resetLangForTesting();
        try {
            const md = (await run([FOOT_ONLY], "markdown")).content[0]!.text;
            expect(md).toContain("Hashiya");
            expect(md).toContain("not the author");
        } finally {
            delete process.env.SHAMELA_LANG;
            resetLangForTesting();
        }
    });
});
