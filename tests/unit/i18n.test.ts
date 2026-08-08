/**
 * The language setting has one job and one failure mode.
 *
 * Its job: a user who reads classical Arabic sources but not modern Arabic
 * interface prose can put the interface in a language they read. Its failure
 * mode: a typo, an unfamiliar tag, or a translation that quietly went missing,
 * leaving somebody with a blank title or an English word in an Arabic sentence.
 *
 * Completeness is already a compile error — every catalogue is typed from the
 * Arabic one — so what is left to check here is the resolution of whatever the
 * user actually typed, and that no translation is empty or untranslated.
 */
import { describe, it, expect, afterEach } from "vitest";

import { ar } from "../../src/server/i18n/ar.js";
import { en } from "../../src/server/i18n/en.js";
import {
    DEFAULT_LANG,
    SUPPORTED_LANGS,
    currentLang,
    messages,
    resetLangForTesting,
    resolveLang,
} from "../../src/server/i18n/index.js";

const CATALOGUES = { ar, en } as const;

describe("language resolution", () => {
    afterEach(() => {
        delete process.env.SHAMELA_LANG;
        resetLangForTesting();
    });

    it("Arabic is the default, and the default is Arabic", () => {
        expect(DEFAULT_LANG).toBe("ar");
        expect(resolveLang(undefined)).toBe("ar");
        expect(resolveLang(null)).toBe("ar");
        expect(resolveLang("")).toBe("ar");
    });

    it("reads a language tag the way a person writes it", () => {
        for (const raw of ["en", "EN", " en ", "en-US", "en_GB", "eng", "En-us"]) {
            expect(resolveLang(raw), `resolveLang(${JSON.stringify(raw)})`).toBe("en");
        }
        for (const raw of ["ar", "AR", "ar-SA", "ara", " ar "]) {
            expect(resolveLang(raw), `resolveLang(${JSON.stringify(raw)})`).toBe("ar");
        }
    });

    it("falls back to Arabic rather than failing on a language we do not carry", () => {
        // A mistyped or unsupported setting must leave a working extension, not
        // an error about a field the user did not know existed.
        for (const raw of ["fr", "zz", "klingon", "e n", "123"]) {
            expect(resolveLang(raw)).toBe("ar");
        }
    });

    it("takes the language from SHAMELA_LANG, once", () => {
        process.env.SHAMELA_LANG = "en";
        resetLangForTesting();
        expect(currentLang()).toBe("en");
        expect(messages().toolTitles.shamela_get_page).toBe(en.toolTitles.shamela_get_page);

        // Changing it mid-process must NOT take effect: the server registered
        // its tool titles at startup, and a catalogue that changed underneath
        // them would describe tools in one language and title them in another.
        process.env.SHAMELA_LANG = "ar";
        expect(currentLang()).toBe("en");
    });
});

describe("catalogue completeness", () => {
    it("every supported language has a catalogue", () => {
        for (const lang of SUPPORTED_LANGS) {
            expect(CATALOGUES[lang], `catalogue for ${lang}`).toBeDefined();
        }
        expect(SUPPORTED_LANGS).toContain("ar");
    });

    it("no translated string is empty", () => {
        for (const lang of SUPPORTED_LANGS) {
            const m = messages(lang);
            expect(m.instructions.trim().length, `${lang}.instructions`).toBeGreaterThan(200);
            expect(m.schemaDoc.trim().length, `${lang}.schemaDoc`).toBeGreaterThan(50);
            for (const [tool, title] of Object.entries(m.toolTitles)) {
                expect(title.trim().length, `${lang}.toolTitles.${tool}`).toBeGreaterThan(0);
            }
            for (const [res, v] of Object.entries(m.resources)) {
                expect(v.title.trim().length, `${lang}.resources.${res}.title`).toBeGreaterThan(0);
                expect(v.description.trim().length, `${lang}.resources.${res}.description`).toBeGreaterThan(0);
            }
        }
    });

    it("every catalogue covers the same tools and resources", () => {
        const toolKeys = Object.keys(ar.toolTitles).sort();
        const resourceKeys = Object.keys(ar.resources).sort();
        for (const lang of SUPPORTED_LANGS) {
            const m = messages(lang);
            expect(Object.keys(m.toolTitles).sort(), `${lang} tools`).toEqual(toolKeys);
            expect(Object.keys(m.resources).sort(), `${lang} resources`).toEqual(resourceKeys);
        }
    });

    it("the English catalogue is actually translated, not copied", () => {
        // A copied Arabic title is the failure this catches: it compiles, it is
        // non-empty, and it leaves an English-speaking user exactly where they
        // started.
        const arabic = /[\u0600-\u06FF]/;
        for (const [tool, title] of Object.entries(en.toolTitles)) {
            expect(arabic.test(title), `en.toolTitles.${tool} still Arabic: ${title}`).toBe(false);
        }
        for (const [res, v] of Object.entries(en.resources)) {
            expect(arabic.test(v.title), `en.resources.${res}.title still Arabic`).toBe(false);
            expect(arabic.test(v.description), `en.resources.${res}.description still Arabic`).toBe(false);
        }
        expect(arabic.test(en.instructions)).toBe(false);
        expect(arabic.test(en.errors.bookNotFound(1))).toBe(false);
    });

    it("the Arabic catalogue stays Arabic", () => {
        const arabic = /[\u0600-\u06FF]/;
        for (const [tool, title] of Object.entries(ar.toolTitles)) {
            expect(arabic.test(title), `ar.toolTitles.${tool} is not Arabic: ${title}`).toBe(true);
        }
        expect(arabic.test(ar.instructions)).toBe(true);
    });

    it("errors carry their arguments through in every language", () => {
        for (const lang of SUPPORTED_LANGS) {
            const e = messages(lang).errors;
            expect(e.bookNotFound(9942), `${lang} bookNotFound`).toContain("9942");
            expect(e.pageNotFound(9942, 63), `${lang} pageNotFound`).toContain("63");
            expect(e.titleNotFound(9942, 7), `${lang} titleNotFound`).toContain("7");
            expect(e.serviceKeyNotFound("tafseer", 255), `${lang} serviceKeyNotFound`).toContain("255");
            expect(e.engineTooOld("C:/shamela4"), `${lang} engineTooOld`).toContain("C:/shamela4");
            expect(e.indexNotReady("lock held"), `${lang} indexNotReady`).toContain("lock held");
            expect(e.emptyScope("  book_ids: 0"), `${lang} emptyScope`).toContain("book_ids: 0");
        }
    });
});
