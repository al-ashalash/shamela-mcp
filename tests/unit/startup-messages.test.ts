/**
 * Issue #42 — the one message a broken install actually gets.
 *
 * Everything else the extension says follows the reader's language. These did
 * not: the two layers that resolve paths and launch Java wrote their prose
 * inline, in Arabic, because they run before anything else does — so a reader
 * who had set the extension to English, and whose Shamela install was too old
 * to start, was answered in a language they had told us they do not read,
 * about a setting they could not find.
 *
 * It is the worst place in the codebase for that to happen. Every other
 * message reaches someone whose extension is working.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { resetLangForTesting } from "../../src/server/i18n/index.js";
import { ShamelaNotFoundError, resolveJars, validateInstallRoot } from "../../src/server/paths.js";

const ARABIC = /[\u0600-\u06FF]/;
let root: string;

function inLang<T>(lang: "ar" | "en", fn: () => T): T {
    process.env.SHAMELA_LANG = lang;
    resetLangForTesting();
    try {
        return fn();
    } finally {
        delete process.env.SHAMELA_LANG;
        resetLangForTesting();
    }
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "shamela-startup-"));
});
afterEach(() => {
    try {
        fs.rmSync(root, { recursive: true, force: true });
    } catch {
        /* best-effort */
    }
});

describe("a broken install is explained in the reader's language", () => {
    it("says the library was not found, in each language", () => {
        const probed = [{ path: "C:/nope", source: "common" as const, reason: "x" }];
        const ar = inLang("ar", () => new ShamelaNotFoundError(probed).message);
        const en = inLang("en", () => new ShamelaNotFoundError(probed).message);

        expect(ARABIC.test(ar)).toBe(true);
        expect(ARABIC.test(en)).toBe(false);
        // The probed path is the same characters in both: a bug report needs it
        // verbatim, and it reads the same in every language.
        expect(ar).toContain("C:/nope");
        expect(en).toContain("C:/nope");
    });

    it("gives the reason a path was rejected in each language too", () => {
        // These reasons are printed beside the paths inside the message above,
        // so an untranslated one leaves an Arabic word in an English list.
        const ar = inLang("ar", () => validateInstallRoot(path.join(root, "absent")));
        const en = inLang("en", () => validateInstallRoot(path.join(root, "absent")));
        expect(ar.ok).toBe(false);
        expect(en.ok).toBe(false);
        if (!ar.ok && !en.ok) {
            expect(ARABIC.test(ar.reason)).toBe(true);
            expect(ARABIC.test(en.reason)).toBe(false);
        }
    });

    it("says the search engine folder is missing, in each language", () => {
        fs.mkdirSync(path.join(root, "app"), { recursive: true });
        const message = (lang: "ar" | "en") =>
            inLang(lang, () => {
                try {
                    resolveJars(root);
                    return "";
                } catch (e) {
                    return (e as Error).message;
                }
            });
        const ar = message("ar");
        const en = message("en");
        expect(ar).not.toBe("");
        expect(ARABIC.test(ar)).toBe(true);
        expect(ARABIC.test(en)).toBe(false);
    });

    it("says the engine folder is empty, in each language", () => {
        fs.mkdirSync(path.join(root, "app", "lucene", "2"), { recursive: true });
        const message = (lang: "ar" | "en") =>
            inLang(lang, () => {
                try {
                    resolveJars(root);
                    return "";
                } catch (e) {
                    return (e as Error).message;
                }
            });
        expect(ARABIC.test(message("ar"))).toBe(true);
        expect(ARABIC.test(message("en"))).toBe(false);
    });
});
