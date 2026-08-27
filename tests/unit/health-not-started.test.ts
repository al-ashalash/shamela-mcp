/**
 * Issue #42 — an install Shamela never upgraded to app/lucene/2 fails at
 * startup, and before this every tool returned that same error, shamela_health
 * among them. The user was told "it does not work" thirty-two times with no way
 * to find out what was wrong on their machine.
 *
 * A unit test, not an integration one, and deliberately so: the state being
 * pinned is one this machine cannot be in — its Shamela is current. What has to
 * hold is that runHealth ANSWERS when handed a failure instead of a backend, in
 * both languages, and that it does not report an empty library when the truth
 * is an unreachable engine.
 */
import { describe, it, expect, afterEach } from "vitest";

import { runHealth, healthInput } from "../../src/server/tools/health.js";
import { engineTooOld } from "../../src/server/errors.js";
import { resetLangForTesting } from "../../src/server/i18n/index.js";

const args = healthInput.parse({});

describe("shamela_health when the extension never started (#42)", () => {
    afterEach(() => {
        delete process.env.SHAMELA_LANG;
        resetLangForTesting();
    });

    it("answers instead of failing with everything else", async () => {
        const r = await runHealth(null, null, null, null, args, {
            startupError: engineTooOld("C:/shamela4"),
            paths: { installRoot: "C:/shamela4" },
        });
        const sc = r.structuredContent;
        expect(sc.status).toBe("not_started");
        expect(sc.startup_error?.code).toBe("ENGINE_TOO_OLD");
        expect(sc.startup_error?.install_root).toBe("C:/shamela4");
        // The message must name the step the user has to take, not just fail.
        expect(sc.startup_error?.message.length).toBeGreaterThan(20);
        // And the rendered text must carry it, not only the structured field.
        expect(r.content[0]!.text).toContain("C:/shamela4");
    });

    it("does not report an empty library when the library is fine", async () => {
        // The misreading this tool exists to prevent: zero books looks like
        // "your library is empty" when the truth is "the engine did not start".
        const catalog = {
            bookCount: () => 8593,
            authorCount: () => 3188,
            categoryCount: () => 41,
            downloadedBookIds: () => new Set([1, 2, 3]),
        } as never;
        const r = await runHealth(catalog, null, null, null, args, {
            startupError: engineTooOld("D:/shamela4"),
            paths: { installRoot: "D:/shamela4" },
        });
        const sc = r.structuredContent;
        expect(sc.catalog_books).toBe(8593);
        expect(sc.downloaded_books).toBe(3);
        // Engine-derived figures are absent, not zeroed.
        expect(sc.search_index).toBeNull();
        expect(sc.readable_spot_check).toBeNull();
        // The reader is told where the fault is.
        expect(r.content[0]!.text).toMatch(/محرك البحث|search engine/);
    });

    it("reports in the reader's language", async () => {
        for (const [lang, needle] of [["ar", "الإضافة لم تبدأ"], ["en", "The extension did not start"]] as const) {
            process.env.SHAMELA_LANG = lang;
            resetLangForTesting();
            const r = await runHealth(null, null, null, null, args, {
                startupError: engineTooOld("C:/shamela4"),
                paths: { installRoot: "C:/shamela4" },
            });
            expect(r.content[0]!.text, lang).toContain(needle);
        }
    });

    it("still answers when even the catalogue could not be opened", async () => {
        const r = await runHealth(null, null, null, null, args, {
            startupError: new Error("SHAMELA_NOT_FOUND: probed 7 locations"),
            paths: null,
        });
        expect(r.structuredContent.status).toBe("not_started");
        expect(r.structuredContent.startup_error?.install_root).toBeNull();
        expect(r.content[0]!.text).toMatch(/مسار مجلد الشاملة|Shamela folder path/);
    });
});
